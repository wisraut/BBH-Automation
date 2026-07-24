"""Backfill patient records for historical approved / no_show bookings.

Some bookings reached ``approved`` or ``no_show`` before the approve flow
started find-or-creating the patient record (see
``booking_repo.update_approved``). Those rows have ``patient_id IS NULL``.
This script attaches each one to a patient, creating the patient if needed,
using the SAME dedup + HN logic as the live approve path.

For every booking with ``status IN ('approved','no_show')`` AND
``patient_id IS NULL``:
  1. find an existing patient by phone (``_find_patient_for_booking``), else
  2. mint the next HN for the booking's year (``_next_hn``) and INSERT a
     patient row (mirrors the INSERT in ``update_approved``),
  3. set the booking's ``patient_id``.

Idempotent: only touches rows where ``patient_id IS NULL``; re-running is safe.
Parameterized SQL. Each booking is handled in its own transaction so a failure
on one row does not roll back the whole batch.

Usage (run from the ``backend/`` directory, or inside the hospital-bridge
container where ``/app`` is the backend root):

    # Read-only preview — how many bookings, how many new patients vs links:
    python work/backfill_booking_patients.py --dry-run

    # Actually mutate (creates patients + sets patient_id):
    python work/backfill_booking_patients.py --apply

Exactly one of --dry-run / --apply is required. --dry-run performs NO writes.

WARNING: --apply mutates the production ``patients`` table. Review the
--dry-run output first. This script is intended to be run by a human, once.
"""
import argparse
import os
import sys
from datetime import date
from typing import Any

# Allow running as a plain script from the backend/ dir (module imports below
# are root-style, matching how the container runs with /app on the path).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.mysql import mysql_db  # noqa: E402
from repositories.booking_repo import (  # noqa: E402
    _find_patient_for_booking,
    _next_hn,
)

_CANDIDATE_SQL = """
    SELECT id, request_uid, patient_name, phone, email,
           requested_date, approved_at, created_at
    FROM booking_requests
    WHERE status IN ('approved', 'no_show')
      AND patient_id IS NULL
    ORDER BY id ASC
"""


def _hn_year(row: dict[str, Any]) -> str:
    """2-digit year for the HN, mirroring approve_booking's start-slot year.

    Falls back through the booking's dates so backfilled HNs land in a sensible
    year even when requested_date is NULL (LINE free-text bookings)."""
    for key in ("requested_date", "approved_at", "created_at"):
        val = row.get(key)
        if val is not None:
            return val.strftime("%y")
    return date.today().strftime("%y")


def _load_candidates() -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(_CANDIDATE_SQL)
            return list(cur.fetchall() or [])


def dry_run() -> None:
    rows = _load_candidates()
    would_link = 0
    would_create = 0
    with mysql_db() as conn:
        with conn.cursor() as cur:
            for row in rows:
                # Read-only dedup probe — does not write.
                match = _find_patient_for_booking(cur, row)
                if match:
                    would_link += 1
                else:
                    would_create += 1
        # No commit — nothing was written.

    print("=== backfill_booking_patients DRY RUN (no writes) ===")
    print(f"Candidates (approved/no_show, patient_id IS NULL): {len(rows)}")
    print(f"  would link to existing patient (phone match):    {would_link}")
    print(f"  would create a new patient (+ new HN):           {would_create}")
    if rows:
        print("Run with --apply to perform the backfill.")


def apply() -> None:
    rows = _load_candidates()
    linked = 0
    created = 0
    skipped = 0
    errors = 0

    for row in rows:
        uid = row["request_uid"]
        try:
            with mysql_db() as conn:
                try:
                    with conn.cursor() as cur:
                        patient = _find_patient_for_booking(cur, row)
                        if patient:
                            patient_id = patient["id"]
                            did_create = False
                        else:
                            hn = _next_hn(cur, _hn_year(row))
                            cur.execute(
                                """
                                INSERT INTO patients
                                    (hn, display_name, phone, email, notes, created_by)
                                VALUES
                                    (%s, %s, %s, %s, %s, %s)
                                """,
                                (
                                    hn,
                                    row.get("patient_name") or "Unknown Patient",
                                    row.get("phone") or None,
                                    row.get("email") or None,
                                    f"Backfilled from booking {uid}",
                                    None,
                                ),
                            )
                            patient_id = cur.lastrowid
                            did_create = True

                        # Guarded update keeps this idempotent under concurrency.
                        affected = cur.execute(
                            "UPDATE booking_requests SET patient_id = %s "
                            "WHERE id = %s AND patient_id IS NULL",
                            (patient_id, row["id"]),
                        )
                    if not affected:
                        conn.rollback()
                        skipped += 1
                        print(f"  SKIP  booking {uid}: patient_id already set")
                        continue
                    conn.commit()
                except Exception:
                    conn.rollback()
                    raise
        except Exception as exc:  # noqa: BLE001
            errors += 1
            print(f"  ERROR booking {uid}: {exc}")
            continue

        if did_create:
            created += 1
            print(f"  CREATE booking {uid}: new patient id={patient_id} hn={hn}")
        else:
            linked += 1
            print(f"  LINK  booking {uid}: patient id={patient_id}")

    print("=== backfill_booking_patients APPLY complete ===")
    print(f"Candidates: {len(rows)}")
    print(f"  linked to existing: {linked}")
    print(f"  created new:        {created}")
    print(f"  skipped:            {skipped}")
    print(f"  errors:             {errors}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    grp = parser.add_mutually_exclusive_group(required=True)
    grp.add_argument("--dry-run", action="store_true",
                     help="Preview only. No writes.")
    grp.add_argument("--apply", action="store_true",
                     help="Perform the backfill (mutates patients + bookings).")
    args = parser.parse_args()

    if args.dry_run:
        dry_run()
    else:
        apply()


if __name__ == "__main__":
    main()
