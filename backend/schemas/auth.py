"""Auth request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["admin", "doctor", "cro", "nurse", "lab_staff"]


class LoginRequest(BaseModel):
    email: str = Field(min_length=3)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    email: str
    display_name: str
    role: Role
    specialty: str | None = None
    avatar_url: str | None = None
    last_login_at: datetime | None = None


class LoginResponse(BaseModel):
    token: str
    user: UserOut
    expires_at: datetime


class MeResponse(BaseModel):
    user: UserOut


class ChangePasswordRequest(BaseModel):
    old_password: str = Field(min_length=1)
    new_password: str = Field(min_length=10, max_length=200)


class AuditLogItem(BaseModel):
    id: int
    event_type: str
    email: str
    ip_address: str | None = None
    user_agent: str | None = None
    fail_reason: str | None = None
    created_at: datetime


class AuditLogListResponse(BaseModel):
    data: list[AuditLogItem]
