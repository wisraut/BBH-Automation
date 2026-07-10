"""JWT-protected structured measurement endpoints (lab values / biomarkers).

LLM extraction produces drafts; a doctor confirms/edits/rejects. Only confirmed
rows feed the LabResults + Biomarker views. Extraction/confirm are doctor/admin
only (medical trust), reads are open to nurse as well.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from core.security import require_user
from schemas.bookings import SimpleOkResponse
from schemas.measurements import (
    BulkConfirmRequest,
    CatalogResponse,
    ConfirmRequest,
    ExtractResponse,
    MeasurementListResponse,
)
from services import audit_service, measurement_catalog, measurement_extractor
from repositories import measurement_repo, report_repo

router = APIRouter(tags=["measurements"])

_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]
_ClinicalReader = Annotated[dict, Depends(require_user(["doctor", "admin", "nurse"]))]


class BulkConfirmResponse(BaseModel):
    ok: bool
    confirmed: int


@router.get("/api/measurements/catalog", response_model=CatalogResponse)
def get_catalog(user: _ClinicalReader) -> dict:
    """Marker catalog (labels, units, reference + optimal ranges) so the
    frontend never hardcodes clinical ranges."""
    return {"data": measurement_catalog.catalog_payload()}


@router.post(
    "/api/reports/{report_id}/extract-measurements", response_model=ExtractResponse
)
def extract_measurements(report_id: int, request: Request, user: _DoctorOrAdmin) -> dict:
    """Run LLM extraction over a report's text into draft values. Patient data
    crosses to the external LLM (PII-redacted in the extractor) — audit is
    mandatory."""
    report = report_repo.get_by_id(report_id)
    result = measurement_extractor.extract_measurements(report_id=report_id, user=user)
    audit_service.record_access(
        request, user,
        action="extract_measurements", subject_type="report", subject_id=report_id,
        patient_id=report.get("patient_id") if report else None,
    )
    return result


@router.get(
    "/api/patients/{patient_id}/measurements", response_model=MeasurementListResponse
)
def list_patient_measurements(
    patient_id: int,
    user: _ClinicalReader,
    status: str | None = None,
    codes: str | None = None,
) -> dict:
    """List a patient's measurements. `status` = draft|confirmed|rejected;
    `codes` = comma-separated marker codes."""
    code_list = [c.strip() for c in codes.split(",") if c.strip()] if codes else None
    rows = measurement_repo.list_by_patient(
        patient_id, status=status, codes=code_list
    )
    return {"data": rows}


@router.get(
    "/api/reports/{report_id}/measurement-drafts", response_model=MeasurementListResponse
)
def list_report_drafts(report_id: int, user: _DoctorOrAdmin) -> dict:
    """Draft values extracted from one report, for the review panel."""
    return {"data": measurement_repo.list_drafts_by_report(report_id)}


@router.put("/api/measurements/{measurement_id}/confirm", response_model=SimpleOkResponse)
def confirm_measurement(
    measurement_id: int, body: ConfirmRequest, request: Request, user: _DoctorOrAdmin
) -> dict:
    """Confirm a draft (with optional doctor edits) so it becomes trusted."""
    existing = measurement_repo.get_by_id(measurement_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail={"code": "MEASUREMENT_NOT_FOUND", "message": "ไม่พบค่าที่ระบุ"},
        )
    if existing["status"] != "draft":
        raise HTTPException(
            status_code=409,
            detail={"code": "NOT_DRAFT", "message": "ยืนยันได้เฉพาะค่าที่รอยืนยัน"},
        )
    measurement_repo.confirm(
        measurement_id,
        confirmed_by=user.get("id"),
        code=body.code, value=body.value, unit=body.unit,
        measured_at=body.measured_at, note=body.note,
    )
    audit_service.record_access(
        request, user,
        action="confirm_measurement", subject_type="measurement", subject_id=measurement_id,
        patient_id=existing.get("patient_id"),
    )
    return {"ok": True}


@router.post("/api/measurements/{measurement_id}/reject", response_model=SimpleOkResponse)
def reject_measurement(
    measurement_id: int, request: Request, user: _DoctorOrAdmin
) -> dict:
    """Discard a draft (kept for audit, never hard-deleted)."""
    existing = measurement_repo.get_by_id(measurement_id)
    if not existing:
        raise HTTPException(
            status_code=404,
            detail={"code": "MEASUREMENT_NOT_FOUND", "message": "ไม่พบค่าที่ระบุ"},
        )
    measurement_repo.reject(measurement_id, confirmed_by=user.get("id"))
    audit_service.record_access(
        request, user,
        action="reject_measurement", subject_type="measurement", subject_id=measurement_id,
        patient_id=existing.get("patient_id"),
    )
    return {"ok": True}


@router.post("/api/measurements/bulk-confirm", response_model=BulkConfirmResponse)
def bulk_confirm_measurements(
    body: BulkConfirmRequest, request: Request, user: _DoctorOrAdmin
) -> dict:
    """Confirm many drafts at once (with per-row edits)."""
    confirmed = 0
    patient_id: int | None = None
    for item in body.items:
        existing = measurement_repo.get_by_id(item.id)
        if not existing:
            continue
        patient_id = existing.get("patient_id")
        confirmed += measurement_repo.confirm(
            item.id,
            confirmed_by=user.get("id"),
            code=item.code, value=item.value, unit=item.unit,
            measured_at=item.measured_at, note=item.note,
        )
    audit_service.record_access(
        request, user,
        action="bulk_confirm_measurements", subject_type="patient",
        subject_id=patient_id or 0, patient_id=patient_id,
        extra={"count": confirmed},
    )
    return {"ok": True, "confirmed": confirmed}
