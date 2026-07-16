"""Auth request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["admin", "doctor", "cro", "nurse", "lab_staff"]


class LoginRequest(BaseModel):
    """request body ของ POST login — email + password"""
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    """ข้อมูลผู้ใช้ที่ปลอดภัยส่งออก client (ไม่มี password_hash) — ใช้ใน login/me response"""
    id: int
    email: str
    display_name: str
    role: Role
    specialty: str | None = None
    avatar_url: str | None = None
    last_login_at: datetime | None = None


class LoginResponse(BaseModel):
    """response ของ login สำเร็จ — JWT token + ข้อมูล user + เวลาหมดอายุ token"""
    token: str
    user: UserOut
    expires_at: datetime


class MeResponse(BaseModel):
    """response ของ GET me — ข้อมูล user ที่ล็อกอินอยู่"""
    user: UserOut


class ChangePasswordRequest(BaseModel):
    """request body ของเปลี่ยนรหัสผ่าน — รหัสเดิม + รหัสใหม่ (ยาว 10-128; ความแข็งแรง
    เช็คเพิ่มที่ service layer)"""
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=128)


class AuditLogItem(BaseModel):
    """audit log เข้าใช้งานหนึ่งรายการ (login/logout/เปลี่ยนรหัส) — โชว์ประวัติของผู้ใช้"""
    id: int
    event_type: str
    email: str
    ip_address: str | None = None
    user_agent: str | None = None
    fail_reason: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    """response ของ GET auth audit log ของผู้ใช้ตัวเอง"""
    data: list[AuditLogItem]
