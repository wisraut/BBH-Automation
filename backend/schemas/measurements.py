"""Structured measurement (lab/biomarker) request/response schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

MeasurementStatus = Literal["draft", "confirmed", "rejected"]


class MeasurementOut(BaseModel):
    """response ของค่าแล็บ/biomarker หนึ่งค่า (draft/confirmed/rejected) พร้อมข้อมูล
    ผู้ยืนยัน — ใช้ในหน้า LabResults/Biomarker"""
    id: int
    patient_id: int
    report_id: int | None = None
    code: str
    value: float
    unit: str | None = None
    measured_at: date
    status: MeasurementStatus
    raw_label: str | None = None
    note: str | None = None
    created_by: int | None = None
    confirmed_by: int | None = None
    confirmed_at: datetime | None = None
    created_at: datetime


class MeasurementListResponse(BaseModel):
    """response ของ GET measurement list"""
    data: list[MeasurementOut]


class ExtractResponse(BaseModel):
    """response หลังสกัดค่าแล็บด้วย AI — คืน draft ที่สกัดได้ + parse_error (true ถ้า
    LLM คืน JSON ไม่ถูกรูป จึงได้ 0 แถว ให้กรอกเอง)"""
    ok: bool
    data: list[MeasurementOut]
    parse_error: bool = False


# patient_measurements.value is DECIMAL(12,4): |value| must stay < 1e8.
_VALUE_MIN = -99_999_999
_VALUE_MAX = 99_999_999


class ConfirmRequest(BaseModel):
    """request body ตอนแพทย์ยืนยันค่าแล็บทีละตัว — ทุก field optional (ยืนยันค่าที่
    สกัดได้เลย หรือแก้ก่อนยืนยัน)"""
    # All optional: doctor may just confirm the extracted values, or edit first.
    code: str | None = Field(default=None, max_length=32)
    value: float | None = Field(default=None, ge=_VALUE_MIN, le=_VALUE_MAX)
    unit: str | None = Field(default=None, max_length=24)
    measured_at: date | None = None
    note: str | None = Field(default=None, max_length=255)


class BulkConfirmItem(BaseModel):
    """หนึ่งรายการใน bulk confirm — id ของ draft ที่จะยืนยัน + field ที่จะแก้ (optional)"""
    id: int
    code: str | None = Field(default=None, max_length=32)
    value: float | None = Field(default=None, ge=_VALUE_MIN, le=_VALUE_MAX)
    unit: str | None = Field(default=None, max_length=24)
    measured_at: date | None = None
    note: str | None = Field(default=None, max_length=255)


class BulkConfirmRequest(BaseModel):
    """request body สำหรับยืนยันค่าแล็บหลายตัวพร้อมกัน (1-100 รายการ)"""
    items: list[BulkConfirmItem] = Field(min_length=1, max_length=100)


class CatalogItem(BaseModel):
    """response ของ marker หนึ่งตัวใน catalog (label + หน่วย + ช่วงอ้างอิง/optimal) —
    ให้ frontend ใช้แทนการ hardcode ช่วงค่าเอง"""
    code: str
    label_th: str
    unit: str
    panel: str
    ref_low: float
    ref_high: float
    optimal_low: float
    optimal_high: float


class CatalogResponse(BaseModel):
    """response ของ GET marker catalog"""
    data: list[CatalogItem]
