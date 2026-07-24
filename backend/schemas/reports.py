"""Patient report + analysis request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportSource = Literal["web", "line", "email", "whatsapp", "walkin"]
ReportType = Literal["lab", "imaging", "history", "prescription", "referral", "other"]
TriageDecision = Literal["accept", "reject", "review", "pending"]


class ReportListItem(BaseModel):
    """แถวสรุป report สำหรับ list view (มีไฟล์/มี text/เวลาวิเคราะห์ล่าสุด)"""
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
    assigned_doctor_id: int | None = None
    notebooklm_url: str | None = None
    uploaded_at: datetime


class ReportOut(ReportListItem):
    """response แบบเต็มของ report หนึ่งใบ (ต่อยอด list item เพิ่ม extracted_text +
    notes) — ใช้ในหน้า detail"""
    extracted_text: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class NotebookLmUpdateRequest(BaseModel):
    """request body สำหรับบันทึก/ล้างลิงก์ NotebookLM ของ report (null = ล้าง)"""
    url: str | None = Field(default=None, max_length=500)


class ReportUploadResponse(BaseModel):
    """response หลังอัปโหลด report — id ใหม่, มี text ให้วิเคราะห์ไหม, แจ้งแพทย์สำเร็จไหม"""
    ok: bool
    id: int
    title: str
    has_extracted_text: bool
    notified_doctor: bool = False


class AnalysisOut(BaseModel):
    """response ของผลวิเคราะห์ AI หนึ่งครั้ง (สรุป + triage decision + ใครตัดสิน)"""
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
    """response ของ GET analysis list ของ report หนึ่งใบ"""
    data: list[AnalysisOut]


class AnalyzeResponse(BaseModel):
    """response หลังสั่งวิเคราะห์ report — คืนผลวิเคราะห์ล่าสุดที่เพิ่งสร้าง"""
    ok: bool
    analysis: AnalysisOut


class TriageDecideRequest(BaseModel):
    """request body ตอนแพทย์ตัดสิน triage ของผลวิเคราะห์ (รับ/ปฏิเสธ/ขอตรวจซ้ำ)"""
    decision: Literal["accept", "reject", "review"]
    note: str | None = Field(default=None, max_length=500)
