"""
email_poller.py — รับ Email จากคนไข้ผ่าน Gmail IMAP
Poll ทุก POLL_INTERVAL วินาที → match sender email กับ patients.email → บันทึกลง reports
"""
import asyncio
import email as email_lib
import imaplib
import logging
import os
from contextlib import contextmanager
from datetime import datetime
from email.header import decode_header
from email.utils import parseaddr
from io import BytesIO

import psycopg2
from psycopg2.extras import RealDictCursor
from pypdf import PdfReader

log = logging.getLogger(__name__)

GMAIL_HOST     = "imap.gmail.com"
GMAIL_PORT     = 993
GMAIL_EMAIL    = os.getenv("GMAIL_EMAIL", "")
GMAIL_APP_PASS = os.getenv("GMAIL_APP_PASSWORD", "")
POLL_INTERVAL  = int(os.getenv("EMAIL_POLL_INTERVAL", 120))


@contextmanager
def _db(db_config: dict):
    """Connection context — ปิด connection เมื่อจบ (psycopg2 with-conn ไม่ปิดเอง)"""
    conn = psycopg2.connect(**db_config)
    try:
        yield conn
    finally:
        conn.close()


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
    """ดึง plain-text body จาก email message (skip attachments)"""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() != "text/plain":
                continue
            # ข้าม attachment ที่ content_type เป็น text/plain แต่มี filename
            disposition = (part.get("Content-Disposition") or "").lower()
            if "attachment" in disposition:
                continue
            payload = part.get_payload(decode=True)
            if not payload:
                continue
            charset = part.get_content_charset() or "utf-8"
            return payload.decode(charset, errors="replace").strip()
        return ""

    payload = msg.get_payload(decode=True)
    if payload:
        charset = msg.get_content_charset() or "utf-8"
        return payload.decode(charset, errors="replace").strip()
    return ""


def _extract_pdf_text(payload: bytes) -> str:
    """แตก text จาก PDF bytes — คืน '' ถ้าแตกไม่ได้ (corrupt/scanned image)"""
    try:
        reader = PdfReader(BytesIO(payload))
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text.strip())
        return "\n\n".join(pages).strip()
    except Exception:
        log.exception("PDF extraction failed")
        return ""


def _get_pdf_attachments(msg) -> list[tuple[str, str]]:
    """
    แตก text จากทุก PDF attachment
    คืน list of (filename, text) — ข้าม PDF ที่แตกไม่ได้
    """
    if not msg.is_multipart():
        return []

    results: list[tuple[str, str]] = []
    for part in msg.walk():
        content_type = part.get_content_type()
        filename     = _decode_str(part.get_filename() or "")
        is_pdf = content_type == "application/pdf" or filename.lower().endswith(".pdf")
        if not is_pdf:
            continue

        payload = part.get_payload(decode=True)
        if not payload:
            continue

        text = _extract_pdf_text(payload)
        if text:
            results.append((filename or "attachment.pdf", text))
        else:
            log.warning("PDF %s แตก text ไม่ได้ (อาจเป็น scanned image)", filename)

    return results


def _insert_report(
    db_config:   dict,
    patient_id:  str,
    source:      str,
    subject:     str,
    report_text: str,
) -> str:
    """
    Generate report_id และ insert ใน transaction เดียว ป้องกัน race
    ใช้ pg_advisory_xact_lock ต่อ "วัน" — auto-release ตอน commit
    Explicit status=NULL เพื่อให้ main.py _analyze_report() lock ได้
    (schema default คือ 'pending' ซึ่งไม่ตรงกับ atomic lock ที่เช็ค status IS NULL)
    """
    date_str = datetime.now().strftime("%Y%m%d")
    lock_key = int(date_str)  # 20260603 → fits bigint

    with _db(db_config) as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT pg_advisory_xact_lock(%s)", (lock_key,))

            cur.execute(
                "SELECT COUNT(*) FROM reports WHERE report_id LIKE %s",
                (f"RPT-{date_str}-%",),
            )
            count = cur.fetchone()[0]
            report_id = f"RPT-{date_str}-{count + 1:04d}"

            cur.execute(
                """INSERT INTO reports
                   (report_id, patient_id, report_source, chief_complaint, report_text, status)
                   VALUES (%s, %s, %s, %s, %s, NULL)""",
                (report_id, patient_id, source, subject, report_text),
            )
            cur.execute(
                """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                   VALUES (%s, 'patient', 'report_submitted', %s)""",
                (patient_id, report_id),
            )
            conn.commit()

    return report_id


def _generate_report_id(db_config: dict) -> str:
    """
    DEPRECATED — ใช้ _insert_report() แทน (atomic)
    คงไว้เผื่อ test scripts เก่าเรียก แต่ไม่ race-safe เมื่อใช้แยกจาก INSERT
    """
    date_str = datetime.now().strftime("%Y%m%d")
    with _db(db_config) as conn:
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
    match sender กับ patients.email → บันทึก report (body + PDF) → เรียก callback
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
                pdfs         = _get_pdf_attachments(msg)

                log.info(
                    "Email จาก %s | เรื่อง: %s | PDFs: %d",
                    sender_email, subject[:60], len(pdfs),
                )

                # หา patient จาก sender email
                with _db(db_config) as conn:
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

                # รวม body + PDF content
                parts = []
                if subject:
                    parts.append(f"Subject: {subject}")
                if body:
                    parts.append(body)
                for filename, text in pdfs:
                    parts.append(f"=== PDF: {filename} ===\n{text}")

                report_text = "\n\n".join(parts).strip()

                if not report_text:
                    log.warning(
                        "Email จาก %s ไม่มี content (no body, no readable PDF) — ข้าม",
                        sender_email,
                    )
                    mail.store(num, "+FLAGS", "\\Seen")
                    continue

                report_id = _insert_report(
                    db_config,
                    patient_id  = patient["patient_id"],
                    source      = sender_email,
                    subject     = subject,
                    report_text = report_text,
                )

                log.info(
                    "บันทึก %s สำหรับ %s (%s)",
                    report_id, patient["patient_id"], patient["name"],
                )

                # แจ้งแพทย์
                if patient["doctor_id"] and on_new_report:
                    on_new_report(
                        doctor_id    = patient["doctor_id"],
                        patient_name = patient["name"],
                        report_id    = report_id,
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
