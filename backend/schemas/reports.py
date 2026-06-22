"""Patient report + analysis request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportSource = Literal["web", "line", "email", "whatsapp", "walkin"]
ReportType = Literal["lab", "imaging", "history", "prescription", "referral", "other"]
TriageDecision = Literal["accept", "reject", "review", "pending"]


class ReportListItem(BaseModel):
    id: int
    patient_id: int
    source: ReportSource
    report_type: ReportType
    title: str
    file_mime: str | None = None
    file_size: int | None = None
    has_file: bool
    has_extracted_text: bool
    latest_analysis_at: datetime | None = None
    uploaded_by: int | None = None
    uploaded_at: datetime


class ReportOut(ReportListItem):
    extracted_text: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class ReportUploadResponse(BaseModel):
    ok: bool
    id: int
    title: str
    has_extracted_text: bool


class AnalysisOut(BaseModel):
    id: int
    report_id: int
    requested_by: int | None = None
    dify_conversation_id: str | None = None
    summary_text: str
    triage_decision: TriageDecision
    decided_by: int | None = None
    decided_at: datetime | None = None
    created_at: datetime


class AnalysisListResponse(BaseModel):
    data: list[AnalysisOut]


class AnalyzeResponse(BaseModel):
    ok: bool
    analysis: AnalysisOut


class TriageDecideRequest(BaseModel):
    decision: Literal["accept", "reject", "review"]
    note: str | None = Field(default=None, max_length=500)
