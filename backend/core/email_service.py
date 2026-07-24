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
    html: str | None = None,
    attachment_path: str | None = None,
    attachment_filename: str | None = None,
    attachment_mime: str | None = None,
    attachments: list[dict] | None = None,
    from_name: str | None = None,
) -> bool:
    """Send an email. When ``html`` is provided the message is sent as
    multipart/alternative so mail clients can pick either the text (body)
    or the html version. Attaches files from disk — either one via
    ``attachment_path`` (kept for existing callers) or several via
    ``attachments`` (a list of ``{"path", "filename"?, "mime"?}`` dicts).

    Returns False (logs, never raises) on failure so a notification outage
    never blocks the caller. Individual attachments are skipped (logged) if
    missing, and the running total is capped at MAX_ATTACHMENT_BYTES so Gmail
    won't reject the message — body still sends.
    """
    if not GMAIL_EMAIL or not GMAIL_APP_PASSWORD:
        log.warning("GMAIL_EMAIL/GMAIL_APP_PASSWORD not configured — skipping email to %s", to)
        return False

    # Normalize the single-attachment shorthand into the list form so there's
    # one code path for building the message.
    files = list(attachments or [])
    if attachment_path:
        files.insert(0, {
            "path": attachment_path,
            "filename": attachment_filename,
            "mime": attachment_mime,
        })

    if files:
        msg = _build_with_attachments(
            to=to,
            subject=subject,
            body=body,
            html=html,
            attachments=files,
            from_name=from_name,
        )
    elif html:
        # multipart/alternative — client picks text or html
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = _from_header(from_name)
        msg["To"] = to
        # Order matters — the LAST part is preferred by clients that
        # support both, so put html second.
        msg.attach(MIMEText(body, "plain", "utf-8"))
        msg.attach(MIMEText(html, "html", "utf-8"))
    else:
        msg = MIMEText(body, "plain", "utf-8")
        msg["Subject"] = subject
        msg["From"] = _from_header(from_name)
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


def _from_header(from_name: str | None) -> str:
    if from_name:
        return f"{from_name} <{GMAIL_EMAIL}>"
    return GMAIL_EMAIL


def _build_with_attachments(
    *,
    to: str,
    subject: str,
    body: str,
    html: str | None,
    attachments: list[dict],
    from_name: str | None,
) -> MIMEMultipart:
    """multipart/mixed with an alternative sub-part when html is provided.
    Attaches each file whose running total stays under MAX_ATTACHMENT_BYTES;
    missing/oversize files are skipped (logged) so the message still sends."""
    msg = MIMEMultipart("mixed")
    msg["Subject"] = subject
    msg["From"] = _from_header(from_name)
    msg["To"] = to
    if html:
        alt = MIMEMultipart("alternative")
        alt.attach(MIMEText(body, "plain", "utf-8"))
        alt.attach(MIMEText(html, "html", "utf-8"))
        msg.attach(alt)
    else:
        msg.attach(MIMEText(body, "plain", "utf-8"))

    total = 0
    for att in attachments:
        path = att.get("path")
        if not path:
            continue
        try:
            size = os.path.getsize(path)
        except OSError:
            log.warning("Attachment not found at %s — skipping", path)
            continue
        # Cap the running total (not each file) so a multi-file email can't
        # blow past Gmail's limit.
        if total + size > MAX_ATTACHMENT_BYTES:
            log.warning(
                "Attachment %s (%d bytes) would exceed the %d-byte cap — skipping",
                path, size, MAX_ATTACHMENT_BYTES,
            )
            continue
        total += size

        mime = att.get("mime") or (mimetypes.guess_type(path)[0] or "application/octet-stream")
        main, _, sub = mime.partition("/")
        part = MIMEBase(main or "application", sub or "octet-stream")
        with open(path, "rb") as fh:
            part.set_payload(fh.read())
        encoders.encode_base64(part)
        filename = att.get("filename") or os.path.basename(path)
        part.add_header("Content-Disposition", f'attachment; filename="{filename}"')
        msg.attach(part)
    return msg
