import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
import uvicorn
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from dotenv import load_dotenv

import email_poller

load_dotenv()

_REQUIRED_VARS = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ID", "DIFY_API_KEY", "DB_PASSWORD"]
_missing = [v for v in _REQUIRED_VARS if not os.getenv(v)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

# ─── Config ────────────────────────────────────────────────────────────────────
LINE_CHANNEL_ID     = os.getenv("LINE_CHANNEL_ID")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
# Phase 1A — CRO bot LINE channel (optional; ถ้าไม่ตั้งจะ disable /webhook/cro)
LINE_CRO_CHANNEL_ID     = os.getenv("LINE_CRO_CHANNEL_ID", "")
LINE_CRO_CHANNEL_SECRET = os.getenv("LINE_CRO_CHANNEL_SECRET", "")
DIFY_API_URL        = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_API_KEY        = os.getenv("DIFY_API_KEY")
SERVER_PORT         = int(os.getenv("SERVER_PORT", 8000))
NGROK_PUBLIC_URL    = os.getenv("NGROK_PUBLIC_URL", "")

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}

# RPT-YYYYMMDD-XXXX ที่อยู่ในข้อความ (ไม่จำเป็นต้องขึ้นต้น)
RPT_PATTERN = re.compile(r"RPT-\d{8}-\d{4}", re.IGNORECASE)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

_line_token: str = ""
_line_token_expiry: float = 0.0
_cro_token: str = ""
_cro_token_expiry: float = 0.0


# ─── LINE helpers ──────────────────────────────────────────────────────────────

def _get_line_token() -> str:
    """ขอ LINE Channel Access Token และ cache ไว้จนหมดอายุ"""
    global _line_token, _line_token_expiry
    if _line_token and time.time() < _line_token_expiry:
        return _line_token
    resp = httpx.post(
        "https://api.line.me/v2/oauth/accessToken",
        data={
            "grant_type":    "client_credentials",
            "client_id":     LINE_CHANNEL_ID,
            "client_secret": LINE_CHANNEL_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _line_token = data["access_token"]
    _line_token_expiry = time.time() + data.get("expires_in", 2_592_000) - 120
    return _line_token


def _verify_signature(body: bytes, signature: str) -> bool:
    """ตรวจสอบว่า webhook มาจาก LINE จริงด้วย HMAC-SHA256"""
    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _line_reply(reply_token: str, text: str) -> None:
    """ตอบกลับด้วย reply token (ใช้ได้ครั้งเดียว หมดอายุใน 60 วิ)"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"replyToken": reply_token, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE reply failed %s: %s", resp.status_code, resp.text)


def _line_push(user_id: str, text: str) -> None:
    """ส่งข้อความหา user โดยตรง"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"to": user_id, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE push failed %s: %s", resp.status_code, resp.text)


def _line_push_with_quick_reply(user_id: str, text: str, report_id: str) -> None:
    """ส่ง notification พร้อม Quick Reply button [🔍 วิเคราะห์] ให้แพทย์กดได้เลย"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "to": user_id,
            "messages": [{
                "type": "text",
                "text": text,
                "quickReply": {
                    "items": [{
                        "type": "action",
                        "action": {
                            "type":  "message",
                            "label": "🔍 วิเคราะห์",
                            "text":  f"วิเคราะห์ {report_id}",
                        },
                    }],
                },
            }],
        },
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE push (quick reply) failed %s: %s", resp.status_code, resp.text)


# ─── CRO Channel helpers (Phase 1A — LINE channel #2) ─────────────────────────

def _get_cro_token() -> str:
    """ขอ LINE Channel Access Token ของ CRO channel"""
    global _cro_token, _cro_token_expiry
    if _cro_token and time.time() < _cro_token_expiry:
        return _cro_token
    resp = httpx.post(
        "https://api.line.me/v2/oauth/accessToken",
        data={
            "grant_type":    "client_credentials",
            "client_id":     LINE_CRO_CHANNEL_ID,
            "client_secret": LINE_CRO_CHANNEL_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _cro_token = data["access_token"]
    _cro_token_expiry = time.time() + data.get("expires_in", 2_592_000) - 120
    return _cro_token


def _verify_cro_signature(body: bytes, signature: str) -> bool:
    """HMAC-SHA256 verify ของ CRO channel"""
    digest = hmac.new(
        LINE_CRO_CHANNEL_SECRET.encode(), body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _cro_reply(reply_token: str, text: str) -> None:
    """ตอบกลับใน CRO channel"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_cro_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"replyToken": reply_token, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("CRO reply failed %s: %s", resp.status_code, resp.text)


def _cro_push(user_id: str, text: str) -> None:
    """ส่ง push message ใน CRO channel"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_cro_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"to": user_id, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("CRO push failed %s: %s", resp.status_code, resp.text)


# ─── DB helpers ────────────────────────────────────────────────────────────────

@contextmanager
def _get_db():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
    finally:
        conn.close()


def _is_doctor(user_id: str) -> bool:
    """เช็คว่า LINE user_id นี้เป็นแพทย์ที่ผูก LINE แล้วหรือไม่"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM doctors WHERE line_uid = %s", (user_id,))
            return cur.fetchone() is not None


