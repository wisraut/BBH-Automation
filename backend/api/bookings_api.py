"""JWT-protected booking endpoints for Web Dashboard (CRO + admin)."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query

from core.security import require_user
from schemas.bookings import (
    ApproveRequest,
    ApproveResponse,
    AssignDoctorRequest,
    BookingCreateRequest,
    BookingCreateResponse,
    BookingListResponse,
    BookingOut,
    CancelRequest,
    RejectRequest,
    RescheduleRequest,
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
    """Check Google Calendar conflict, create event, mark approved, push patient LINE.

    ``assigned_doctor_id`` is optional at the API layer for backwards compat with
    LINE CONFIRM (n8n) — the Web ApproveModal requires it."""
    result = booking_service.approve_booking(
        uid=request_uid,
        start_at=body.start_at,
        duration_min=body.duration_min,
        user=user,
        assigned_doctor_id=body.assigned_doctor_id,
    )
    return {"ok": True, **result}


@router.post("/{request_uid}/assign-doctor", response_model=BookingOut)
def assign_doctor(
    request_uid: str, body: AssignDoctorRequest, user: _CroOrAdmin,
) -> dict:
    """Set (or clear) the assigned doctor on a booking. Used to complete
    LINE-originated approvals or to correct a wrong assignment."""
    return booking_service.assign_doctor(
        uid=request_uid, assigned_doctor_id=body.assigned_doctor_id, user=user,
    )


@router.post("/{request_uid}/reject", response_model=SimpleOkResponse)
def reject_booking(request_uid: str, body: RejectRequest, user: _CroOrAdmin) -> dict:
    """Mark booking rejected, push patient LINE apology."""
    return booking_service.reject_booking(uid=request_uid, reason=body.reason, user=user)


@router.post("/{request_uid}/cancel", response_model=SimpleOkResponse)
def cancel_booking(request_uid: str, body: CancelRequest, user: _CroOrAdmin) -> dict:
    """Cancel an approved booking and remove its Google Calendar event."""
    return booking_service.cancel_booking(uid=request_uid, reason=body.reason, user=user)


@router.post("/{request_uid}/reschedule", response_model=BookingOut)
def reschedule_booking(
    request_uid: str, body: RescheduleRequest, user: _CroOrAdmin,
) -> dict:
    """Move an approved booking to a new slot. Cancels old calendar event,
    creates a new one, updates DB, pushes the patient on LINE. Keeps the
    same request_uid so audit/history is preserved."""
    return booking_service.reschedule_booking(
        uid=request_uid, new_start_at=body.new_start_at, user=user, reason=body.reason,
    )
