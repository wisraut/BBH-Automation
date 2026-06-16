"""Doctor flow — login DR* + report analysis + notification."""
import re
from datetime import datetime

from psycopg2.extras import RealDictCursor

from core.config import RPT_PATTERN, log
from core.db import get_db
from integrations import dify_client, line_client


def is_doctor(user_id: str) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM doctors WHERE line_uid = %s", (user_id,))
            return cur.fetchone() is not None


def try_register(line_uid: str, hospital_id: str) -> tuple:
    """
    Returns: ('registered', doc) | ('already_me', doc) | ('already_taken', None) | ('not_found', None)
    """
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT doctor_id, name, line_uid FROM doctors WHERE hospital_id = %s",
                (hospital_id.upper(),),
            )
            doc = cur.fetchone()

        if not doc:
            return ("not_found", None)
        if doc["line_uid"] == line_uid:
            return ("already_me", doc)
        if doc["line_uid"] is not None:
            return ("already_taken", None)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE doctors SET line_uid = %s WHERE hospital_id = %s AND line_uid IS NULL",
                (line_uid, hospital_id.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return ("already_taken", None)
        return ("registered", doc)


def _build_patient_context(report_id: str) -> tuple:
    """JOIN ข้อมูลคนไข้ครบชุด → (report_row, context_string)"""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT r.report_id, r.report_text, r.chief_complaint,
                          r.report_source, r.report_date, r.status,
                          p.patient_id, p.name, p.dob, p.sex, p.blood_type
                   FROM reports r
                   JOIN patients p ON r.patient_id = p.patient_id
                   WHERE r.report_id = %s""",
                (report_id,),
            )
            row = cur.fetchone()
            if not row:
                return (None, "")

            patient_id = row["patient_id"]
            cur.execute(
                """SELECT condition_name, status, diagnosed_year, diagnosed_at, notes
                   FROM medical_conditions WHERE patient_id = %s ORDER BY status""",
                (patient_id,),
            )
            conditions = cur.fetchall()
            cur.execute(
                "SELECT allergen, reaction, severity FROM allergies WHERE patient_id = %s",
                (patient_id,),
            )
            allergies = cur.fetchall()
            cur.execute(
                """SELECT drug_name, dose, frequency, indication
                   FROM current_medications WHERE patient_id = %s AND is_active = true""",
                (patient_id,),
            )
            meds = cur.fetchall()

    age_str = "-"
    if row["dob"]:
        age_str = f"{(datetime.now().date() - row['dob']).days // 365} ปี"

    lines = [
        f"=== ข้อมูลผู้ป่วย | {row['report_id']} ===",
        f"ชื่อ: {row['name']}  |  เพศ: {row['sex']}  |  อายุ: {age_str}  |  กรุ๊ปเลือด: {row['blood_type'] or '-'}",
        "",
    ]
    if allergies:
        lines.append("⚠️ ยาแพ้ / สิ่งที่แพ้ (ห้ามสั่งยาเหล่านี้):")
        for a in allergies:
            lines.append(f"  - {a['allergen']} → {a['reaction']} ({a['severity']})")
    else:
        lines.append("⚠️ ยาแพ้: ไม่มีประวัติแพ้ยา")
    lines.append("")
    if conditions:
        lines.append("โรคประจำตัว:")
        for c in conditions:
            note = f" — {c['notes']}" if c["notes"] else ""
            year = c["diagnosed_year"] or "-"
            lines.append(f"  - {c['condition_name']} ({c['status']}, {year}){note}")
    lines.append("")
    if meds:
        lines.append("ยาที่ใช้อยู่ปัจจุบัน:")
        for m in meds:
            lines.append(f"  - {m['drug_name']} {m['dose']} {m['frequency']}  [{m['indication']}]")
    lines += [
        "",
        f"=== ผลการตรวจ ({'เรื่อง: ' + row['chief_complaint'] if row['chief_complaint'] else 'ไม่ระบุ'}) ===",
        f"แหล่งตรวจ: {row['report_source'] or 'ไม่ระบุ'}",
        "",
        row["report_text"] or "ไม่มีข้อมูล",
    ]
    return (dict(row), "\n".join(lines))


def _save_analysis(report_id: str, doctor_id: str, conv_id: str, summary: str) -> None:
    """บันทึกผลวิเคราะห์ + clear lock + audit"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analyses (report_id, dify_conversation_id, summary_text)
                   VALUES (%s, %s, %s)""",
                (report_id, conv_id, summary),
            )
            cur.execute("UPDATE reports SET status = NULL WHERE report_id = %s", (report_id,))
            cur.execute(
                """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                   VALUES (%s, 'doctor', 'analysis_triggered', %s)""",
                (doctor_id, report_id),
            )
            conn.commit()


def _get_doctor_id(line_uid: str) -> str:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id FROM doctors WHERE line_uid = %s", (line_uid,))
            row = cur.fetchone()
    return row[0] if row else line_uid


def notify_new_report(doctor_id: str, patient_name: str, report_id: str) -> None:
    """email_poller callback: แจ้งแพทย์เมื่อ report เข้าใหม่"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT line_uid, name FROM doctors WHERE doctor_id = %s", (doctor_id,))
            row = cur.fetchone()
    if not row or not row[0]:
        log.warning("แพทย์ %s ยังไม่ได้ผูก LINE — ไม่สามารถแจ้งเตือนได้", doctor_id)
        return
    line_uid, doctor_name = row
    text = (
        f"📋 มี Report ใหม่\n"
        f"ผู้ป่วย: {patient_name}\n"
        f"Report: {report_id}\n"
        f"เวลา: {datetime.now().strftime('%d/%m/%Y %H:%M')}\n\n"
        f"กด [🔍 วิเคราะห์] เพื่อเริ่มวิเคราะห์ทันที"
    )
    line_client.push_with_quick_reply(line_uid, text, report_id)
    log.info("แจ้งแพทย์ %s (%s) สำหรับ %s", doctor_name, line_uid[:12], report_id)


