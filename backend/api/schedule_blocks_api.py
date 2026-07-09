"""Doctor schedule blocks — vacation, off-hours, conference.

Doctor can self-block; admin can block on behalf of any doctor.
CRO sees blocks (read-only) so they avoid bookings during them.

Each block is also mirrored onto the shared Google Calendar as a TRANSPARENT
event (visible + reminders, but not counted as busy — so it never false-blocks
another doctor's bookings). A block may carry an online-meeting link.
"""
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.config import log
from core.security import require_user
from integrations import calendar_client
from repositories import schedule_block_repo, user_repo


router = APIRouter(prefix="/api/schedule-blocks", tags=["schedule-blocks"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "nurse", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]

# Calendar labels. "sick" is shown neutrally so a doctor's health reason isn't
# exposed on the shared calendar.
_BLOCK_LABEL = {
    "vacation": "ลา",
    "off_hours": "ไม่อยู่",
    "conference": "ประชุม",
    "sick": "ไม่ว่าง",
    "other": "ไม่ว่าง",
}


class ScheduleBlockCreate(BaseModel):
    doctor_id: int
    block_type: Literal["vacation", "off_hours", "conference", "sick", "other"] = "vacation"
    start_at: datetime
    end_at: datetime
    reason: str | None = Field(default=None, max_length=255)
    video_link: str | None = Field(default=None, max_length=512)


@router.get("")
def list_blocks(
    user: _StaffUser,
    doctor_id: int | None = Query(default=None),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
) -> dict:
    rows = schedule_block_repo.list_blocks(
        doctor_id=doctor_id, date_from=date_from, date_to=date_to,
    )
    return {"data": rows}


@router.post("", status_code=201)
def create_block(body: ScheduleBlockCreate, user: _DoctorOrAdmin) -> dict:
    if body.end_at <= body.start_at:
        raise HTTPException(
            400, {"code": "INVALID_RANGE", "message": "end_at ต้องหลัง start_at"},
        )
    if user["role"] == "doctor" and int(user["id"]) != body.doctor_id:
        raise HTTPException(
            403, {"code": "FORBIDDEN", "message": "doctor block ได้เฉพาะตารางตัวเอง"},
        )
    video_link = (body.video_link or "").strip() or None
    if video_link and not (video_link.startswith("http://") or video_link.startswith("https://")):
        raise HTTPException(
            422, {"code": "INVALID_URL", "message": "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"},
        )

    new_id = schedule_block_repo.insert_block(
        doctor_id=body.doctor_id,
        block_type=body.block_type,
        start_at=body.start_at,
        end_at=body.end_at,
        reason=body.reason,
        video_link=video_link,
        created_by=int(user["id"]),
    )

    # Mirror onto the shared calendar (best-effort — a Google outage must not
    # break the block itself, which is already persisted and enforced via DB).
    _sync_block_to_calendar(
        block_id=new_id, doctor_id=body.doctor_id, block_type=body.block_type,
        start_at=body.start_at, end_at=body.end_at, reason=body.reason,
        video_link=video_link,
    )
    return {"id": new_id}


def _sync_block_to_calendar(
    *, block_id: int, doctor_id: int, block_type: str,
    start_at: datetime, end_at: datetime, reason: str | None, video_link: str | None,
) -> None:
    if not calendar_client.is_configured():
        return
    try:
        doctor = user_repo.find_user_by_id(int(doctor_id))
        doctor_name = (doctor or {}).get("display_name") or "แพทย์"
        label = _BLOCK_LABEL.get(block_type, "ไม่ว่าง")
        duration_min = max(1, int((end_at - start_at).total_seconds() // 60))
        event = calendar_client.book_event(
            summary=f"{doctor_name} — {label}",
            description=reason or "",
            start=start_at,
            duration_min=duration_min,
            transparent=True,
            location=video_link,
        )
        schedule_block_repo.set_calendar_event(
            block_id, event["event_id"], event.get("html_link", ""),
        )
    except Exception as exc:  # noqa: BLE001 — calendar mirror is best-effort
        log.warning("Block %s calendar sync failed: %s", block_id, exc)


@router.delete("/{block_id}")
def delete_block(block_id: int, user: _DoctorOrAdmin) -> dict:
    block = schedule_block_repo.get_block(block_id)
    if not block:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    if user["role"] == "doctor" and int(user["id"]) != int(block["doctor_id"]):
        raise HTTPException(
            403, {"code": "FORBIDDEN", "message": "doctor ลบได้เฉพาะตารางตัวเอง"},
        )
    # Remove the mirrored calendar event first (best-effort).
    event_id = block.get("calendar_event_id")
    if event_id:
        try:
            calendar_client.cancel_event(event_id)
        except Exception as exc:  # noqa: BLE001
            log.warning("Block %s calendar delete failed: %s", block_id, exc)
    schedule_block_repo.delete_block(block_id)
    return {"ok": True}
