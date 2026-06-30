"""Patient call log — CRO logs every call interaction."""
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.security import require_user
from repositories import call_log_repo, patient_repo
from services import audit_service


router = APIRouter(tags=["call-logs"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "nurse", "admin"]))]


Direction = Literal["out", "in"]
Outcome = Literal[
    "answered", "no_answer", "voicemail", "wrong_number", "refused", "busy", "other",
]


class CallLogCreate(BaseModel):
    direction: Direction = "out"
    outcome: Outcome
    duration_min: int | None = Field(default=None, ge=0, le=600)
    subject: str | None = Field(default=None, max_length=80)
    reference_booking_uid: str | None = Field(default=None, max_length=36)
    note: str | None = Field(default=None, max_length=2000)
    called_at: datetime | None = None


@router.get("/api/patients/{patient_id}/calls")
def list_calls(
    patient_id: int, request: Request, user: _StaffUser, limit: int = 50,
) -> dict:
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})
    rows = call_log_repo.list_by_patient(patient_id, limit=max(1, min(200, limit)))
    audit_service.record_access(
        request, user,
        action="list_calls", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id, extra={"result_count": len(rows)},
    )
    return {"data": rows}


@router.post("/api/patients/{patient_id}/calls", status_code=201)
def add_call(
    patient_id: int, body: CallLogCreate, request: Request, user: _StaffUser,
) -> dict:
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})
    new_id = call_log_repo.insert(
        patient_id=patient_id,
        direction=body.direction,
        outcome=body.outcome,
        duration_min=body.duration_min,
        subject=body.subject,
        reference_booking_uid=body.reference_booking_uid,
        note=body.note,
        called_by=int(user["id"]),
        called_at=body.called_at,
    )
    audit_service.record_access(
        request, user,
        action="add_call_log", subject_type="call_log", subject_id=new_id,
        patient_id=patient_id,
        extra={"outcome": body.outcome, "direction": body.direction},
    )
    rows = call_log_repo.list_by_patient(patient_id, limit=1)
    return rows[0] if rows else {"id": new_id}


@router.delete("/api/calls/{call_id}")
def delete_call(call_id: int, request: Request, user: _StaffUser) -> dict:
    rows = call_log_repo.delete(call_id)
    if rows == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="delete_call_log", subject_type="call_log", subject_id=call_id,
    )
    return {"ok": True}
