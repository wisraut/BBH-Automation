"""JWT-protected Google Calendar read endpoints for Web Dashboard."""
from datetime import datetime, timedelta, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from core.security import require_user
from integrations import calendar_client

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

_CalendarUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]
TZ_BANGKOK = timezone(timedelta(hours=7))


class CalendarEventOut(BaseModel):
    id: str
    summary: str
    description: str | None = None
    html_link: str | None = None
    status: str | None = None
    start: str
    end: str
    all_day: bool
    location: str | None = None
    video_link: str | None = None


class CalendarEventsResponse(BaseModel):
    data: list[CalendarEventOut]


def _parse_range(value: str) -> datetime:
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_DATETIME", "message": "Use ISO 8601 datetime."},
        ) from exc
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=TZ_BANGKOK)
    return parsed.astimezone(TZ_BANGKOK)


@router.get("/events", response_model=CalendarEventsResponse)
def list_calendar_events(
    user: _CalendarUser,
    time_min: str = Query(description="ISO 8601 range start"),
    time_max: str = Query(description="ISO 8601 range end"),
) -> dict:
    """List Google Calendar events for the dashboard calendar."""
    if not calendar_client.is_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "CALENDAR_DISABLED",
                "message": "Google Calendar service is not configured.",
            },
        )
    start = _parse_range(time_min)
    end = _parse_range(time_max)
    if end <= start:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_RANGE", "message": "time_max must be after time_min."},
        )
    return {"data": calendar_client.list_events(start, end)}
