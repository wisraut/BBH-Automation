"""Dashboard user (doctor) lookup + admin management schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DoctorOut(BaseModel):
    id: int
    display_name: str
    specialty: str | None = None


class DoctorListResponse(BaseModel):
    data: list[DoctorOut]


# --- Admin user management ---

Role = Literal["admin", "doctor", "cro", "nurse", "lab_staff"]


class UserOut(BaseModel):
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
    data: list[UserOut]
    pagination: dict[str, int]


class UserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=191, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=10, max_length=128)
    display_name: str = Field(min_length=1, max_length=120)
    role: Role
    specialty: str | None = Field(default=None, max_length=120)


class UserUpdateRequest(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: Role | None = None
    specialty: str | None = Field(default=None, max_length=120)
    is_active: bool | None = None


class PasswordResetRequest(BaseModel):
    new_password: str = Field(min_length=10, max_length=128)
