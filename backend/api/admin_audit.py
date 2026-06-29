"""Admin patient-access audit viewer."""
from fastapi import APIRouter, Depends, Query

from core.security import require_user
from services import audit_service


router = APIRouter(prefix="/api/admin/audit", tags=["admin-audit"])

_admin_only = require_user(["admin"])


@router.get("")
def list_audit(
    actor_id: int | None = Query(default=None),
    patient_id: int | None = Query(default=None),
    action: str | None = Query(default=None, max_length=64),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _user=Depends(_admin_only),
):
    """Patient record access audit log — HIPAA-like trail.

    Filter combinations: any of actor_id / patient_id / action / date range.
    Pagination: default 50 / max 200.
    """
    return audit_service.list_audit(
        actor_id=actor_id,
        patient_id=patient_id,
        action=action,
        date_from=date_from,
        date_to=date_to,
        page=page,
        limit=limit,
    )
