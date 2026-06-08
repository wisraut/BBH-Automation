"""Patient flow — login PT* + advisor (Dify role=patient + KB)."""
from psycopg2.extras import RealDictCursor

from core.config import log
from core.db import get_db
from integrations import dify_client, line_client


def is_patient(user_id: str) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM patients WHERE line_uid = %s", (user_id,))
            return cur.fetchone() is not None


def try_register(line_uid: str, patient_code: str) -> tuple:
    """Returns ('registered', pat) | ('already_me', pat) | ('already_taken', None) | ('not_found', None)"""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT patient_id, name, line_uid FROM patients WHERE patient_code = %s",
                (patient_code.upper(),),
            )
            pat = cur.fetchone()

        if not pat:
            return ("not_found", None)
        if pat["line_uid"] == line_uid:
            return ("already_me", pat)
        if pat["line_uid"] is not None:
            return ("already_taken", None)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE patients SET line_uid = %s WHERE patient_code = %s AND line_uid IS NULL",
                (line_uid, patient_code.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return ("already_taken", None)
        return ("registered", pat)


def handle_message(reply_token: str, line_uid: str, text: str) -> None:
    """Router: logout → unbind / อื่นๆ → Dify role=patient (graph จัด emergency เอง)"""
    if text.strip().lower() == "logout":
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL "
                    "WHERE line_uid = %s RETURNING name",
                    (line_uid,),
                )
                row = cur.fetchone()
                conn.commit()
        name = row[0] if row else "คนไข้"
        line_client.reply(reply_token, f"👋 ออกจากระบบแล้ว ({name})\nส่งรหัสคนไข้ (PT001-005) เพื่อใช้งานอีกครั้ง")
        log.info("Patient logged out: %s (%s)", name, line_uid[:12])
        return

    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT patient_id, name, dify_conversation_id FROM patients WHERE line_uid = %s",
                (line_uid,),
            )
            row = cur.fetchone()
    if not row:
        line_client.reply(reply_token, "❌ ไม่พบข้อมูลคนไข้")
        return
    patient_id, _name, conv_id = row

    try:
        line_client.reply(reply_token, "🤔 กำลังค้นข้อมูลให้ครับ/ค่ะ…")
    except Exception:
        log.warning("LINE reply failed for patient %s — ดำเนินการต่อ", patient_id)

    answer, new_conv_id = dify_client.ask(line_uid, text, role="patient", conv_id=conv_id or "")

    if new_conv_id and new_conv_id != conv_id:
        with get_db() as conn:
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
        line_client.push(line_uid, answer)
    except Exception:
        log.error("LINE push failed for patient %s", patient_id)
    log.info("Patient advice done — %s", patient_id)
