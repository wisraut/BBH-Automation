"""JWT-protected patient report endpoints for Web Dashboard."""
import os
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from core.security import require_user
from schemas.bookings import SimpleOkResponse
from schemas.reports import (
    AnalysisListResponse,
    AnalyzeResponse,
    NotebookLmUpdateRequest,
    ReportListItem,
    ReportOut,
    ReportSource,
    ReportType,
    ReportUploadResponse,
    TriageDecideRequest,
)
from services import report_service

router = APIRouter(tags=["reports"])


class ReportListResponse(BaseModel):
    data: list[ReportListItem]


_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]


@router.get("/api/patients/{patient_id}/reports", response_model=ReportListResponse)
def list_patient_reports(patient_id: int, user: _StaffUser) -> dict:
    """List reports for one patient."""
    return report_service.list_reports(patient_id)


@router.post("/api/patients/{patient_id}/reports", response_model=ReportUploadResponse)
async def upload_patient_report(
    patient_id: int,
    user: _StaffUser,
    file: UploadFile = File(...),
    title: str = Form(...),
    report_type: ReportType = Form(...),
    source: ReportSource = Form(default="web"),
    notes: str | None = Form(default=None),
    assigned_doctor_id: int | None = Form(default=None),
) -> dict:
    """Upload one patient report file and store extracted text when available."""
    return await report_service.upload_report(
        patient_id=patient_id,
        upload=file,
        title=title,
        report_type=report_type,
        source=source,
        notes=notes,
        assigned_doctor_id=assigned_doctor_id,
        user=user,
    )


@router.get("/api/reports/{report_id}", response_model=ReportOut)
def get_report(report_id: int, user: _StaffUser) -> dict:
    """Get report metadata and extracted text."""
    return report_service.get_report(report_id)


@router.get("/api/reports/{report_id}/file")
def get_report_file(report_id: int, user: _StaffUser) -> FileResponse:
    """Download or preview the stored report file."""
    report = report_service.get_report(report_id)
    file_path = report.get("file_path")
    if not file_path:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_FILE_NOT_FOUND", "message": "Report file not found"},
        )

    root = os.path.abspath(os.getenv("REPORTS_STORAGE_ROOT", "/app/data/reports"))
    abs_path = os.path.abspath(os.path.join(root, str(file_path)))
    if os.path.commonpath([root, abs_path]) != root or not os.path.isfile(abs_path):
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_FILE_NOT_FOUND", "message": "Report file not found"},
        )

    return FileResponse(
        abs_path,
        media_type=report.get("file_mime") or "application/octet-stream",
        filename=os.path.basename(abs_path),
    )


@router.delete("/api/reports/{report_id}", response_model=SimpleOkResponse)
def delete_report(report_id: int, user: _StaffUser) -> dict:
    """Delete a report (and its analyses, file on disk)."""
    return report_service.delete_report(report_id)


@router.put("/api/reports/{report_id}/notebooklm", response_model=ReportOut)
def set_report_notebooklm_url(
    report_id: int, body: NotebookLmUpdateRequest, user: _DoctorOrAdmin
) -> dict:
    """Save the NotebookLM notebook link the doctor pasted after manually
    uploading the report there (no public NotebookLM API exists for this)."""
    return report_service.set_notebooklm_url(report_id, body.url)


@router.get("/api/reports/{report_id}/analyses", response_model=AnalysisListResponse)
def list_report_analyses(report_id: int, user: _StaffUser) -> dict:
    """List AI analyses for a report."""
    return report_service.list_analyses(report_id)


@router.post("/api/reports/{report_id}/analyze", response_model=AnalyzeResponse)
def analyze_report(report_id: int, user: _DoctorOrAdmin) -> dict:
    """Run Dify analysis for a report."""
    return report_service.analyze_report(report_id=report_id, user=user)


@router.post("/api/reports/analyses/{analysis_id}/decide", response_model=SimpleOkResponse)
def decide_report_triage(
    analysis_id: int, body: TriageDecideRequest, user: _DoctorOrAdmin
) -> dict:
    """Confirm the final triage decision for one analysis."""
    return report_service.decide_triage(
        analysis_id=analysis_id,
        decision=body.decision,
        user=user,
    )
