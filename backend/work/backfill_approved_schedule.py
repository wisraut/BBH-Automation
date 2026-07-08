"""One-time, idempotent backfill for approved bookings missing schedule data.

Approved bookings created before the approve flow persisted the confirmed
slot have ``requested_date``/``requested_time`` = NULL (the date only lived in
Google Calendar), and older ones have ``assigned_doctor_id`` = NULL. Both make
the row invisible to the per-doctor schedule view (`/api/schedule/me`).

This script:
  1. pulls each approved booking's start time from its Google Calendar event
     (via calendar_client.list_events) and writes requested_date/time back;
  2. assigns approved bookings with no doctor to the pilot doctor.

Idempotent: only touches rows where the target column is still NULL. Safe to
re-run. Use --dry-run to preview, --apply to commit.

    python -m work.backfill_approved_schedule --dry-run
    python -m work.backfill_approved_schedule --apply
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, "/app")

from core.mysql import mysql_db
from integrations import calendar_client

TZ_BANGKOK = timezone(timedelta(hours=7))
PILOT_DOCTOR_ID = 2  # Dr. AI BBH — pilot's primary doctor (Phase 1 decision)
# Wide window to enumerate every historical/upcoming event once.
RANGE_FROM = datetime(2025, 1, 1, tzinfo=TZ_BANGKOK)
RANGE_TO = datetime(2027, 12, 31, tzinfo=TZ_BANGKOK)


def _event_start_map() -> dict[str, str]:
    """event_id -> ISO start (dateTime or all-day date) from Google Calendar."""
    events = calendar_client.list_events(RANGE_FROM, RANGE_TO)
    return {e["id"]: e["start"] for e in events if e.get("id") and e.get("start")}


def _split_start(iso_start: str) -> tuple[str, str | None]:
    """ISO start -> (YYYY-MM-DD, HH:MM:SS or None for all-day), in Asia/Bangkok.

    Google returns event dateTimes with an offset (often UTC), so convert to
    Bangkok before splitting or the stored time is shifted by the offset.
    """
    if "T" not in iso_start:  # all-day event: date only
        return iso_start[:10], None
    dt = datetime.fromisoformat(iso_start)
    if dt.tzinfo is not None:
        dt = dt.astimezone(TZ_BANGKOK)
    return dt.strftime("%Y-%m-%d"), dt.strftime("%H:%M:%S")


def main() -> int:
    ap = argparse.ArgumentParser()
    grp = ap.add_mutually_exclusive_group(required=True)
    grp.add_argument("--dry-run", action="store_true", help="preview only")
    grp.add_argument("--apply", action="store_true", help="commit changes")
    args = ap.parse_args()
    apply = args.apply

    start_map = _event_start_map()
    print(f"Google Calendar events in window: {len(start_map)}")

    date_backfilled = 0
    skipped_no_event = 0
    skipped_event_missing = 0
    doctor_assigned = 0

    with mysql_db() as conn:
        with conn.cursor() as cur:
            # sanity: pilot doctor exists
            cur.execute(
                "SELECT id, display_name FROM users WHERE id = %s AND role = 'doctor'",
                (PILOT_DOCTOR_ID,),
            )
            doc = cur.fetchone()
            if not doc:
                print(f"ABORT: pilot doctor id={PILOT_DOCTOR_ID} not found / not a doctor")
                return 1
            print(f"pilot doctor: id={doc['id']} name={doc['display_name']}")

            # 1) date/time backfill
            cur.execute(
                """
                SELECT request_uid, calendar_event_id
                FROM booking_requests
                WHERE status = 'approved' AND requested_date IS NULL
                """
            )
            rows = cur.fetchall()
            print(f"\napproved rows missing requested_date: {len(rows)}")
            for r in rows:
                uid = r["request_uid"]
                eid = (r.get("calendar_event_id") or "").strip()
                if not eid:
                    skipped_no_event += 1
                    print(f"  skip {uid}: no calendar_event_id")
                    continue
                iso = start_map.get(eid)
                if not iso:
                    skipped_event_missing += 1
                    print(f"  skip {uid}: event {eid} not found in calendar")
                    continue
                rdate, rtime = _split_start(iso)
                print(f"  set  {uid}: requested_date={rdate} requested_time={rtime}")
                if apply:
                    cur.execute(
                        """
                        UPDATE booking_requests
                        SET requested_date = %s, requested_time = %s
                        WHERE request_uid = %s AND requested_date IS NULL
                        """,
                        (rdate, rtime, uid),
                    )
                date_backfilled += 1

            # 2) doctor assignment
            cur.execute(
                """
                SELECT request_uid FROM booking_requests
                WHERE status = 'approved' AND assigned_doctor_id IS NULL
                """
            )
            drows = cur.fetchall()
            print(f"\napproved rows missing assigned_doctor_id: {len(drows)}")
            for r in drows:
                print(f"  assign {r['request_uid']} -> doctor {PILOT_DOCTOR_ID}")
                doctor_assigned += 1
            if apply and drows:
                cur.execute(
                    """
                    UPDATE booking_requests
                    SET assigned_doctor_id = %s
                    WHERE status = 'approved' AND assigned_doctor_id IS NULL
                    """,
                    (PILOT_DOCTOR_ID,),
                )
        if apply:
            conn.commit()

    print("\n=== summary ===")
    print(f"date backfilled       : {date_backfilled}")
    print(f"skipped (no event id) : {skipped_no_event}")
    print(f"skipped (event gone)  : {skipped_event_missing}")
    print(f"doctor assigned       : {doctor_assigned}")
    print("MODE:", "APPLIED" if apply else "DRY-RUN (no changes written)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
