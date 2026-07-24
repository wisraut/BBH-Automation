"""Dashboard user (doctor) lookup + admin management schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DoctorOut(BaseModel):
    """ข้อมูลแพทย์แบบย่อสำหรับ dropdown เลือกแพทย์ (id + ชื่อ + สาขา)"""
    id: int
    display_name: str
    specialty: str | None = None


class DoctorListResponse(BaseModel):
    """response ของ GET รายชื่อแพทย์ (ใช้เติม dropdown assign แพทย์)"""
    data: list[DoctorOut]


# --- Admin user management ---

Role = Literal["admin", "doctor", "cro", "nurse", "lab_staff"]


class UserOut(BaseModel):
    """response ของผู้ใช้หนึ่งรายในหน้าจัดการ user ของ admin (รวม is_active/timestamps)"""
    id: int
    email: str
    display_name: str
    role: Role
    specialty: str | None = None
    avatar_url: str | None = None
    is_active: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class UserListResponse(BaseModel):
    """response ของ GET user list แบบแบ่งหน้า (หน้าจัดการ user ของ admin)"""
    data: list[UserOut]
    pagination: dict[str, int]


class UserCreateRequest(BaseModel):
    """request body ตอน admin สร้าง user ใหม่ — email ต้องผ่าน pattern, รหัสยาว 10-128"""
    email: str = Field(min_length=3, max_length=191, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    role: Role
    specialty: str | None = Field(default=None, max_length=120)


class UserUpdateRequest(BaseModel):
    """request body ตอน admin แก้ไข user — ทุก field optional (รวม toggle is_active)"""
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    specialty: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class PasswordResetRequest(BaseModel):
    """request body ตอน admin รีเซ็ตรหัสผ่านให้ user คนอื่น (รหัสใหม่ยาว 10-128)"""
    new_password: str = Field(min_length=10, max_length=128)
