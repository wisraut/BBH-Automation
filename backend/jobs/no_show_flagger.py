"""Background job — flag approved bookings as no_show after their slot
passes by a grace window without check-in.

We don't have a real check-in event yet (the bridge is patient-facing via
LINE only, with no in-clinic UI), so the rule for the pilot is simple:

  status='approved' AND
  TIMESTAMP(requested_date, requested_time) < NOW() - INTERVAL grace MINUTE

Bookings older than `expire_after_days` are skipped so we don't keep
re-flagging historical rows after a migration / restore.

A patient's `no_show_count` is incremented for each flagged booking so the
CRO daily view (TODO step D) can show 'X no-show this month'.
"""
import asyncio
import logging

from core.mysql import mysql_db


log = logging.getLogger("no_show_flagger")

GRACE_MIN = 30
EXPIRE_AFTER_DAYS = 14


def _flag_due() -> int:
    """Return number of rows flagged in this pass."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, patient_id
                FROM booking_requests
                WHERE status = 'approved'
                  AND requested_date IS NOT NULL AND requested_time IS NOT NULL
                  AND TIMESTAMP(requested_date, requested_time)
                      < NOW() - INTERVAL %s MINUTE
                  AND TIMESTAMP(requested_date, requested_time)
                      > NOW() - INTERVAL %s DAY
                LIMIT 100
                """,
                (GRACE_MIN, EXPIRE_AFTER_DAYS),
            )
            rows = cur.fetchall()
            if not rows:
                return 0
            for r in rows:
                cur.execute(
                    "UPDATE booking_requests SET status='no_show', "
                    "flagged_no_show_at = NOW() WHERE id = %s AND status='approved'",
                    (r["id"],),
                )
                if r.get("patient_id"):
                    cur.execute(
                        "UPDATE patients SET no_show_count = no_show_count + 1 "
                        "WHERE id = %s",
                        (r["patient_id"],),
                    )
                cur.execute(
                    "INSERT INTO booking_audit_logs "
                    "(booking_request_id, actor_type, actor_id, action, "
                    " from_status, to_status, detail) "
                    "VALUES (%s, 'system', 'no_show_flagger', 'auto_no_show', "
                    "        'approved', 'no_show', NULL)",
                    (r["id"],),
                )
            n = len(rows)
        conn.commit()
    return n


async def start_worker(interval_seconds: int = 300) -> None:
    log.info("No-show flagger started (interval=%ds, grace=%d min)",
             interval_seconds, GRACE_MIN)
    while True:
        try:
            n = await asyncio.to_thread(_flag_due)
            if n:
                log.info("Flagged %d bookings as no_show", n)
        except asyncio.CancelledError:
            log.info("No-show flagger stopped")
            raise
        except Exception:
            log.exception("no-show flagger pass crashed")
        await asyncio.sleep(interval_seconds)