def _is_patient(user_id: str) -> bool:
    """เช็คว่า LINE user_id นี้เป็นคนไข้ที่ผูก LINE แล้วหรือไม่"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM patients WHERE line_uid = %s", (user_id,))
            return cur.fetchone() is not None


def _try_register_doctor(line_uid: str, hospital_id: str) -> tuple[str, dict | None]:
    """
    ผูก LINE UID กับรหัสแพทย์โรงพยาบาล
    คืน (status, doctor_row | None)
      status: 'registered' | 'already_me' | 'already_taken' | 'not_found'
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT doctor_id, name, line_uid FROM doctors WHERE hospital_id = %s",
                (hospital_id.upper(),),
            )
            doc = cur.fetchone()

        if not doc:
            return "not_found", None

        if doc["line_uid"] == line_uid:
            return "already_me", doc

        if doc["line_uid"] is not None:
            return "already_taken", None

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE doctors SET line_uid = %s WHERE hospital_id = %s AND line_uid IS NULL",
                (line_uid, hospital_id.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return "already_taken", None
        return "registered", doc


def _try_register_patient(line_uid: str, patient_code: str) -> tuple[str, dict | None]:
    """
    ผูก LINE UID กับรหัสคนไข้ (PT001-005)
    คืน (status, patient_row | None) — same shape as _try_register_doctor
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT patient_id, name, line_uid FROM patients WHERE patient_code = %s",
                (patient_code.upper(),),
            )
            pat = cur.fetchone()

        if not pat:
            return "not_found", None

        if pat["line_uid"] == line_uid:
            return "already_me", pat

        if pat["line_uid"] is not None:
            return "already_taken", None

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE patients SET line_uid = %s WHERE patient_code = %s AND line_uid IS NULL",
                (line_uid, patient_code.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return "already_taken", None
        return "registered", pat


def _build_patient_context(report_id: str) -> tuple[dict | None, str]:
    """
    JOIN ข้อมูลผู้ป่วยครบชุดจาก DB แล้วสร้าง context string สำหรับส่งไป Dify
    คืน (report_row, context_string) — report_row=None ถ้าไม่พบ
    """
    with _get_db() as conn:
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
                return None, ""

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

    # คำนวณอายุ
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

    return dict(row), "\n".join(lines)


def _save_analysis(report_id: str, doctor_id: str, conv_id: str, summary_text: str) -> None:
    """บันทึกผลวิเคราะห์ คืน lock analyzing → NULL และ log audit"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analyses (report_id, dify_conversation_id, summary_text)
                   VALUES (%s, %s, %s)""",
                (report_id, conv_id, summary_text),
            )
            cur.execute(
                "UPDATE reports SET status = NULL WHERE report_id = %s",
                (report_id,),
            )
            cur.execute(
                """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                   VALUES (%s, 'doctor', 'analysis_triggered', %s)""",
                (doctor_id, report_id),
            )
            conn.commit()


# ─── Dify helper ───────────────────────────────────────────────────────────────

def _ask_dify(
    user_id: str,
    message: str,
    role:    str = "doctor",
    conv_id: str = "",
) -> tuple[str, str]:
    """
    ส่งไป Dify → คืน (answer, conversation_id)
    role='doctor' (default) → clinical summary, role='patient' → patient advisor
    Dify graph มี if_else_role + if_else_emergency เป็น centralize ของ business logic
    """
    try:
        resp = httpx.post(
            f"{DIFY_API_URL}/chat-messages",
            headers={
                "Authorization": f"Bearer {DIFY_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "inputs":          {"role": role},
                "query":           message,
                "response_mode":   "blocking",
                "conversation_id": conv_id,
                "user":            f"{role}:{user_id}",
            },
            timeout=300,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("answer", "ขออภัย ไม่สามารถตอบได้ในขณะนี้"), data.get("conversation_id", conv_id)
    except Exception:
        log.exception("Dify request failed")
        return "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ กรุณาลองใหม่", conv_id


# ─── Doctor flow ───────────────────────────────────────────────────────────────

def _notify_new_report(doctor_id: str, patient_name: str, report_id: str) -> None:
    """
    Email poller เรียก callback นี้เมื่อบันทึก report เสร็จ
    ค้นหา line_uid จาก doctor_id → ส่ง LINE notification พร้อม Quick Reply
    """
    with _get_db() as conn:
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
    _line_push_with_quick_reply(line_uid, text, report_id)
    log.info("แจ้งแพทย์ %s (%s) สำหรับ %s", doctor_name, line_uid[:12], report_id)


def _get_doctor_id_from_line_uid(line_uid: str) -> str:
    """คืน doctor_id (PK โรงพยาบาล) จาก LINE UID — fallback คืน line_uid"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id FROM doctors WHERE line_uid = %s", (line_uid,))
            row = cur.fetchone()
    return row[0] if row else line_uid


