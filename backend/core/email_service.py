"""Outbound email via Gmail SMTP — reuses the IMAP polling mailbox credentials."""
import os
import smtplib
from email.mime.text import MIMEText

from core.config import log

GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 587
GMAIL_EMAIL = os.getenv("GMAIL_EMAIL", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
REPORT_NOTIFY_EMAIL = os.getenv("REPORT_NOTIFY_EMAIL", "dr.ai.bbh@gmail.com")


def send_email(*, to: str, subject: str, body: str) -> bool:
    """Send a plain-text email. Returns False (logs, never raises) on failure
    so a notification outage never blocks a report upload."""
    if not GMAIL_EMAIL or not GMAIL_APP_PASSWORD:
        log.warning("GMAIL_EMAIL/GMAIL_APP_PASSWORD not configured — skipping email to %s", to)
        return False

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = GMAIL_EMAIL
    msg["To"] = to

    try:
        with smtplib.SMTP(GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, timeout=10) as smtp:
            smtp.starttls()
            smtp.login(GMAIL_EMAIL, GMAIL_APP_PASSWORD)
            smtp.sendmail(GMAIL_EMAIL, [to], msg.as_string())
        return True
    except Exception:  # noqa: BLE001
        log.exception("Failed to send notification email to %s", to)
        return False
