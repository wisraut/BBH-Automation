"""JWT-protected patient report endpoints for Web Dashboard."""
import os
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

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
from services import audit_service, report_service

router = APIRouter(tags=["reports"])


class ReportListResponse(BaseModel):
    data: list[ReportListItem]


_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]
_ReportsWorkspaceUser = Annotated[
    dict, Depends(require_user(["doctor", "nurse", "lab_staff", "admin"]))
]


@router.get("/api/reports")
def list_reports_workspace(
    request: Request,
    user: _ReportsWorkspaceUser,
    report_type: str | None = None,
    source: str | None = None,
    decision: str | None = None,
    search: str | None = None,
    mine_only: bool = False,
    page: int = 1,
    limit: int = 30,
) -> dict:
    """Cross-patient reports workspace list — doctor/nurse/lab_staff/admin."""
    result = report_service.list_reports_workspace(
        user=user,
        report_type=report_type,
        source=source,
        decision=decision,
        search=search,
        mine_only=mine_only,
        page=page,
        limit=limit,
    )
    audit_service.record_access(
        request, user,
        action="list_reports_workspace", subject_type="report", subject_id="*",
        extra={"filters": {"report_type": report_type, "source": source,
                          "decision": decision, "search": search,
                          "mine_only": mine_only},
               "result_count": len(result.get("data", []))},
    )
    return result


@router.get("/api/patients/{patient_id}/reports", response_model=ReportListResponse)
def list_patient_reports(patient_id: int, request: Request, user: _StaffUser) -> dict:
    """List reports for one patient."""
    result = report_service.list_reports(patient_id)
    audit_service.record_access(
        request, user,
        action="list_reports", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
        extra={"result_count": len(result.get("data", []))},
    )
    return result


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
def get_report(report_id: int, request: Request, user: _StaffUser) -> dict:
    """Get report metadata and extracted text."""
    row = report_service.get_report(report_id)
    audit_service.record_access(
        request, user,
        action="view_report", subject_type="report", subject_id=report_id,
        patient_id=row.get("patient_id"),
    )
    return row


@router.get("/api/reports/{report_id}/file")
def get_report_file(report_id: int, request: Request, user: _StaffUser) -> FileResponse:
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

    audit_service.record_access(
        request, user,
        action="download_report", subject_type="report", subject_id=report_id,
        patient_id=report.get("patient_id"),
        extra={"file_size": report.get("file_size"), "mime": report.get("file_mime")},
    )
    return FileResponse(
        abs_path,
        media_type=report.get("file_mime") or "application/octet-stream",
        filename=os.path.basename(abs_path),
    )


@router.delete("/api/reports/{report_id}", response_model=SimpleOkResponse)
def delete_report(report_id: int, request: Request, user: _DoctorOrAdmin) -> dict:
    """Soft-delete a report. Restricted to doctor/admin — CRO cannot delete
    medical records (hospital policy). Row + file are retained for the
    legal retention window; audit row links who/when."""
    report = report_service.get_report(report_id)
    result = report_service.delete_report(report_id, user=user)
    audit_service.record_access(
        request, user,
        action="delete_report", subject_type="report", subject_id=report_id,
        patient_id=report.get("patient_id"),
    )
    return result


class SendReportsRequest(BaseModel):
    # Cap the batch so one request can't fan out into a huge DB/file/email load.
    report_ids: list[int] = Field(min_length=1, max_length=50)
    format_prefix: str = "SOAP"
    # Optional override; when empty the sender's saved summary_email is used.
    to_email: str | None = Field(default=None, max_length=255)


class SendReportsResponse(BaseModel):
    sent: bool
    to: str
    attached: int
    skipped: list[dict]


@router.post("/api/patients/{patient_id}/reports/send", response_model=SendReportsResponse)
def send_patient_reports(
    patient_id: int, body: SendReportsRequest, request: Request, user: _StaffUser
) -> dict:
    """Email selected report files to a doctor's summary inbox (their own
    email->summary automation processes the "SOAP:" subject). Patient data leaves
    the system by email here — the audit row is mandatory."""
    result = report_service.send_reports_to_doctor(
        patient_id=patient_id,
        report_ids=body.report_ids,
        format_prefix=body.format_prefix,
        to_email=body.to_email,
        user=user,
    )
    audit_service.record_access(
        request, user,
        action="send_reports_to_doctor", subject_type="patient", subject_id=patient_id,
        patient_id=patient_id,
        extra={"report_ids": body.report_ids, "to": result["to"],
               "attached": result["attached"], "format": body.format_prefix},
    )
    return result


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
def analyze_report(report_id: int, request: Request, user: _DoctorOrAdmin) -> dict:
    """Run AI analysis for a report. Patient data crosses out to external
    LLM here (PII-redacted in ai_service) — audit is mandatory."""
    report = report_service.get_report(report_id)
    result = report_service.analyze_report(report_id=report_id, user=user)
    audit_service.record_access(
        request, user,
        action="analyze_report", subject_type="report", subject_id=report_id,
        patient_id=report.get("patient_id"),
    )
    return result


@router.post("/api/reports/analyses/{analysis_id}/decide", response_model=SimpleOkResponse)
def decide_report_triage(
    analysis_id: int, body: TriageDecideRequest, request: Request, user: _DoctorOrAdmin
) -> dict:
    """Confirm the final triage decision for one analysis."""
    result = report_service.decide_triage(
        analysis_id=analysis_id,
        decision=body.decision,
        user=user,
    )
    audit_service.record_access(
        request, user,
        action="decide_triage", subject_type="analysis", subject_id=analysis_id,
        extra={"decision": body.decision},
    )
    return result