def _analyze_report(reply_token: str, doctor_line_uid: str, report_id: str) -> None:
    """
    Pipeline วิเคราะห์: build context → Dify → save → push ผลกลับ
    status='analyzing' ใช้เป็น atomic lock ป้องกัน concurrent call (TOCTOU-safe)
    วิเคราะห์ซ้ำได้เสมอ — ทุกครั้งสร้าง row ใหม่ใน analyses
    """
    # Atomic lock — ถ้า rowcount == 0 แสดงว่ามีคนล็อคไปก่อนหรือ report ไม่มีอยู่
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE reports SET status = 'analyzing' WHERE report_id = %s AND status IS NULL",
                (report_id,),
            )
            locked = cur.rowcount == 1
            conn.commit()

    if not locked:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM reports WHERE report_id = %s", (report_id,))
                row = cur.fetchone()
        if not row:
            _line_reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        else:
            _line_reply(reply_token, f"⏳ Report #{report_id} กำลังวิเคราะห์อยู่แล้ว\nกรุณารอสักครู่")
        return

    report_row, context = _build_patient_context(report_id)
    if not report_row:
        _line_reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        return

    try:
        _line_reply(reply_token, f"🔍 กำลังวิเคราะห์ #{report_id}…\nกรุณารอสักครู่")
    except Exception:
        log.warning("LINE reply failed for %s — วิเคราะห์ต่อ", report_id)

    summary, conv_id = _ask_dify(doctor_line_uid, context)

    doctor_id = _get_doctor_id_from_line_uid(doctor_line_uid)
    try:
        _save_analysis(report_id, doctor_id, conv_id, summary)
    except Exception:
        log.exception("_save_analysis failed — resetting lock for %s", report_id)
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE reports SET status = NULL WHERE report_id = %s", (report_id,))
                conn.commit()
        return

    try:
        _line_push(doctor_line_uid, f"📊 ผลวิเคราะห์ #{report_id}\n\n{summary}")
    except Exception:
        log.error("LINE push failed for %s", report_id)
    log.info("Analysis done — %s by %s", report_id, doctor_id)


def _handle_patient_message(reply_token: str, line_uid: str, text: str) -> None:
    """
    Router คนไข้:
    - logout → ยกเลิกการผูก LINE
    - อื่นๆ → ส่งไป Dify role=patient (Dify graph จัด emergency check + disclaimer เอง)
    """
    if text.strip().lower() == "logout":
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL "
                    "WHERE line_uid = %s RETURNING name",
                    (line_uid,),
                )
                row = cur.fetchone()
                conn.commit()
        name = row[0] if row else "คนไข้"
        _line_reply(reply_token, f"👋 ออกจากระบบแล้ว ({name})\nส่งรหัสคนไข้ (PT001-005) เพื่อใช้งานอีกครั้ง")
        log.info("Patient logged out: %s (%s)", name, line_uid[:12])
        return

    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT patient_id, name, dify_conversation_id FROM patients WHERE line_uid = %s",
                (line_uid,),
            )
            row = cur.fetchone()
    if not row:
        _line_reply(reply_token, "❌ ไม่พบข้อมูลคนไข้")
        return
    patient_id, patient_name, conv_id = row

    try:
        _line_reply(reply_token, "🤔 กำลังค้นข้อมูลให้ครับ/ค่ะ…")
    except Exception:
        log.warning("LINE reply failed for patient %s — ดำเนินการต่อ", patient_id)

    answer, new_conv_id = _ask_dify(line_uid, text, role="patient", conv_id=conv_id or "")

    if new_conv_id and new_conv_id != conv_id:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE patients SET dify_conversation_id = %s WHERE line_uid = %s",
                    (new_conv_id, line_uid),
                )
                cur.execute(
                    """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                       VALUES (%s, 'patient', 'advice_requested', NULL)""",
                    (patient_id,),
                )
                conn.commit()

    try:
        _line_push(line_uid, answer)
    except Exception:
        log.error("LINE push failed for patient %s", patient_id)
    log.info("Patient advice done — %s", patient_id)


# ─── CRO Monitoring + Override flow (Phase 1A v2) ─────────────────────────────

def _is_cro_team(line_uid: str) -> bool:
    """เช็คว่า LINE uid ใน CRO channel เป็นสมาชิก CRO team ไหม (login แล้ว)"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM cro_users WHERE line_uid = %s AND active = true",
                (line_uid,),
            )
            return cur.fetchone() is not None


def _try_register_cro(line_uid: str, cro_code: str) -> tuple:
    """
    Register CRO ด้วย CRO001-004 (เหมือน DR001/PT001)
    Returns: ('registered', row) | ('already_me', row) | ('already_taken', None) | ('not_found', None)
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT cro_id, cro_code, name, line_uid FROM cro_users WHERE cro_code = %s",
                (cro_code.upper(),),
            )
            cro = cur.fetchone()

        if not cro:
            return ("not_found", None)
        if cro["line_uid"] == line_uid:
            return ("already_me", cro)
        if cro["line_uid"] is not None:
            return ("already_taken", None)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cro_users SET line_uid = %s WHERE cro_code = %s AND line_uid IS NULL",
                (line_uid, cro_code.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return ("already_taken", None)
        return ("registered", cro)


def _get_or_create_conversation(patient_uid: str) -> dict:
    """หา active conversation ของ patient_uid หรือสร้างใหม่"""
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT conv_id, status, taken_by FROM conversations
                   WHERE patient_uid = %s AND status IN ('active', 'taken_over')
                   ORDER BY last_activity DESC LIMIT 1""",
                (patient_uid,),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE conversations SET last_activity = now() WHERE conv_id = %s",
                    (row["conv_id"],),
                )
                conn.commit()
                return dict(row)

            cur.execute(
                "INSERT INTO conversations (patient_uid) VALUES (%s) RETURNING conv_id, status, taken_by",
                (patient_uid,),
            )
            new = cur.fetchone()
            conn.commit()
            return dict(new)


def _save_message(conv_id: int, sender: str, text: str,
                  classifier: str = None, confidence: int = None,
                  cro_id: int = None) -> None:
    """บันทึก message ลง conversation_messages"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO conversation_messages
                   (conv_id, sender, cro_id, text, classifier, confidence)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (conv_id, sender, cro_id, text, classifier, confidence),
            )
            conn.commit()


