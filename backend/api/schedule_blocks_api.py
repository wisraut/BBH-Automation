"""Doctor schedule blocks — vacation, off-hours, conference.

Doctor can self-block; admin can block on behalf of any doctor.
CRO sees blocks (read-only) so they avoid bookings during them.
"""
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from core.security import require_user
from repositories import schedule_block_repo


router = APIRouter(prefix="/api/schedule-blocks", tags=["schedule-blocks"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "nurse", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]


class ScheduleBlockCreate(BaseModel):
    doctor_id: int
    block_type: str = Field(default="vacation", max_length=32)
    start_at: datetime
    end_at: datetime
    reason: str | None = Field(default=None, max_length=255)


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
    new_id = schedule_block_repo.insert_block(
        doctor_id=body.doctor_id,
        block_type=body.block_type,
        start_at=body.start_at,
        end_at=body.end_at,
        reason=body.reason,
        created_by=int(user["id"]),
    )
    return {"id": new_id}


@router.delete("/{block_id}")
def delete_block(block_id: int, user: _DoctorOrAdmin) -> dict:
    if schedule_block_repo.delete_block(block_id) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    return {"ok": True}
