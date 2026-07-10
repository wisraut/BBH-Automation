"""Doctor availability — recurring weekly "open for booking" template.

The POSITIVE counterpart to schedule-blocks (time-off). A doctor edits their own
template; admin may edit any; CRO reads it so the booking UI can grey out slots
outside a doctor's open hours. Enforced at booking time in booking_service
(_assert_within_availability), OPT-IN per doctor (empty template = unconstrained).
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from core.security import require_user
from repositories import availability_repo

router = APIRouter(prefix="/api/schedule/availability", tags=["availability"])

_Reader = Annotated[dict, Depends(require_user(["doctor", "admin", "cro"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]

_TIME_RE = r"^([01]\d|2[0-3]):[0-5]\d$"


class AvailabilityRange(BaseModel):
    day_of_week: int = Field(ge=0, le=6)  # 0=Mon .. 6=Sun
    start_time: str = Field(pattern=_TIME_RE)
    end_time: str = Field(pattern=_TIME_RE)


class AvailabilityPutRequest(BaseModel):
    doctor_id: int
    ranges: list[AvailabilityRange] = Field(default_factory=list, max_length=60)


@router.get("")
def get_availability(user: _Reader, doctor_id: int | None = None) -> dict:
    """List a doctor's weekly template. Doctors default to their own."""
    target = doctor_id
    if target is None:
        if user["role"] != "doctor":
            raise HTTPException(
                422, {"code": "DOCTOR_REQUIRED", "message": "ต้องระบุ doctor_id"},
            )
        target = int(user["id"])
    return {"data": availability_repo.list_by_doctor(int(target))}


@router.put("")
def put_availability(body: AvailabilityPutRequest, user: _DoctorOrAdmin) -> dict:
    """Replace the doctor's whole weekly template."""
    if user["role"] == "doctor" and int(user["id"]) != body.doctor_id:
        raise HTTPException(
            403, {"code": "FORBIDDEN", "message": "แก้ได้เฉพาะตารางของตัวเอง"},
        )

    # Validate each range and reject same-day overlaps (times are zero-padded
    # 'HH:MM', so string comparison is chronological).
    by_day: dict[int, list[tuple[str, str]]] = {}
    for r in body.ranges:
        if r.end_time <= r.start_time:
            raise HTTPException(
                422,
                {"code": "INVALID_RANGE", "message": "เวลาสิ้นสุดต้องหลังเวลาเริ่ม"},
            )
        by_day.setdefault(r.day_of_week, []).append((r.start_time, r.end_time))
    for day, spans in by_day.items():
        spans.sort()
        for prev, cur in zip(spans, spans[1:]):
            if cur[0] < prev[1]:
                raise HTTPException(
                    422,
                    {"code": "OVERLAP", "message": "ช่วงเวลาในวันเดียวกันซ้อนทับกัน"},
                )

    count = availability_repo.replace_for_doctor(
        doctor_id=body.doctor_id,
        ranges=[r.model_dump() for r in body.ranges],
        created_by=int(user["id"]),
    )
    return {"ok": True, "count": count}