def _take_over_conversation(cro_line_uid: str, conv_id: int) -> tuple:
    """
    Atomic take-over — race-safe; CRO คนแรกที่กดได้
    Returns: ('taken', patient_uid) | ('already_yours', patient_uid)
           | ('taken_by_other', taker_name) | ('not_found', None)
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT cro_id, name FROM cro_users WHERE line_uid = %s",
                (cro_line_uid,),
            )
            cro = cur.fetchone()
            if not cro:
                return ("not_cro", None)

            cur.execute(
                """UPDATE conversations
                   SET status = 'taken_over', taken_by = %s, taken_at = now(),
                       last_activity = now()
                   WHERE conv_id = %s
                     AND (status = 'active' OR (status = 'taken_over' AND taken_by = %s))
                   RETURNING patient_uid, (taken_by = %s) AS was_already_mine""",
                (cro["cro_id"], conv_id, cro["cro_id"], cro["cro_id"]),
            )
            row = cur.fetchone()
            if row:
                conn.commit()
                return ("already_yours" if row["was_already_mine"] else "taken", row["patient_uid"])

            cur.execute(
                """SELECT cu.name FROM conversations c
                   LEFT JOIN cro_users cu ON cu.cro_id = c.taken_by
                   WHERE c.conv_id = %s""",
                (conv_id,),
            )
            row = cur.fetchone()
            if not row:
                return ("not_found", None)
            return ("taken_by_other", row.get("name"))


def _end_take_over(cro_line_uid: str, conv_id: int = None) -> tuple:
    """
    End take-over → กลับให้ AI ดูแล
    ถ้า conv_id ไม่ระบุ → end ทุก session ของ CRO คนนี้
    Returns: (count_ended, patient_uids_list)
    """
    with _get_db() as conn:
        with conn.cursor() as cur:
            if conv_id is None:
                cur.execute(
                    """UPDATE conversations SET status = 'active', taken_by = NULL,
                          taken_at = NULL, last_activity = now()
                       WHERE status = 'taken_over'
                         AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                       RETURNING patient_uid""",
                    (cro_line_uid,),
                )
            else:
                cur.execute(
                    """UPDATE conversations SET status = 'active', taken_by = NULL,
                          taken_at = NULL, last_activity = now()
                       WHERE conv_id = %s AND status = 'taken_over'
                         AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                       RETURNING patient_uid""",
                    (conv_id, cro_line_uid),
                )
            rows = cur.fetchall()
            conn.commit()
            return (len(rows), [r[0] for r in rows])


def _list_active_conversations(limit: int = 10) -> list:
    """list conversations ที่ยัง active หรือ taken_over"""
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT c.conv_id, c.patient_uid, c.status, c.last_activity,
                          cu.name AS taken_by_name,
                          (SELECT text FROM conversation_messages
                           WHERE conv_id = c.conv_id ORDER BY created_at DESC LIMIT 1) AS last_msg
                   FROM conversations c
                   LEFT JOIN cro_users cu ON cu.cro_id = c.taken_by
                   WHERE c.status IN ('active', 'taken_over')
                   ORDER BY c.last_activity DESC LIMIT %s""",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]


def _get_conversation_history(conv_id: int, limit: int = 10) -> list:
    """ดึง message history ของ conversation"""
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT sender, text, classifier, confidence, created_at,
                          (SELECT name FROM cro_users WHERE cro_id = m.cro_id) AS cro_name
                   FROM conversation_messages m
                   WHERE conv_id = %s ORDER BY created_at DESC LIMIT %s""",
                (conv_id, limit),
            )
            rows = list(cur.fetchall())
            rows.reverse()
            return [dict(r) for r in rows]


def _conv_owned_by(cro_line_uid: str) -> int:
    """ค้น conv_id ที่ CRO คนนี้ taken_over อยู่ (ถ้ามี — 1 ค่าล่าสุด)"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT conv_id FROM conversations
                   WHERE status = 'taken_over'
                     AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                   ORDER BY taken_at DESC LIMIT 1""",
                (cro_line_uid,),
            )
            row = cur.fetchone()
            return row[0] if row else None


def _patient_uid_for_conv(conv_id: int) -> str:
    """ดึง patient_uid จาก conv_id"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT patient_uid FROM conversations WHERE conv_id = %s", (conv_id,))
            row = cur.fetchone()
            return row[0] if row else None


def _notify_cro_team_new_convo(conv_id: int, patient_uid: str, first_msg: str, escalated: bool = False) -> None:
    """Push notification ไปทุก CRO ว่ามี conversation ใหม่ / escalation"""
    icon = "🔔 URGENT" if escalated else "📬 New"
    label = "🚨 ตอบไม่ได้" if escalated else "AI ตอบอยู่"
    text = (
        f"{icon} #{conv_id} ({label})\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"{first_msg[:300]}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"พิมพ์ \"view {conv_id}\" เพื่อดูประวัติ\n"
        f"พิมพ์ \"take {conv_id}\" เพื่อรับคุยเอง"
    )
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT line_uid FROM cro_users "
                "WHERE active = true AND line_uid IS NOT NULL"
            )
            uids = [r["line_uid"] for r in cur.fetchall()]
    for uid in uids:
        try:
            _cro_push(uid, text)
        except Exception:
            log.exception("Failed to push convo notification to CRO %s", uid)


