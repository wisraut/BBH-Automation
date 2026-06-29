"""JWT-protected patient endpoints for Web Dashboard."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from core.security import require_user
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
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """List patients with optional search (name/HN/phone) + pagination."""
    result = patient_service.list_patients(search=search, page=page, limit=limit)
    audit_service.record_access(
        request, user,
        action="list_patients", subject_type="patient", subject_id="*",
        extra={"search": search, "page": page, "limit": limit,
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
    (PII-redacted) to the staff Dify app. Cached client-side per session."""
    result = patient_summary_service.generate_summary(patient_id, user=user)
    audit_service.record_access(
        request, user,
        action="ai_pre_visit_summary", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
    )
    return result


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
