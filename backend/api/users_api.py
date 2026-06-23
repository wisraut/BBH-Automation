"""JWT-protected lookup endpoints for Web Dashboard users (e.g. doctor list)."""
from typing import Annotated

from fastapi import APIRouter, Depends

from core.security import require_user
from repositories import user_repo
from schemas.users import DoctorListResponse

router = APIRouter(tags=["users"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]


@router.get("/api/doctors", response_model=DoctorListResponse)
def list_doctors(user: _StaffUser) -> dict:
    """List active doctors for assignment dropdowns."""
    return {"data": user_repo.list_doctors()}
