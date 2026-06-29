"""Cron-style appointment reminder worker.

Every CHECK_INTERVAL seconds:
- Find approved bookings whose requested_date+time is approximately
  24h or 1h from now AND have no reminder yet → push LINE → stamp the
  sent_at column.

Designed to be cheap: a single indexed query per pass. Skips bookings
whose channel is not LINE (we only push via LINE — phone/walkin/email
flows have no chat channel).
"""
import asyncio
import logging

from core.mysql import mysql_db
from integrations import line_client
from repositories import line_push_repo


log = logging.getLogger("appointment_reminder")

CHECK_INTERVAL = 60  # seconds — check every minute


def _due_24h() -> list[dict]:
    """Bookings 23-25 hours from now that have not been reminded."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, request_uid, channel, external_user_id,
                       patient_name, requested_date, requested_time,
                       requested_datetime_text, doctor_code
                FROM booking_requests
                WHERE status = 'approved'
                  AND reminder_24h_sent_at IS NULL
                  AND external_user_id IS NOT NULL AND external_user_id <> ''
                  AND channel LIKE 'line%%'
                  AND requested_date IS NOT NULL AND requested_time IS NOT NULL
                  AND TIMESTAMPDIFF(
                        MINUTE, NOW(),
                        TIMESTAMP(requested_date, requested_time)
                      ) BETWEEN 23*60 AND 25*60
                LIMIT 50
                """,
            )
            return cur.fetchall()


def _due_1h() -> list[dict]:
    """Bookings 45-90 minutes from now without a 1h reminder."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, request_uid, channel, external_user_id,
                       patient_name, requested_date, requested_time,
                       requested_datetime_text, doctor_code
                FROM booking_requests
                WHERE status = 'approved'
                  AND reminder_1h_sent_at IS NULL
                  AND external_user_id IS NOT NULL AND external_user_id <> ''
                  AND channel LIKE 'line%%'
                  AND requested_date IS NOT NULL AND requested_time IS NOT NULL
                  AND TIMESTAMPDIFF(
                        MINUTE, NOW(),
                        TIMESTAMP(requested_date, requested_time)
                      ) BETWEEN 45 AND 90
                LIMIT 50
                """,
            )
            return cur.fetchall()


def _mark_sent(booking_id: int, column: str) -> None:
    if column not in ("reminder_24h_sent_at", "reminder_1h_sent_at"):
        return
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"UPDATE booking_requests SET {column} = NOW() WHERE id = %s",
                (booking_id,),
            )
        conn.commit()


def _push_reminder(row: dict, *, label: str, mark_col: str) -> None:
    when_text = row.get("requested_datetime_text") or (
        f"{row['requested_date']} {row['requested_time']}"
    )
    msg = (
        f"แจ้งเตือนนัดหมาย — {label}\n\n"
        f"คุณ {row.get('patient_name') or '(ไม่ระบุชื่อ)'}\n"
        f"นัด: {when_text}\n"
        + (f"แพทย์: {row['doctor_code']}\n" if row.get("doctor_code") else "")
        + "\nหากต้องเลื่อนนัดกรุณาตอบกลับข้อความนี้"
    )
    try:
        line_client.push(
            row["external_user_id"], msg,
            triggered_by=f"appointment_reminder:{mark_col}",
            reference_id=row.get("request_uid"),
        )
        _mark_sent(int(row["id"]), mark_col)
        log.info("Reminder sent (%s) booking=%s patient=%s",
                 label, row.get("request_uid"), row.get("patient_name"))
    except Exception as exc:
        log.warning("Reminder push failed booking=%s err=%s",
                    row.get("request_uid"), exc)
        # Best-effort: log_push already recorded the failure, the worker
        # will retry on the next pass since reminder_*_sent_at is still NULL.


def run_once() -> None:
    for r in _due_24h():
        _push_reminder(r, label="24 ชั่วโมงก่อนนัด", mark_col="reminder_24h_sent_at")
    for r in _due_1h():
        _push_reminder(r, label="1 ชั่วโมงก่อนนัด", mark_col="reminder_1h_sent_at")


async def start_worker(interval_seconds: int = CHECK_INTERVAL) -> None:
    log.info("Appointment reminder worker started (interval=%ds)", interval_seconds)
    while True:
        try:
            await asyncio.to_thread(run_once)
        except asyncio.CancelledError:
            log.info("Appointment reminder worker stopped")
            raise
        except Exception:
            log.exception("reminder worker pass crashed")
        await asyncio.sleep(interval_seconds)


# Avoid unused import (line_push_repo is used indirectly via line_client._log_push).
_ = line_push_repo
