"""Doctor / nurse schedule — appointments + reports assigned to me.

Powers the /schedule page. Returns a focused view of the logged-in user's
upcoming work without paginating: the caller picks a date window and gets
all assignments in that window in one shot.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query

from core.config import log
from core.mysql import mysql_db
from core.security import require_user
from integrations import calendar_client


router = APIRouter(prefix="/api/schedule", tags=["schedule"])

TZ_BANGKOK = timezone(timedelta(hours=7))

_doctor_like = require_user(["doctor", "nurse", "admin"])


def _serialize_date_time(row: dict[str, Any]) -> dict[str, Any]:
    rd = row.get("requested_date")
    rt = row.get("requested_time")
    if isinstance(rd, date):
        row["requested_date"] = rd.isoformat()
    if isinstance(rt, time):
        row["requested_time"] = rt.strftime("%H:%M:%S")
    elif isinstance(rt, timedelta):
        total = int(rt.total_seconds())
        h, m, s = total // 3600, (total % 3600) // 60, total % 60
        row["requested_time"] = f"{h:02d}:{m:02d}:{s:02d}"
    for ts_key in ("created_at", "uploaded_at", "decided_at"):
        v = row.get(ts_key)
        if isinstance(v, datetime):
            row[ts_key] = v.isoformat()
    return row


@router.get("/me")
def my_schedule(
    date_from: date = Query(default=None),
    date_to: date = Query(default=None),
    user=Depends(_doctor_like),
):
    """Return today's + windowed appointments and pending reports for the
    authenticated doctor/nurse. Defaults to today..+7 days when not specified.
    """
    if date_from is None:
        date_from = date.today()
    if date_to is None:
        date_to = date_from + timedelta(days=7)

    user_id = int(user["id"])

    with mysql_db() as conn:
        with conn.cursor() as cur:
            # 1) Appointments (approved bookings) assigned to me
            cur.execute(
                """
                SELECT request_uid, patient_id, patient_name, phone,
                       requested_date, requested_time, requested_datetime_text,
                       symptom, appointment_type, status,
                       calendar_event_id, calendar_event_url,
                       created_at
                FROM booking_requests
                WHERE assigned_doctor_id = %s
                  AND status = 'approved'
                  AND requested_date BETWEEN %s AND %s
                ORDER BY requested_date, requested_time
                """,
                (user_id, date_from.isoformat(), date_to.isoformat()),
            )
            appointments = [_serialize_date_time(dict(r)) for r in cur.fetchall()]

            # 2) Patient reports assigned to me without a confirmed decision
            cur.execute(
                """
                SELECT r.id AS report_id, r.patient_id, r.title, r.report_type,
                       r.source, r.uploaded_at, r.notes,
                       p.display_name AS patient_name, p.hn,
                       (SELECT a.triage_decision
                          FROM patient_report_analyses a
                          WHERE a.report_id = r.id
                          ORDER BY a.created_at DESC LIMIT 1) AS latest_decision,
                       (SELECT a.created_at
                          FROM patient_report_analyses a
                          WHERE a.report_id = r.id
                          ORDER BY a.created_at DESC LIMIT 1) AS analysis_at
                FROM patient_reports r
                JOIN patients p ON p.id = r.patient_id
                WHERE r.assigned_doctor_id = %s
                ORDER BY r.uploaded_at DESC
                LIMIT 50
                """,
                (user_id,),
            )
            all_reports = [_serialize_date_time(dict(r)) for r in cur.fetchall()]
            pending_reports = [
                r for r in all_reports
                if r["latest_decision"] in (None, "pending", "review")
            ]

            # 3) Counts for header stats
            today_count = sum(
                1 for a in appointments if a["requested_date"] == date.today().isoformat()
            )

    # Best-effort: attach a Google Meet / video link to each appointment by
    # matching its Google Calendar event. Never break the schedule view if
    # Calendar is down or misconfigured.
    for a in appointments:
        a["video_link"] = None
    try:
        if calendar_client.is_configured():
            win_start = datetime.combine(date_from, time.min, tzinfo=TZ_BANGKOK)
            win_end = datetime.combine(date_to, time.max, tzinfo=TZ_BANGKOK)
            meet_by_event = {
                e["id"]: e.get("video_link")
                for e in calendar_client.list_events(win_start, win_end)
                if e.get("video_link")
            }
            for a in appointments:
                a["video_link"] = meet_by_event.get(a.get("calendar_event_id"))
    except Exception:
        log.warning("schedule/me meet-link enrichment failed", exc_info=True)

    return {
        "user": {"id": user["id"], "display_name": user.get("display_name"), "role": user.get("role")},
        "window": {"from": date_from.isoformat(), "to": date_to.isoformat()},
        "stats": {
            "today_appointments": today_count,
            "window_appointments": len(appointments),
            "pending_reports": len(pending_reports),
        },
        "appointments": appointments,
        "pending_reports": pending_reports,
    }