_CRO_PREFIX_RE = re.compile(r"^\s*(AUTO|ESCALATE)\s*:\s*(?:(\w+)\s*:\s*)?(.*)$", re.DOTALL)


def _parse_bot_decision(answer: str) -> tuple:
    """
    Parse LLM output.
    Format: "AUTO: <text>" หรือ "ESCALATE:<class>: <reason>"
    Returns: (should_escalate, classifier, body)
    Fallback (no prefix): treat as AUTO (Bot ตอบเอง)
    """
    m = _CRO_PREFIX_RE.match(answer or "")
    if not m:
        return (False, None, answer or "")
    prefix, classifier, body = m.group(1), m.group(2), (m.group(3) or "").strip()
    if prefix.upper() == "AUTO":
        return (False, None, body)
    return (True, classifier or "unknown", body)


def _handle_public_inquiry(reply_token: str, patient_uid: str, text: str) -> None:
    """
    คนทั่วไป (ไม่ login) ส่งคำถามใน LINE #1:
    - ถ้ามี take-over session อยู่ → forward ไป CRO ที่รับ
    - ไม่งั้น → AI ตอบ (role=public_inquiry) + log
    - ถ้า AI escalate → notify CRO team + ตอบ "รับเรื่องแล้ว"
    """
    convo = _get_or_create_conversation(patient_uid)
    conv_id = convo["conv_id"]
    is_first_msg = (convo["status"] == "active" and not convo["taken_by"])
    _save_message(conv_id, "customer", text)

    if convo["status"] == "taken_over" and convo["taken_by"]:
        with _get_db() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT line_uid, name FROM cro_users WHERE cro_id = %s",
                    (convo["taken_by"],),
                )
                cro = cur.fetchone()
        if cro and cro["line_uid"]:
            try:
                _cro_push(cro["line_uid"], f"💬 #{conv_id}:\n{text}")
            except Exception:
                log.exception("Failed forward customer→CRO conv %s", conv_id)
        return

    _line_reply(reply_token, "🤔 กำลังตรวจสอบให้ครับ/ค่ะ…")
    answer, _conv_id, _meta = _ask_dify_with_meta(
        user_id=patient_uid, message=text, role="public_inquiry"
    )
    should_escalate, classifier, body = _parse_bot_decision(answer)

    if should_escalate:
        _save_message(conv_id, "bot", body or text, classifier=classifier, confidence=0)
        try:
            _line_push(patient_uid, "📝 รับเรื่องแล้วครับ/ค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด")
        except Exception:
            log.exception("Failed escalate notice to customer %s", patient_uid)
        _notify_cro_team_new_convo(conv_id, patient_uid, text, escalated=True)
        log.info("Public inquiry escalated — conv #%s (%s)", conv_id, classifier)
        return

    _save_message(conv_id, "bot", body or answer, classifier=classifier, confidence=100)
    try:
        _line_push(patient_uid, body or answer)
    except Exception:
        log.exception("Failed bot answer push to %s", patient_uid)
    if is_first_msg:
        _notify_cro_team_new_convo(conv_id, patient_uid, text, escalated=False)
    log.info("Public inquiry auto-answered — conv #%s", conv_id)


