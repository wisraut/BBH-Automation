"""Structured measurement (lab/biomarker) request/response schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

MeasurementStatus = Literal["draft", "confirmed", "rejected"]


class MeasurementOut(BaseModel):
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
    data: list[MeasurementOut]


class ExtractResponse(BaseModel):
    ok: bool
    data: list[MeasurementOut]
    parse_error: bool = False


# patient_measurements.value is DECIMAL(12,4): |value| must stay < 1e8.
_VALUE_MIN = -99_999_999
_VALUE_MAX = 99_999_999


class ConfirmRequest(BaseModel):
    # All optional: doctor may just confirm the extracted values, or edit first.
    code: str | None = Field(default=None, max_length=32)
    value: float | None = Field(default=None, ge=_VALUE_MIN, le=_VALUE_MAX)
    unit: str | None = Field(default=None, max_length=24)
    measured_at: date | None = None
    note: str | None = Field(default=None, max_length=255)


class BulkConfirmItem(BaseModel):
    id: int
    code: str | None = Field(default=None, max_length=32)
    value: float | None = Field(default=None, ge=_VALUE_MIN, le=_VALUE_MAX)
    unit: str | None = Field(default=None, max_length=24)
    measured_at: date | None = None
    note: str | None = Field(default=None, max_length=255)


class BulkConfirmRequest(BaseModel):
    items: list[BulkConfirmItem] = Field(min_length=1, max_length=100)


class CatalogItem(BaseModel):
    code: str
    label_th: str
    unit: str
    panel: str
    ref_low: float
    ref_high: float
    optimal_low: float
    optimal_high: float


class CatalogResponse(BaseModel):
    data: list[CatalogItem]
