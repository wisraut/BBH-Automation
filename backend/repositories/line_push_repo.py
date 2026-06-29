"""Insert-only repo for line_push_log — feeds the failed_line_push alert rule."""
from typing import Any

from core.mysql import mysql_db


def log_push(
    *,
    channel: str,
    to_user_id: str,
    message_type: str | None,
    payload_preview: str | None,
    status: str,
    http_status: int | None = None,
    error_code: str | None = None,
    error_message: str | None = None,
    triggered_by: str | None = None,
    reference_id: str | None = None,
) -> int | None:
    """Insert one row. Failures swallowed so a logging hiccup never breaks LINE flow.

    channel: 'main' or 'cro' (matches line_push_log.channel ENUM)
    status:  'success' | 'failed' | 'retried'
    """
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO line_push_log
                        (channel, to_user_id, message_type, payload_preview,
                         status, http_status, error_code, error_message,
                         triggered_by, reference_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        channel, to_user_id, message_type, payload_preview,
                        status, http_status, error_code, error_message,
                        triggered_by, reference_id,
                    ),
                )
                rowid = cur.lastrowid
            conn.commit()
        return int(rowid) if rowid else None
    except Exception:
        return None


def _truncate_preview(text: Any, n: int = 255) -> str | None:
    if text is None:
        return None
    s = str(text)
    return s[:n]
