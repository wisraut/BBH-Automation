"""Booking request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

BookingStatus = Literal[
    "draft", "pending_approval", "approved", "rejected", "cancelled", "expired", "no_show"
]
BookingSource = Literal["line", "phone", "whatsapp", "email", "walkin"]
AppointmentType = Literal["new", "followup", "procedure", "consult"]


class BookingListItem(BaseModel):
    request_uid: str
    status: BookingStatus
    patient_name: str | None = None
    phone: str | None = None
    requested_datetime_text: str | None = None
    symptom: str | None = None
    booking_source: BookingSource
    appointment_type: AppointmentType
    created_at: datetime


class BookingOut(BookingListItem):
    channel: str
    external_user_id: str
    requested_date: str | None = None
    requested_time: str | None = None
    service_type: str | None = None
    doctor_code: str | None = None
    duration_min: int
    calendar_event_id: str | None = None
    calendar_event_url: str | None = None
    calendar_status: str
    assigned_doctor_id: int | None = None
    patient_id: int | None = None
    notes: str | None = None
    approved_by: str | None = None
    approved_at: datetime | None = None
    updated_at: datetime
    reminder_24h_sent_at: datetime | None = None
    reminder_1h_sent_at: datetime | None = None


class PaginationMeta(BaseModel):
    page: int
    limit: int
    total: int
    total_pages: int


class BookingListResponse(BaseModel):
    data: list[BookingListItem]
    pagination: PaginationMeta


class BookingCreateRequest(BaseModel):
    patient_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    requested_date: str = Field(min_length=1, max_length=20)
    requested_time: str = Field(min_length=1, max_length=20)
    symptom: str = Field(default="", max_length=1000)
    booking_source: BookingSource = "phone"


class BookingCreateResponse(BaseModel):
    ok: bool
    request_uid: str


class ApproveRequest(BaseModel):
    start_at: datetime = Field(description="ISO 8601 datetime (Asia/Bangkok). Slot start.")
    duration_min: int = Field(default=60, ge=15, le=240)
    assigned_doctor_id: int | None = Field(
        default=None,
        description=(
            "Optional at the API layer for backwards compatibility. The Web "
            "ApproveModal enforces selection; LINE-originated confirms may "
            "arrive without one and be assigned later via /assign-doctor."
        ),
    )


class AssignDoctorRequest(BaseModel):
    assigned_doctor_id: int | None = Field(
        description="Doctor user id, or null to unassign.",
    )


class RejectRequest(BaseModel):
    reason: str = Field(default="", max_length=500)


class CancelRequest(BaseModel):
    reason: str = Field(default="Cancelled by CRO", max_length=500)


class RescheduleRequest(BaseModel):
    new_start_at: datetime | None = Field(
        default=None,
        description=(
            "ISO 8601 (Asia/Bangkok). Slot start. Optional — omit to move the "
            "booking back to pending_approval so the patient can reconfirm a "
            "time later (used when the patient asks to reschedule but is not "
            "yet sure when)."
        ),
    )
    reason: str | None = Field(default=None, max_length=255)


class ApproveResponse(BaseModel):
    ok: bool
    calendar_event_id: str
    calendar_event_url: str
    patient_id: int
    hn: str | None = None


class SimpleOkResponse(BaseModel):
    ok: bool
