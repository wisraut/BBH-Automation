"""
Google Calendar API client (Service Account auth).

Requires:
  - GOOGLE_SERVICE_ACCOUNT_FILE  — path to JSON key
  - GOOGLE_CALENDAR_ID           — target calendar (e.g. xxx@group.calendar.google.com)
  - Service account must be shared on the calendar (Make changes to events)

All times stored as Asia/Bangkok TZ.
"""
import os
from datetime import datetime, timedelta, timezone
from typing import Optional

from core.config import log

TZ_BANGKOK = timezone(timedelta(hours=7))
DEFAULT_DURATION_MIN = 60

GOOGLE_SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT_FILE", "/app/credentials/service_account.json")
GOOGLE_CALENDAR_ID          = os.getenv("GOOGLE_CALENDAR_ID", "")

SCOPES = ["https://www.googleapis.com/auth/calendar"]
_service = None


def _get_service():
    """Lazy-init Google Calendar service. Cache instance."""
    global _service
    if _service is not None:
        return _service
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    if not os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE):
        raise RuntimeError(f"Service account file not found: {GOOGLE_SERVICE_ACCOUNT_FILE}")
    if not GOOGLE_CALENDAR_ID:
        raise RuntimeError("GOOGLE_CALENDAR_ID env var not set")
    creds = service_account.Credentials.from_service_account_file(
        GOOGLE_SERVICE_ACCOUNT_FILE, scopes=SCOPES
    )
    _service = build("calendar", "v3", credentials=creds, cache_discovery=False)
    return _service


def is_configured() -> bool:
    return bool(GOOGLE_CALENDAR_ID) and os.path.exists(GOOGLE_SERVICE_ACCOUNT_FILE)


def check_availability(start: datetime, duration_min: int = DEFAULT_DURATION_MIN) -> bool:
    """
    Return True if [start, start+duration_min] is free in the calendar.
    """
    end = start + timedelta(minutes=duration_min)
    try:
        body = {
            "timeMin": start.isoformat(),
            "timeMax": end.isoformat(),
            "timeZone": "Asia/Bangkok",
            "items": [{"id": GOOGLE_CALENDAR_ID}],
        }
        resp = _get_service().freebusy().query(body=body).execute()
        busy = resp.get("calendars", {}).get(GOOGLE_CALENDAR_ID, {}).get("busy", [])
        return len(busy) == 0
    except Exception as e:
        log.exception("Calendar freebusy error: %s", e)
        return False


def list_events(time_min: datetime, time_max: datetime) -> list[dict]:
    """
    List calendar events in [time_min, time_max].
    Returns normalized event fields safe for the dashboard.
    """
    resp = _get_service().events().list(
        calendarId=GOOGLE_CALENDAR_ID,
        timeMin=time_min.isoformat(),
        timeMax=time_max.isoformat(),
        singleEvents=True,
        orderBy="startTime",
    ).execute()
    events = []
    for item in resp.get("items", []):
        start = item.get("start", {})
        end = item.get("end", {})
        events.append({
            "id": item.get("id", ""),
            "summary": item.get("summary", "(No title)"),
            "description": item.get("description"),
            "html_link": item.get("htmlLink"),
            "status": item.get("status"),
            "start": start.get("dateTime") or start.get("date"),
            "end": end.get("dateTime") or end.get("date"),
            "all_day": "date" in start and "dateTime" not in start,
        })
    return events


def book_event(summary: str, description: str, start: datetime,
               duration_min: int = DEFAULT_DURATION_MIN,
               attendee_emails: Optional[list] = None) -> dict:
    """
    Create event in calendar.
    Returns: {event_id, html_link, start, end} on success
    Raises: Google API errors on failure
    """
    end = start + timedelta(minutes=duration_min)
    event = {
        "summary":     summary,
        "description": description,
        "start":       {"dateTime": start.isoformat(), "timeZone": "Asia/Bangkok"},
        "end":         {"dateTime": end.isoformat(),   "timeZone": "Asia/Bangkok"},
    }
    if attendee_emails:
        event["attendees"] = [{"email": e} for e in attendee_emails]

    created = _get_service().events().insert(
        calendarId=GOOGLE_CALENDAR_ID, body=event
    ).execute()
    return {
        "event_id":  created["id"],
        "html_link": created.get("htmlLink", ""),
        "start":     start,
        "end":       end,
    }


def cancel_event(event_id: str) -> bool:
    try:
        _get_service().events().delete(
            calendarId=GOOGLE_CALENDAR_ID, eventId=event_id
        ).execute()
        return True
    except Exception as e:
        log.exception("Calendar cancel error: %s", e)
        return False


# ─── Date/time parsing (Thai-aware) ────────────────────────────────────────────

_THAI_DAYS = {
    "จันทร์": 0, "อังคาร": 1, "พุธ": 2, "พฤหัส": 3, "พฤหัสบดี": 3,
    "ศุกร์": 4, "เสาร์": 5, "อาทิตย์": 6,
    "จ": 0, "อ": 1, "พ": 2, "ศ": 4, "ส": 5,
    "monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3,
    "friday": 4, "saturday": 5, "sunday": 6,
}


def parse_thai_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    """
    Parse Thai date + time → datetime (Asia/Bangkok)
    Supported:
      - date: "เสาร์", "วันเสาร์", "10/06", "10/06/2026", "พรุ่งนี้", "วันนี้"
      - time: "9:00", "9 โมง", "9 โมงเช้า", "บ่าย 2", "14:00"
    """
    import re as _re
    if not date_str or not time_str:
        return None
    d = date_str.strip().lower().replace("วัน", "").strip()
    t = time_str.strip().lower()

    today = datetime.now(TZ_BANGKOK).replace(hour=0, minute=0, second=0, microsecond=0)
    target_date = None

    if d in ("วันนี้", "today"):
        target_date = today
    elif d in ("พรุ่งนี้", "tomorrow"):
        target_date = today + timedelta(days=1)
    else:
        m = _re.match(r"^(\d{1,2})[/\-\.](\d{1,2})(?:[/\-\.](\d{2,4}))?$", d)
        if m:
            day, month = int(m.group(1)), int(m.group(2))
            year = int(m.group(3)) if m.group(3) else today.year
            if year < 100: year += 2000
            if year > 2500: year -= 543  # พ.ศ. → ค.ศ.
            try:
                target_date = datetime(year, month, day, tzinfo=TZ_BANGKOK)
            except ValueError:
                pass
        else:
            for key, weekday in _THAI_DAYS.items():
                if key in d:
                    days_ahead = (weekday - today.weekday() + 7) % 7
                    if days_ahead == 0:
                        days_ahead = 7
                    target_date = today + timedelta(days=days_ahead)
                    break

    if not target_date:
        return None

    hour, minute = None, 0
    m = _re.match(r"^(\d{1,2})[:.](\d{2})$", t)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
    else:
        m = _re.search(r"(\d{1,2})", t)
        if m:
            hour = int(m.group(1))
            if "บ่าย" in t and hour < 12:
                hour += 12
            elif "เย็น" in t and hour < 12:
                hour += 12
            elif "ทุ่ม" in t:
                hour += 18
            elif "เที่ยง" in t:
                hour = 12

    if hour is None:
        return None

    return target_date.replace(hour=hour, minute=minute)