def _handle_cro_team_command(reply_token: str, cro_line_uid: str, text: str) -> None:
    """
    CRO team commands:
    - "active" / "list"  → list conversations
    - "view N"           → ดู history conv N
    - "take N"           → take over conv N
    - "/end" หรือ "end"  → end take-over (ปัจจุบัน)
    - "queue"            → list escalated only
    - อื่นๆ ระหว่าง take-over → forward ไปลูกค้า
    """
    text_stripped = text.strip()
    text_lower = text_stripped.lower()

    if text_lower in ("/end", "end"):
        count, uids = _end_take_over(cro_line_uid)
        if count == 0:
            _cro_reply(reply_token, "ℹ️ ไม่มี session ที่กำลังคุยอยู่")
        else:
            for uid in uids:
                try:
                    _line_push(uid, "ขอบคุณที่ติดต่อค่ะ AI กำลังดูแลต่อ — มีอะไรถามต่อได้นะคะ")
                except Exception:
                    log.exception("Failed end-of-takeover notice to %s", uid)
            _cro_reply(reply_token, f"✅ จบ take-over {count} session — AI กลับมาดูแลต่อ")
        return

    if text_lower in ("active", "list"):
        rows = _list_active_conversations(limit=10)
        if not rows:
            _cro_reply(reply_token, "✨ ไม่มี conversation active")
            return
        lines = ["📋 Active sessions:"]
        for r in rows:
            tag = "🔴 LIVE" if r["status"] == "taken_over" else "🤖 AI"
            owner = f" ({r['taken_by_name']})" if r["taken_by_name"] else ""
            last = (r["last_msg"] or "")[:40]
            lines.append(f"{tag}{owner} #{r['conv_id']}: {last}")
        lines.append("\nพิมพ์ \"view N\" ดูประวัติ / \"take N\" รับคุยเอง")
        _cro_reply(reply_token, "\n".join(lines))
        return

    if text_lower in ("queue",):
        rows = [r for r in _list_active_conversations(limit=20) if not r["taken_by_name"]]
        if not rows:
            _cro_reply(reply_token, "✨ ไม่มี conversation ที่ AI escalate")
            return
        lines = ["🔔 Escalated / AI ตอบอยู่:"]
        for r in rows:
            last = (r["last_msg"] or "")[:50]
            lines.append(f"#{r['conv_id']}: {last}")
        _cro_reply(reply_token, "\n".join(lines))
        return

    m = re.match(r"^view\s+(\d+)$", text_lower)
    if m:
        conv_id = int(m.group(1))
        hist = _get_conversation_history(conv_id, limit=15)
        if not hist:
            _cro_reply(reply_token, f"❌ ไม่พบ #{conv_id}")
            return
        lines = [f"💬 #{conv_id} (10 ข้อความล่าสุด)"]
        for h in hist:
            if h["sender"] == "customer":
                lines.append(f"L: {h['text'][:200]}")
            elif h["sender"] == "bot":
                conf = f" [{h['confidence']}%]" if h["confidence"] is not None else ""
                cls = f" ({h['classifier']})" if h["classifier"] else ""
                lines.append(f"🤖{conf}{cls}: {h['text'][:200]}")
            elif h["sender"] == "cro":
                lines.append(f"👤{h['cro_name']}: {h['text'][:200]}")
            else:
                lines.append(f"⚙️ {h['text'][:200]}")
        lines.append(f"\nพิมพ์ \"take {conv_id}\" เพื่อรับคุยเอง")
        _cro_reply(reply_token, "\n".join(lines))
        return

    m = re.match(r"^take\s+(\d+)$", text_lower)
    if m:
        conv_id = int(m.group(1))
        status, info = _take_over_conversation(cro_line_uid, conv_id)
        if status == "taken":
            _cro_reply(
                reply_token,
                f"🔴🔴🔴 LIVE — #{conv_id} 🔴🔴🔴\n"
                f"คุณรับคุยกับลูกค้าแล้ว\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"📤 ทุกข้อความที่พิมพ์ → ส่งลูกค้า\n"
                f"⛔ พิมพ์ /end เพื่อจบ (AI กลับมาดูแล)\n"
                f"━━━━━━━━━━━━━━━━",
            )
            try:
                _line_push(info, "👤 เจ้าหน้าที่เข้ามาดูแลแล้วค่ะ — สอบถามได้เลย")
            except Exception:
                log.exception("Failed take-over notice to %s", info)
        elif status == "already_yours":
            _cro_reply(reply_token, f"ℹ️ คุณรับ #{conv_id} อยู่แล้ว")
        elif status == "taken_by_other":
            _cro_reply(reply_token, f"❌ #{conv_id} ถูก {info} รับไปแล้ว")
        elif status == "not_found":
            _cro_reply(reply_token, f"❌ ไม่พบ #{conv_id}")
        return

    active_conv = _conv_owned_by(cro_line_uid)
    if active_conv:
        patient_uid = _patient_uid_for_conv(active_conv)
        if not patient_uid:
            _cro_reply(reply_token, "❌ session หาย")
            return
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT cro_id FROM cro_users WHERE line_uid = %s", (cro_line_uid,))
                cro_id = cur.fetchone()[0]
        _save_message(active_conv, "cro", text_stripped, cro_id=cro_id)
        try:
            _line_push(patient_uid, text_stripped)
        except Exception:
            log.exception("Failed CRO→customer forward conv %s", active_conv)
            _cro_reply(reply_token, "❌ ส่งข้อความไม่สำเร็จ")
            return
        _cro_reply(reply_token, f"📤 ส่งให้ #{active_conv}: \"{text_stripped[:60]}\"")
        return

    _cro_reply(
        reply_token,
        "คำสั่งที่ใช้ได้:\n"
        "• active / list     — ดู conversations ทั้งหมด\n"
        "• queue             — เฉพาะที่ AI escalate\n"
        "• view <N>          — ดูประวัติ conversation\n"
        "• take <N>          — รับคุยเอง (override AI)\n"
        "• /end              — จบการ take-over\n\n"
        "เมื่ออยู่ใน take-over: ทุกข้อความที่พิมพ์จะส่งให้ลูกค้า",
    )

    if text_lower == "queue":
        with _get_db() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    """SELECT ticket_id, question, status, claimed_by
                       FROM cro_queue
                       WHERE status IN ('pending', 'claimed')
                       ORDER BY created_at DESC LIMIT 10"""
                )
                rows = cur.fetchall()
        if not rows:
            _cro_reply(reply_token, "✨ Queue ว่าง — ไม่มี ticket รอ")
            return
        lines = ["📋 Queue ปัจจุบัน:"]
        for r in rows:
            tag = "⏳" if r["status"] == "pending" else "✋"
            lines.append(f"{tag} #{r['ticket_id']} {r['question'][:50]}")
        _cro_reply(reply_token, "\n".join(lines))
        return

    _cro_reply(
        reply_token,
        "คำสั่งที่ใช้ได้:\n"
        "• claim <N>      — รับ ticket\n"
        "• <N>: <คำตอบ>   — ตอบคนไข้\n"
        "• queue          — ดู ticket ที่ค้าง",
    )


def _ask_dify_with_meta(user_id: str, message: str, role: str = "cro_inquiry") -> tuple:
    """
    เรียก Dify + extract metadata จาก response
    Dify graph คาดว่าจะ output metadata.should_escalate + metadata.classifier_class
    Returns: (answer, conv_id, metadata_dict)
    """
    r = httpx.post(
        f"{DIFY_API_URL}/chat-messages",
        headers={"Authorization": f"Bearer {DIFY_API_KEY}"},
        json={
            "inputs":          {"role": role},
            "query":           message,
            "response_mode":   "blocking",
            "conversation_id": "",
            "user":            f"{role}:{user_id}",
        },
        timeout=300,
    )
    r.raise_for_status()
    j = r.json()
    return (
        j.get("answer", ""),
        j.get("conversation_id", ""),
        j.get("metadata", {}),
    )


