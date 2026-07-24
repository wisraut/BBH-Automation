"""Patient request/response schemas."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

Gender = Literal["male", "female", "other", "unknown"]


class PatientListItem(BaseModel):
    """แถวสรุปคนไข้สำหรับ list view (รวมยอด booking/report เพื่อโชว์ในตาราง)"""
    id: int
    hn: str | None = None
    display_name: str
    phone: str | None = None
    gender: Gender | None = None
    dob: date | None = None
    latest_visit_at: datetime | None = None
    total_bookings: int = 0
    total_reports: int = 0
    created_at: datetime


class PatientOut(BaseModel):
    """response แบบเต็มของคนไข้หนึ่งราย — ใช้ในหน้า detail/หลังสร้าง-แก้ไข"""
    id: int
    hn: str | None = None
    display_name: str
    phone: str | None = None
    email: str | None = None
    dob: date | None = None
    gender: Gender | None = None
    nationality: str | None = None
    national_id: str | None = None
    blood_type: str | None = None
    phone2: str | None = None
    phone3: str | None = None
    phone4: str | None = None
    address: str | None = None
    intake_by: str | None = None
    notes: str | None = None
    # Health-record intake fields (paper "บันทึกประวัติ / Health Record") — all optional.
    english_name: str | None = None
    religion: str | None = None
    marital_status: str | None = None
    occupation: str | None = None
    father_name: str | None = None
    father_phone: str | None = None
    mother_name: str | None = None
    mother_phone: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relation: str | None = None
    emergency_contact_phone: str | None = None
    emergency_contact_address: str | None = None
    past_illness: str | None = None
    congenital_disease: str | None = None
    drugs_supplements: str | None = None
    drug_allergy: str | None = None
    food_allergy: str | None = None
    chief_complaint: str | None = None
    smoking: bool | None = None
    smoking_years: int | None = None
    drinking: bool | None = None
    drinking_years: int | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class PaginationMeta(BaseModel):
    """meta การแบ่งหน้ามาตรฐาน (หน้าปัจจุบัน/จำนวนต่อหน้า/ยอดรวม/จำนวนหน้า)"""
    page: int
    limit: int
    total: int
    total_pages: int


class PatientListResponse(BaseModel):
    """response ของ GET patient list แบบแบ่งหน้า"""
    data: list[PatientListItem]
    pagination: PaginationMeta


class PatientCreateRequest(BaseModel):
    """request body ตอนสร้างคนไข้ใหม่ (HN ถูก assign ฝั่ง server ไม่รับจาก client)"""
    display_name: str = Field(min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=191)
    dob: date | None = None
    gender: Gender | None = None
    nationality: str | None = Field(default=None, max_length=60)
    national_id: str | None = Field(default=None, max_length=30)
    blood_type: str | None = Field(default=None, max_length=6)
    phone2: str | None = Field(default=None, max_length=20)
    phone3: str | None = Field(default=None, max_length=20)
    phone4: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=2000)
    intake_by: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    english_name: str | None = Field(default=None, max_length=120)
    religion: str | None = Field(default=None, max_length=60)
    marital_status: str | None = Field(default=None, max_length=30)
    occupation: str | None = Field(default=None, max_length=120)
    father_name: str | None = Field(default=None, max_length=120)
    father_phone: str | None = Field(default=None, max_length=20)
    mother_name: str | None = Field(default=None, max_length=120)
    mother_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_relation: str | None = Field(default=None, max_length=60)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_address: str | None = Field(default=None, max_length=500)
    past_illness: str | None = Field(default=None, max_length=2000)
    congenital_disease: str | None = Field(default=None, max_length=2000)
    drugs_supplements: str | None = Field(default=None, max_length=2000)
    drug_allergy: str | None = Field(default=None, max_length=2000)
    food_allergy: str | None = Field(default=None, max_length=2000)
    chief_complaint: str | None = Field(default=None, max_length=2000)
    smoking: bool | None = None
    smoking_years: int | None = Field(default=None, ge=0, le=120)
    drinking: bool | None = None
    drinking_years: int | None = Field(default=None, ge=0, le=120)


class PatientUpdateRequest(BaseModel):
    """request body ตอนแก้ไขคนไข้ — ทุก field optional, ส่งมาเฉพาะ field ที่จะเปลี่ยน"""
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=191)
    dob: date | None = None
    gender: Gender | None = None
    nationality: str | None = Field(default=None, max_length=60)
    national_id: str | None = Field(default=None, max_length=30)
    blood_type: str | None = Field(default=None, max_length=6)
    phone2: str | None = Field(default=None, max_length=20)
    phone3: str | None = Field(default=None, max_length=20)
    phone4: str | None = Field(default=None, max_length=20)
    address: str | None = Field(default=None, max_length=2000)
    intake_by: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    english_name: str | None = Field(default=None, max_length=120)
    religion: str | None = Field(default=None, max_length=60)
    marital_status: str | None = Field(default=None, max_length=30)
    occupation: str | None = Field(default=None, max_length=120)
    father_name: str | None = Field(default=None, max_length=120)
    father_phone: str | None = Field(default=None, max_length=20)
    mother_name: str | None = Field(default=None, max_length=120)
    mother_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_name: str | None = Field(default=None, max_length=120)
    emergency_contact_relation: str | None = Field(default=None, max_length=60)
    emergency_contact_phone: str | None = Field(default=None, max_length=20)
    emergency_contact_address: str | None = Field(default=None, max_length=500)
    past_illness: str | None = Field(default=None, max_length=2000)
    congenital_disease: str | None = Field(default=None, max_length=2000)
    drugs_supplements: str | None = Field(default=None, max_length=2000)
    drug_allergy: str | None = Field(default=None, max_length=2000)
    food_allergy: str | None = Field(default=None, max_length=2000)
    chief_complaint: str | None = Field(default=None, max_length=2000)
    smoking: bool | None = None
    smoking_years: int | None = Field(default=None, ge=0, le=120)
    drinking: bool | None = None
    drinking_years: int | None = Field(default=None, ge=0, le=120)
