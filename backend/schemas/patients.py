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
    notes: str | None = None
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
    notes: str | None = Field(default=None, max_length=2000)


class PatientUpdateRequest(BaseModel):
    """request body ตอนแก้ไขคนไข้ — ทุก field optional, ส่งมาเฉพาะ field ที่จะเปลี่ยน"""
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, max_length=20)
    email: str | None = Field(default=None, max_length=191)
    dob: date | None = None
    gender: Gender | None = None
    notes: str | None = Field(default=None, max_length=2000)
