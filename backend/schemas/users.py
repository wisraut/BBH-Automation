"""Dashboard user (doctor) lookup schemas."""
from pydantic import BaseModel


class DoctorOut(BaseModel):
    id: int
    display_name: str
    specialty: str | None = None


class DoctorListResponse(BaseModel):
    data: list[DoctorOut]
