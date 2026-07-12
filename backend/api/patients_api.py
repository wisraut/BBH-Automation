"""JWT-protected patient endpoints for Web Dashboard."""
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from core.security import require_user
from repositories import patient_doctor_repo, user_repo
from schemas.patients import (
    PatientCreateRequest,
    PatientListResponse,
    PatientOut,
    PatientUpdateRequest,
)
from services import audit_service, patient_service, patient_summary_service

router = APIRouter(prefix="/api/patients", tags=["patients"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]
_CroOrAdmin = Annotated[dict, Depends(require_user(["cro", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]


@router.get("", response_model=PatientListResponse)
def list_patients(
    request: Request,
    user: _StaffUser,
    search: str | None = Query(default=None, max_length=120),
    mine: bool = Query(default=False, description="Only patients in the caller's care-team panel."),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """List patients with optional search (name/HN/phone) + pagination.

    ``mine=true`` restricts to the caller's care-team panel (only meaningful for
    a doctor; other roles have no panel and get an empty list)."""
    panel_doctor_id = int(user["id"]) if mine else None
    result = patient_service.list_patients(
        search=search, page=page, limit=limit, panel_doctor_id=panel_doctor_id,
    )
    audit_service.record_access(
        request, user,
        action="list_patients", subject_type="patient", subject_id="*",
        extra={"search": search, "mine": mine, "page": page, "limit": limit,
               "result_count": len(result.get("data", []))},
    )
    return result


@router.get("/{patient_id}", response_model=PatientOut)
def get_patient(patient_id: int, request: Request, user: _StaffUser) -> dict:
    """Get a single patient by id."""
    row = patient_service.get_patient(patient_id)
    audit_service.record_access(
        request, user,
        action="view_patient", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
    )
    return row


@router.post("", response_model=PatientOut)
def create_patient(body: PatientCreateRequest, user: _CroOrAdmin) -> dict:
    """Create a new patient and auto-assign an HN."""
    return patient_service.create_patient(body=body, user=user)


@router.patch("/{patient_id}", response_model=PatientOut)
def update_patient(
    patient_id: int, body: PatientUpdateRequest, user: _CroOrAdmin
) -> dict:
    """Update patient profile fields. Only fields present in payload are changed."""
    return patient_service.update_patient(patient_id=patient_id, body=body, user=user)


@router.get("/{patient_id}/ai-summary")
def patient_ai_summary(patient_id: int, request: Request, user: _DoctorOrAdmin) -> dict:
    """Generate a short pre-visit Thai brief by passing the medical bundle
    (PII-redacted) to the staff AI assistant. Cached client-side per session."""
    result = patient_summary_service.generate_summary(patient_id, user=user)
    audit_service.record_access(
        request, user,
        action="ai_pre_visit_summary", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
    )
    return result


class CareTeamAddRequest(BaseModel):
    doctor_id: int
    role: Literal["primary", "specialist", "consultant"] = "specialist"


@router.get("/{patient_id}/care-team")
def get_care_team(patient_id: int, request: Request, user: _StaffUser) -> dict:
    """List the patient's care team (active members, primary first)."""
    patient_service.get_patient(patient_id)  # 404 if not found
    members = patient_doctor_repo.list_by_patient(patient_id)
    audit_service.record_access(
        request, user,
        action="view_care_team", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
    )
    return {"data": members}


@router.post("/{patient_id}/care-team", status_code=201)
def add_care_team_member(
    patient_id: int, body: CareTeamAddRequest, request: Request, user: _StaffUser,
) -> dict:
    """Add a doctor to the care team (or change their role). A `primary` demotes
    the previous primary to `specialist`."""
    patient_service.get_patient(patient_id)  # 404 if not found
    doctor = user_repo.find_user_by_id(body.doctor_id)
    if not doctor or doctor.get("role") != "doctor" or not doctor.get("is_active"):
        raise HTTPException(
            422, {"code": "DOCTOR_NOT_FOUND", "message": "แพทย์ที่เลือกไม่พบหรือไม่อยู่ในระบบ"},
        )
    patient_doctor_repo.add_member(
        patient_id=patient_id, doctor_id=body.doctor_id,
        role=body.role, added_by=int(user["id"]),
    )
    audit_service.record_access(
        request, user,
        action="add_care_team_member", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id, extra={"doctor_id": body.doctor_id, "role": body.role},
    )
    return {"ok": True}


@router.delete("/{patient_id}/care-team/{doctor_id}")
def remove_care_team_member(
    patient_id: int, doctor_id: int, request: Request, user: _StaffUser,
) -> dict:
    """Remove a doctor from the care team (soft — history retained)."""
    removed = patient_doctor_repo.deactivate(patient_id=patient_id, doctor_id=doctor_id)
    if not removed:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบแพทย์ในทีมนี้"})
    audit_service.record_access(
        request, user,
        action="remove_care_team_member", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id, extra={"doctor_id": doctor_id},
    )
    return {"ok": True}


@router.delete("/{patient_id}")
def delete_patient(patient_id: int, request: Request, user: _DoctorOrAdmin) -> dict:
    """Soft-delete a patient. Restricted to doctor/admin — CRO cannot delete
    medical records. Related reports/bookings/audit rows are retained;
    only the patient row is hidden from list/get queries."""
    result = patient_service.delete_patient(patient_id, user=user)
    audit_service.record_access(
        request, user,
        action="delete_patient", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
    )
    return result
