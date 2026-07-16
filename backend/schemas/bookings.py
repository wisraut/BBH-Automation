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
    """แถวสรุป booking สำหรับ list view (field ที่จำเป็นต่อการแสดงในตาราง)"""
    request_uid: str
    status: BookingStatus
    patient_name: str | None = None
    phone: str | None = None
    requested_datetime_text: str | None = None
    symptom: str | None = None
    booking_source: BookingSource
    appointment_type: AppointmentType
    assigned_doctor_id: int | None = None
    created_at: datetime


class PatientCandidate(BaseModel):
    """An existing patient whose normalized phone matches this booking — shown
    to the CRO at approve time so they confirm identity instead of the system
    merging on phone alone."""
    id: int
    hn: str | None = None
    display_name: str
    phone: str | None = None
    dob: str | None = None
    latest_visit_at: datetime | None = None


class BookingOut(BookingListItem):
    """response แบบเต็มของ booking หนึ่งใบ (ต่อยอดจาก list item เพิ่มข้อมูล calendar,
    การ approve, patient link, และ candidate คนไข้ที่เบอร์ตรงกัน) — ใช้ในหน้า detail"""
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
    # Populated only for a pending booking with no linked patient yet: existing
    # charts sharing this phone. Empty = no collision (approve auto-creates).
    patient_candidates: list[PatientCandidate] = []


class PaginationMeta(BaseModel):
    """meta การแบ่งหน้ามาตรฐาน (หน้าปัจจุบัน/จำนวนต่อหน้า/ยอดรวม/จำนวนหน้า)"""
    page: int
    limit: int
    total: int
    total_pages: int


class BookingListResponse(BaseModel):
    """response ของ GET booking list แบบแบ่งหน้า"""
    data: list[BookingListItem]
    pagination: PaginationMeta


class BookingCreateRequest(BaseModel):
    """request body ตอน CRO สร้าง booking เอง (เช่นรับนัดทางโทรศัพท์)"""
    patient_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(min_length=1, max_length=40)
    requested_date: str = Field(min_length=1, max_length=20)
    requested_time: str = Field(min_length=1, max_length=20)
    symptom: str = Field(default="", max_length=1000)
    booking_source: BookingSource = "phone"


class BookingCreateResponse(BaseModel):
    """response หลังสร้าง booking — คืน request_uid ของนัดใหม่"""
    ok: bool
    request_uid: str


class ApproveRequest(BaseModel):
    """request body ตอน CRO อนุมัติ booking — เวลาเริ่ม + แพทย์ + วิธี resolve ตัวตน
    คนไข้ (link chart เดิม หรือสร้างใหม่เมื่อเบอร์ชนกัน; ดู PatientCandidate)"""
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
    # Patient identity resolution (see PatientCandidate). When the booking's
    # phone matches an existing chart, the CRO must pick one of these before
    # approve succeeds — otherwise the API returns 409 PATIENT_MATCH_REQUIRED.
    link_patient_id: int | None = Field(
        default=None,
        description="Link to this existing patient id (must be one of the candidates).",
    )
    create_new_patient: bool = Field(
        default=False,
        description="Create a fresh patient even though the phone matches an existing one.",
    )


class AssignDoctorRequest(BaseModel):
    """request body สำหรับกำหนด/ยกเลิกแพทย์ที่รับผิดชอบ booking (null = unassign) —
    ใช้แก้ทีหลังกับนัดจาก LINE ที่ยังไม่มีแพทย์ตอน approve"""
    assigned_doctor_id: int | None = Field(
        description="Doctor user id, or null to unassign.",
    )


class RejectRequest(BaseModel):
    """request body ตอนปฏิเสธ booking — เหตุผลประกอบ (ไม่บังคับ)"""
    reason: str = Field(default="", max_length=500)


class CancelRequest(BaseModel):
    """request body ตอนยกเลิก booking ที่อนุมัติไปแล้ว — เหตุผลประกอบ"""
    reason: str = Field(default="Cancelled by CRO", max_length=500)


class RescheduleRequest(BaseModel):
    """request body ตอนเลื่อนนัด — มีเวลาใหม่ = ยืนยันเวลาเลย, ละ new_start_at = ดัน
    booking กลับ pending_approval (กรณีคนไข้ขอเลื่อนแต่ยังไม่รู้เวลา/TBD)"""
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
    """response หลัง approve สำเร็จ — id/url ของ Google Calendar event ที่สร้าง +
    คนไข้ที่ผูก (patient_id/hn)"""
    ok: bool
    calendar_event_id: str
    calendar_event_url: str
    patient_id: int
    hn: str | None = None


class SimpleOkResponse(BaseModel):
    """response มาตรฐานแบบสั้นสำหรับ action ที่ไม่คืนข้อมูล (แค่บอกว่าสำเร็จ)"""
    ok: bool


class RescheduledMark(BaseModel):
    """A booking currently in a rescheduled state — for the gray marker on
    the Calendar day cell. Display date is the new date for with-time
    reschedules or the ORIGINAL date (from audit log) for TBD ones."""
    request_uid: str
    patient_name: str | None = None
    display_date: str = Field(description="YYYY-MM-DD — the date to render the marker on")
    is_tbd: bool = Field(description="True if the reschedule has no committed new time yet")
    current_status: BookingStatus
