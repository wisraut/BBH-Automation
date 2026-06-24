"""Outbound email via Gmail SMTP — reuses the IMAP polling mailbox credentials."""
import mimetypes
import os
import smtplib
from email.mime.base import MIMEBase
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email import encoders

from core.config import log

GMAIL_SMTP_HOST = "smtp.gmail.com"
GMAIL_SMTP_PORT = 587
GMAIL_EMAIL = os.getenv("GMAIL_EMAIL", "")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD", "")
REPORT_NOTIFY_EMAIL = os.getenv("REPORT_NOTIFY_EMAIL", "dr.ai.bbh@gmail.com")

# Hard cap on attachment size — Gmail SMTP rejects multipart > ~25 MB.
MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024  # 20 MB


def send_email(
    *,
    to: str,
    subject: str,
    body: str,
    attachment_path: str | None = None,
    attachment_filename: str | None = None,
    attachment_mime: str | None = None,
) -> bool:
    """Send an email. Optionally attaches one file from disk.

    Returns False (logs, never raises) on failure so a notification outage
    never blocks a report upload. Attachment is silently skipped if the file
    is missing or too large — body still sends.
    """
    if not GMAIL_EMAIL or not GMAIL_APP_PASSWORD:
        log.warning("GMAIL_EMAIL/GMAIL_APP_PASSWORD not configured — skipping email to %s", to)
        return False

    if attachment_path:
        msg = _build_multipart(
            to=to,
            subject=subject,
            body=body,
            attachment_path=attachment_path,
            attachment_filename=attachment_filename,
            attachment_mime=attachment_mime,
        )
    else:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = GMAIL_EMAIL
        msg["To"] = to

    try:
        with smtplib.SMTP(GMAIL_SMTP_HOST, GMAIL_SMTP_PORT, timeout=15) as smtp:
            smtp.starttls()
            smtp.login(GMAIL_EMAIL, GMAIL_APP_PASSWORD)
            smtp.sendmail(GMAIL_EMAIL, [to], msg.as_string())
        return True
    except Exception:  # noqa: BLE001
        log.exception("Failed to send notification email to %s", to)
        return False


def _build_multipart(
    *,
    to: str,
    subject: str,
    body: str,
    attachment_path: str,
    attachment_filename: str | None,
    attachment_mime: str | None,
) -> MIMEMultipart:
    msg = MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = GMAIL_EMAIL
    msg["To"] = to
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        size = os.path.getsize(attachment_path)
    except OSError:
        log.warning("Attachment not found at %s — sending email without it", attachment_path)
        return msg
    if size > MAX_ATTACHMENT_BYTES:
        log.warning(
            "Attachment %s too large (%d bytes) — sending email without it",
            attachment_path, size,
        )
        return msg

    mime = attachment_mime or (mimetypes.guess_type(attachment_path)[0] or "application/octet-stream")
    main, _, sub = mime.partition("/")
    part = MIMEBase(main or "application", sub or "octet-stream")
    with open(attachment_path, "rb") as fh:
        part.set_payload(fh.read())
    encoders.encode_base64(part)
    filename = attachment_filename or os.path.basename(attachment_path)
    part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
    msg.attach(part)
    return msg
