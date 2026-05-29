"""
email_poller.py — รับ Email จากคนไข้ผ่าน Gmail IMAP
Poll ทุก POLL_INTERVAL วินาที → match sender email กับ patients.email → บันทึกลง reports
"""
import asyncio
import email as email_lib
import imaplib
import logging
import os
from datetime import datetime
from email.header import decode_header
from email.utils import parseaddr

import psycopg2
from psycopg2.extras import RealDictCursor

log = logging.getLogger(__name__)

GMAIL_HOST     = "imap.gmail.com"
GMAIL_PORT     = 993
GMAIL_EMAIL    = os.getenv("GMAIL_EMAIL", "")
GMAIL_APP_PASS = os.getenv("GMAIL_APP_PASSWORD", "")
POLL_INTERVAL  = int(os.getenv("EMAIL_POLL_INTERVAL", 120))


def _decode_str(value: str) -> str:
    """Decode email header ที่อาจ encode เป็น UTF-8 หรือ base64"""
    if not value:
        return ""
    parts = decode_header(value)
    result = []
    for part, enc in parts:
        if isinstance(part, bytes):
            result.append(part.decode(enc or "utf-8", errors="replace"))
        else:
            result.append(part)
    return " ".join(result).strip()


def _get_body(msg) -> str:
    """ดึง plain-text body จาก email message"""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                charset = part.get_content_charset() or "utf-8"
                return payload.decode(charset, errors="replace").strip()
    else:
        payload = msg.get_payload(decode=True)
        if payload:
            charset = msg.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace").strip()
    return ""


def _generate_report_id(db_config: dict) -> str:
    """สร้าง Report ID รูปแบบ RPT-YYYYMMDD-XXXX"""
    date_str = datetime.now().strftime("%Y%m%d")
    with psycopg2.connect(**db_config) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM reports WHERE report_id LIKE %s",
                (f"RPT-{date_str}-%",),
            )
            count = cur.fetchone()[0]
    return f"RPT-{date_str}-{count + 1:04d}"


def check_inbox(db_config: dict, on_new_report) -> None:
    """
    เชื่อม Gmail IMAP → หา email ที่ยังไม่ได้อ่าน
    match sender กับ patients.email → บันทึก report → เรียก on_new_report callback
    """
    if not GMAIL_EMAIL or not GMAIL_APP_PASS:
        log.warning("GMAIL_EMAIL หรือ GMAIL_APP_PASSWORD ยังไม่ได้ตั้งค่าใน .env")
        return

    try:
        mail = imaplib.IMAP4_SSL(GMAIL_HOST, GMAIL_PORT)
        mail.login(GMAIL_EMAIL, GMAIL_APP_PASS)
        mail.select("INBOX")

        # กรองเฉพาะ email ที่เข้ามาวันนี้เป็นต้นไป เพื่อไม่ process email เก่า
        today = datetime.now().strftime("%d-%b-%Y")
        _, msg_nums = mail.search(None, f"(UNSEEN SINCE {today})")
        if not msg_nums[0]:
            mail.close()
            mail.logout()
            return

        for num in msg_nums[0].split():
            try:
                _, data = mail.fetch(num, "(RFC822)")
                raw_msg = data[0][1]
                msg = email_lib.message_from_bytes(raw_msg)

                sender_email = parseaddr(msg.get("From", ""))[1].lower().strip()
                subject      = _decode_str(msg.get("Subject", ""))
                body         = _get_body(msg)

                log.info("Email จาก %s | เรื่อง: %s", sender_email, subject[:60])

                # หา patient จาก sender email
                with psycopg2.connect(**db_config) as conn:
                    with conn.cursor(cursor_factory=RealDictCursor) as cur:
                        cur.execute(
                            "SELECT patient_id, name, doctor_id FROM patients WHERE LOWER(email) = %s",
                            (sender_email,),
                        )
                        patient = cur.fetchone()

                if not patient:
                    log.info("ไม่พบคนไข้ที่ใช้ email %s — ข้าม", sender_email)
                    mail.store(num, "+FLAGS", "\\Seen")
                    continue

                # สร้าง report_id และบันทึก
                report_id   = _generate_report_id(db_config)
                report_text = f"Subject: {subject}\n\n{body}" if subject else body

                with psycopg2.connect(**db_config) as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO reports
                               (report_id, patient_id, report_source, chief_complaint, report_text)
                               VALUES (%s, %s, %s, %s, %s)""",
                            (report_id, patient["patient_id"], sender_email, subject, report_text),
                        )
                        cur.execute(
                            """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                               VALUES (%s, 'patient', 'report_submitted', %s)""",
                            (patient["patient_id"], report_id),
                        )
                        conn.commit()

                log.info(
                    "บันทึก %s สำหรับ %s (%s)",
                    report_id, patient["patient_id"], patient["name"],
                )

                # แจ้งแพทย์
                if patient["doctor_id"] and on_new_report:
                    on_new_report(
                        doctor_id=patient["doctor_id"],
                        patient_name=patient["name"],
                        report_id=report_id,
                    )

                mail.store(num, "+FLAGS", "\\Seen")

            except Exception:
                log.exception("Error processing email #%s", num)

        mail.close()
        mail.logout()

    except Exception:
        log.exception("IMAP connection failed")


async def start_poller(db_config: dict, on_new_report) -> None:
    """Background loop — รัน check_inbox ทุก POLL_INTERVAL วินาที"""
    log.info("Email poller เริ่มทำงาน (interval: %d วินาที, inbox: %s)", POLL_INTERVAL, GMAIL_EMAIL)
    while True:
        try:
            await asyncio.to_thread(check_inbox, db_config, on_new_report)
        except Exception:
            log.exception("Email poller loop error")
        await asyncio.sleep(POLL_INTERVAL)