def _handle_doctor_message(reply_token: str, doctor_line_uid: str, text: str) -> None:
    """
    Router แพทย์:
    - logout → ยกเลิกการผูก LINE (ออกจากระบบ)
    - มี RPT-XXXXXXXX-XXXX → วิเคราะห์ report นั้นโดยตรง
    - ข้อความอื่น → ค้นหาคนไข้ด้วยชื่อ → latest pending report
    """
    # ─── Logout ───────────────────────────────────────────────────────────────
    if text.strip().lower() == "logout":
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE doctors SET line_uid = NULL WHERE line_uid = %s RETURNING name",
                    (doctor_line_uid,),
                )
                row = cur.fetchone()
                conn.commit()
        name = row[0] if row else "แพทย์"
        _line_reply(reply_token, f"👋 ออกจากระบบแล้ว ({name})\nส่งรหัสแพทย์เพื่อเข้าใช้งานอีกครั้ง")
        log.info("Doctor logged out: %s (%s)", name, doctor_line_uid[:12])
        return

    # ─── RPT pattern ──────────────────────────────────────────────────────────
    match = RPT_PATTERN.search(text.upper())
    if match:
        report_id = match.group(0).upper()
        log.info("Doctor trigger (report_id): %s", report_id)
        _analyze_report(reply_token, doctor_line_uid, report_id)
        return

    # ─── ค้นหาด้วยชื่อคนไข้ ───────────────────────────────────────────────────
    name_query = text.strip()
    if not name_query:
        _line_reply(
            reply_token,
            "รอรับแจ้งเตือน Report ใหม่จากระบบ\n"
            "หรือพิมพ์ชื่อคนไข้ / Report ID เพื่อวิเคราะห์",
        )
        return

    log.info("Doctor searching patient name: %r", name_query)

    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT p.patient_id, p.name,
                          (SELECT report_id FROM reports
                           WHERE patient_id = p.patient_id
                           ORDER BY submitted_at DESC LIMIT 1) AS latest_report_id,
                          (SELECT status FROM reports
                           WHERE patient_id = p.patient_id
                           ORDER BY submitted_at DESC LIMIT 1) AS latest_status
                   FROM patients p
                   WHERE p.name ILIKE %s
                   ORDER BY p.name""",
                (f"%{name_query}%",),
            )
            patients = cur.fetchall()

    if not patients:
        _line_reply(
            reply_token,
            f"❌ ไม่พบคนไข้ชื่อ \"{name_query}\"\n"
            "ลองพิมพ์ชื่อสั้นลง หรือระบุ Report ID",
        )
        return

    if len(patients) == 1:
        p = patients[0]
        if not p["latest_report_id"]:
            _line_reply(reply_token, f"ℹ️ {p['name']} ยังไม่มี Report ในระบบ")
            return
        if p["latest_status"] == "analyzing":
            _line_reply(reply_token, f"⏳ {p['name']} — กำลังวิเคราะห์อยู่แล้ว กรุณารอสักครู่")
            return
        log.info("Doctor trigger (patient name %r): %s", p["name"], p["latest_report_id"])
        _analyze_report(reply_token, doctor_line_uid, p["latest_report_id"])
        return

    # หลายคนที่ชื่อคล้ายกัน — แสดงรายชื่อ
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
    _line_reply(reply_token, "\n".join(lines))


# ─── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """เปิด ngrok + email poller ตอน startup"""
    # reset session state — clear logins (doctor + patient) + stuck analyzing locks
    try:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE doctors SET line_uid = NULL")
                cur.execute("UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL")
                cur.execute("UPDATE cro_users SET line_uid = NULL")
                cur.execute("UPDATE reports SET status = NULL WHERE status = 'analyzing'")
                conn.commit()
        log.info("Startup reset: sessions cleared (doctor + patient + CRO), stuck reports unlocked")
    except Exception:
        log.exception("Startup reset failed")

    # ngrok tunnel ถูก provision โดย ngrok container แยก (docker-compose.bridge.yaml)
    # หรือเปิดเองตอนรัน host process — main.py อ่าน public URL จาก env var
    app.state.ngrok_url = NGROK_PUBLIC_URL or f"http://localhost:{SERVER_PORT}"
    log.info("=" * 60)
    log.info("Bridge public URL: %s", app.state.ngrok_url)
    log.info("LINE Webhook URL:  %s/webhook", app.state.ngrok_url)
    log.info("=" * 60)

    # เริ่ม email poller เป็น background task
    poller_task = asyncio.create_task(
        email_poller.start_poller(DB_CONFIG, _notify_new_report)
    )

    yield

    poller_task.cancel()


app = FastAPI(title="LINE–Dify Hospital Bridge", lifespan=lifespan)


@app.get("/")
def health():
    base = getattr(app.state, "ngrok_url", "")
    return {
        "status":      "ok",
        "ngrok_url":   base or "starting…",
        "webhook":     f"{base}/webhook",
        "webhook_cro": f"{base}/webhook/cro" if (LINE_CRO_CHANNEL_ID and LINE_CRO_CHANNEL_SECRET) else None,
    }


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    """
    รับ webhook จาก LINE
    ระบบนี้สำหรับแพทย์เท่านั้น — ตอบ 200 ทันทีก่อน LINE timeout
    """
    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")

    if not signature or not _verify_signature(body, signature):
        raise HTTPException(status_code=400, detail="Invalid X-Line-Signature")

    payload = json.loads(body)

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        if event["message"].get("type") != "text":
            continue

        user_id     = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text        = event["message"]["text"]

        if not user_id:
            continue

        if _is_doctor(user_id):
            background_tasks.add_task(_handle_doctor_message, reply_token, user_id, text)
        elif _is_patient(user_id):
            background_tasks.add_task(_handle_patient_message, reply_token, user_id, text)
        else:
            code = text.strip().upper()
            if re.match(r"^DR\d+$", code):
                status, doc = _try_register_doctor(user_id, code)
                if status == "registered":
                    _line_reply(
                        reply_token,
                        f"✅ ลงทะเบียนสำเร็จ\n"
                        f"ยินดีต้อนรับ {doc['name']}\n\n"
                        f"รอรับแจ้งเตือน Report ใหม่จากระบบ\n"
                        f"หรือพิมพ์ Report ID เพื่อวิเคราะห์ได้ทันที",
                    )
                    log.info("Doctor registered: %s → %s", doc["name"], user_id)
                elif status == "already_me":
                    _line_reply(reply_token, f"✅ คุณลงทะเบียนแล้ว ({doc['name']})")
                elif status == "already_taken":
                    _line_reply(reply_token, "❌ รหัสแพทย์นี้ถูกใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่")
                else:
                    _line_reply(reply_token, f"❌ ไม่พบรหัสแพทย์ {code}")
            elif re.match(r"^PT\d+$", code):
                status, pat = _try_register_patient(user_id, code)
                if status == "registered":
                    _line_reply(
                        reply_token,
                        f"✅ ลงทะเบียนสำเร็จ\n"
                        f"ยินดีต้อนรับ คุณ{pat['name']}\n\n"
                        f"คุณสามารถสอบถามอาการ หรือข้อมูลสุขภาพได้\n"
                        f"⚠️ ระบบนี้ให้ข้อมูลทั่วไป ไม่ใช่การวินิจฉัย — กรุณาปรึกษาแพทย์เสมอ\n"
                        f"พิมพ์ \"logout\" เพื่อออกจากระบบ",
                    )
                    log.info("Patient registered: %s → %s", pat["name"], user_id)
                elif status == "already_me":
                    _line_reply(reply_token, f"✅ คุณลงทะเบียนแล้ว (คุณ{pat['name']})")
                elif status == "already_taken":
                    _line_reply(reply_token, "❌ รหัสคนไข้นี้ถูกใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่")
                else:
                    _line_reply(reply_token, f"❌ ไม่พบรหัสคนไข้ {code}")
            else:
                background_tasks.add_task(_handle_public_inquiry, reply_token, user_id, text)

    return JSONResponse({"status": "ok"})


@app.post("/webhook/cro")
async def webhook_cro(request: Request, background_tasks: BackgroundTasks):
    """
    Webhook ของ LINE channel ที่ 2 (CRO Assistant)
    - คนไข้ใหม่ถามได้เลย (anonymous)
    - CRO team พิมพ์ command: register / claim / reply
    """
    if not (LINE_CRO_CHANNEL_ID and LINE_CRO_CHANNEL_SECRET):
        raise HTTPException(status_code=503, detail="CRO channel not configured")

    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")

    if not signature or not _verify_cro_signature(body, signature):
        raise HTTPException(status_code=400, detail="Invalid X-Line-Signature")

    payload = json.loads(body)

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        if event["message"].get("type") != "text":
            continue

        user_id     = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text        = event["message"]["text"]

        if not user_id:
            continue

        if _is_cro_team(user_id):
            background_tasks.add_task(_handle_cro_team_command, reply_token, user_id, text)
            continue

        code = text.strip().upper()
        if re.match(r"^CRO\d+$", code):
            status, cro = _try_register_cro(user_id, code)
            if status == "registered":
                _cro_reply(
                    reply_token,
                    f"✅ ลงทะเบียนสำเร็จ\n"
                    f"ยินดีต้อนรับ พี่{cro['name']} ({cro['cro_code']})\n\n"
                    "คำสั่งที่ใช้ได้:\n"
                    "• active / list — ดู conversations\n"
                    "• queue         — ที่ AI escalate\n"
                    "• view <N>      — ดูประวัติ #N\n"
                    "• take <N>      — รับคุยเอง override AI\n"
                    "• /end          — จบ take-over\n\n"
                    "🔴 ระหว่าง take-over: ทุกข้อความ → ส่งลูกค้า",
                )
                log.info("CRO registered: %s (%s) → %s", cro["name"], cro["cro_code"], user_id)
            elif status == "already_me":
                _cro_reply(reply_token, f"✅ คุณลงทะเบียนแล้ว (พี่{cro['name']} / {cro['cro_code']})")
            elif status == "already_taken":
                _cro_reply(reply_token, f"❌ รหัส {code} ถูกใช้งานแล้ว ติดต่อผู้ดูแล")
            else:
                _cro_reply(reply_token, f"❌ ไม่พบรหัส {code} (ใช้ CRO001-004)")
            continue

        _cro_reply(
            reply_token,
            "กรุณาส่งรหัสเพื่อเข้าใช้งาน\n"
            "(เช่น CRO001, CRO002, CRO003, CRO004)",
        )

    return JSONResponse({"status": "ok"})


# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)
