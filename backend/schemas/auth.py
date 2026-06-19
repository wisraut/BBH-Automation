"""Auth request/response schemas."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Role = Literal["admin", "doctor", "cro"]


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


class LoginResponse(BaseModel):
    token: str
    user: UserOut
    expires_at: datetime


class MeResponse(BaseModel):
    user: UserOut
