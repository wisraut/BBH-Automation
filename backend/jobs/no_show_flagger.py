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

# Stale pending_approval bookings are auto-expired so the CRO inbox stays honest.
# Two cases:
#   1. It has a concrete requested_date in the past (before today, Asia/Bangkok)
#      -> the slot the patient asked for is already gone, nobody approved it.
#   2. It only has free-text (requested_date IS NULL — common for LINE bookings
#      where the patient wrote "next week" etc). We can't tell a slot passed, so
#      we only expire once it has clearly rotted: created more than
#      PENDING_EXPIRE_NODATE_DAYS ago. Conservative on purpose — we would rather
#      keep a recent dateless request in the inbox than expire a live one.
PENDING_EXPIRE_NODATE_DAYS = 7


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


def _expire_pending() -> int:
    """Auto-expire stale pending_approval bookings. Returns rows expired.

    Bounded (LIMIT 100), idempotent (guarded UPDATE), parameterized SQL.
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id
                FROM booking_requests
                WHERE status = 'pending_approval'
                  AND (
                        (requested_date IS NOT NULL AND requested_date < CURDATE())
                     OR (requested_date IS NULL
                         AND created_at < NOW() - INTERVAL %s DAY)
                  )
                LIMIT 100
                """,
                (PENDING_EXPIRE_NODATE_DAYS,),
            )
            rows = cur.fetchall()
            if not rows:
                return 0
            expired = 0
            for r in rows:
                affected = cur.execute(
                    "UPDATE booking_requests SET status='expired' "
                    "WHERE id = %s AND status='pending_approval'",
                    (r["id"],),
                )
                if not affected:
                    # Lost a race (CRO approved/rejected in between) — skip audit.
                    continue
                cur.execute(
                    "INSERT INTO booking_audit_logs "
                    "(booking_request_id, actor_type, actor_id, action, "
                    " from_status, to_status, detail) "
                    "VALUES (%s, 'system', 'expiry', 'auto_expired', "
                    "        'pending_approval', 'expired', NULL)",
                    (r["id"],),
                )
                expired += 1
        conn.commit()
    return expired


async def start_worker(interval_seconds: int = 300) -> None:
    log.info("No-show flagger started (interval=%ds, grace=%d min, "
             "pending-expiry no-date window=%d days)",
             interval_seconds, GRACE_MIN, PENDING_EXPIRE_NODATE_DAYS)
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
        try:
            m = await asyncio.to_thread(_expire_pending)
            if m:
                log.info("Expired %d stale pending bookings", m)
        except asyncio.CancelledError:
            log.info("No-show flagger stopped")
            raise
        except Exception:
            log.exception("pending-expiry pass crashed")
        await asyncio.sleep(interval_seconds)