def analyze_report(reply_token: str, doctor_line_uid: str, report_id: str) -> None:
    """Pipeline: atomic lock → context → Dify → save → push"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE reports SET status = 'analyzing' WHERE report_id = %s AND status IS NULL",
                (report_id,),
            )
            locked = cur.rowcount == 1
            conn.commit()
    if not locked:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM reports WHERE report_id = %s", (report_id,))
                row = cur.fetchone()
        if not row:
            line_client.reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        else:
            line_client.reply(reply_token, f"⏳ Report #{report_id} กำลังวิเคราะห์อยู่แล้ว\nกรุณารอสักครู่")
        return

    report_row, context = _build_patient_context(report_id)
    if not report_row:
        line_client.reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        return

    try:
        line_client.reply(reply_token, f"🔍 กำลังวิเคราะห์ #{report_id}…\nกรุณารอสักครู่")
    except Exception:
        log.warning("LINE reply failed for %s — วิเคราะห์ต่อ", report_id)

    summary, conv_id = dify_client.ask(doctor_line_uid, context)
    doctor_id = _get_doctor_id(doctor_line_uid)
    try:
        _save_analysis(report_id, doctor_id, conv_id, summary)
    except Exception:
        log.exception("save_analysis failed — resetting lock for %s", report_id)
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE reports SET status = NULL WHERE report_id = %s", (report_id,))
                conn.commit()
        return
    try:
        line_client.push(doctor_line_uid, f"📊 ผลวิเคราะห์ #{report_id}\n\n{summary}")
    except Exception:
        log.error("LINE push failed for %s", report_id)
    log.info("Analysis done — %s by %s", report_id, doctor_id)


def _search_patients(query: str) -> list:
    """ค้นหาคนไข้ด้วยชื่อ — return list[dict]"""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT p.patient_id, p.name,
                          (SELECT report_id FROM reports r
                           WHERE r.patient_id = p.patient_id AND r.status IS NULL
                           ORDER BY r.report_date DESC LIMIT 1) AS latest_report_id,
                          (SELECT status FROM reports r
                           WHERE r.patient_id = p.patient_id
                           ORDER BY r.report_date DESC LIMIT 1) AS latest_status
                   FROM patients p
                   WHERE p.name ILIKE %s
                   ORDER BY p.name LIMIT 10""",
                (f"%{query}%",),
            )
            return [dict(r) for r in cur.fetchall()]


def handle_message(reply_token: str, doctor_line_uid: str, text: str) -> None:
    """Router แพทย์: logout / RPT-ID / ชื่อคนไข้"""
    text_stripped = text.strip()

    if text_stripped.lower() == "logout":
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE doctors SET line_uid = NULL WHERE line_uid = %s RETURNING name",
                    (doctor_line_uid,),
                )
                row = cur.fetchone()
                conn.commit()
        name = row[0] if row else "แพทย์"
        line_client.reply(reply_token, f"👋 ออกจากระบบแล้ว ({name})\nส่งรหัสแพทย์เพื่อเข้าใช้งานอีกครั้ง")
        log.info("Doctor logged out: %s (%s)", name, doctor_line_uid[:12])
        return

    m = RPT_PATTERN.search(text_stripped)
    if m:
        analyze_report(reply_token, doctor_line_uid, m.group(0).upper())
        return

    patients = _search_patients(text_stripped)
    if not patients:
        line_client.reply(
            reply_token,
            f"❌ ไม่พบคนไข้ที่ชื่อ \"{text_stripped}\"\n"
            "ลองพิมพ์ชื่อให้ครบขึ้น หรือระบุ Report ID (RPT-XXXXXXXX-XXXX)",
        )
        return

    if len(patients) == 1:
        p = patients[0]
        if p["latest_status"] == "analyzing":
            line_client.reply(reply_token, f"⏳ {p['name']} — กำลังวิเคราะห์อยู่แล้ว กรุณารอสักครู่")
            return
        if not p["latest_report_id"]:
            line_client.reply(reply_token, f"ℹ️ {p['name']} ยังไม่มี Report ในระบบ")
            return
        analyze_report(reply_token, doctor_line_uid, p["latest_report_id"])
        return

    lines = [f"🔍 พบคนไข้ {len(patients)} คนที่ชื่อคล้ายกัน:\n"]
    for p in patients:
        if p["latest_status"] == "analyzing":
            tag = "⏳ กำลังวิเคราะห์"
        elif p["latest_report_id"]:
            tag = "มี Report"
        else:
            tag = "ยังไม่มี Report"
        lines.append(f"• {p['name']} ({p['patient_id']}) — {tag}")
    lines.append("\nพิมพ์ชื่อให้ครบขึ้น หรือระบุ Report ID (RPT-XXXXXXXX-XXXX)")
    line_client.reply(reply_token, "\n".join(lines))
