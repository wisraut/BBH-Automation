"""JWT-protected booking endpoints for Web Dashboard (CRO + admin)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from core.security import require_user
from schemas.bookings import (
    ApproveRequest,
    ApproveResponse,
    BookingCreateRequest,
    BookingCreateResponse,
    BookingListResponse,
    BookingOut,
    RejectRequest,
    SimpleOkResponse,
)
from services import booking_service

router = APIRouter(prefix="/api/bookings", tags=["bookings"])

_CroOrAdmin = Annotated[dict, Depends(require_user(["cro", "admin"]))]


@router.get("", response_model=BookingListResponse)
def list_bookings(
    user: _CroOrAdmin,
    status: str | None = Query(default=None, pattern="^(draft|pending_approval|approved|rejected|cancelled|expired)$"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """List bookings with optional status filter + pagination."""
    return booking_service.list_bookings(status=status, page=page, limit=limit)


@router.post("", response_model=BookingCreateResponse)
def create_booking(body: BookingCreateRequest, user: _CroOrAdmin) -> dict:
    """Create a manual booking from Web Dashboard using JWT auth."""
    return booking_service.create_booking(body=body, user=user)


@router.get("/{request_uid}", response_model=BookingOut)
def get_booking(request_uid: str, user: _CroOrAdmin) -> dict:
    """Get a single booking by request_uid."""
    return booking_service.get_booking(request_uid)


@router.post("/{request_uid}/approve", response_model=ApproveResponse)
def approve_booking(request_uid: str, body: ApproveRequest, user: _CroOrAdmin) -> dict:
    """Check Google Calendar conflict, create event, mark approved, push patient LINE."""
    result = booking_service.approve_booking(
        uid=request_uid,
        start_at=body.start_at,
        duration_min=body.duration_min,
        user=user,
    )
    return {"ok": True, **result}


@router.post("/{request_uid}/reject", response_model=SimpleOkResponse)
def reject_booking(request_uid: str, body: RejectRequest, user: _CroOrAdmin) -> dict:
    """Mark booking rejected, push patient LINE apology."""
    return booking_service.reject_booking(uid=request_uid, reason=body.reason, user=user)
