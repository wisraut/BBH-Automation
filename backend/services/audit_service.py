"""Audit logging glue — pulls actor + request context for callers."""
from typing import Any

from fastapi import Request

from repositories import audit_repo


def record_access(
    request: Request | None,
    user: dict[str, Any] | None,
    *,
    action: str,
    subject_type: str,
    subject_id: str | int,
    patient_id: int | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Fire-and-forget audit row. Errors swallowed inside repo."""
    ip = None
    ua = None
    path = None
    method = None
    if request is not None:
        client = request.client
        ip = client.host if client else None
        ua = request.headers.get("user-agent")
        path = str(request.url.path)
        method = request.method
    audit_repo.log_access(
        actor=user,
        action=action,
        subject_type=subject_type,
        subject_id=str(subject_id),
        patient_id=patient_id,
        ip_address=ip,
        user_agent=ua,
        request_path=path,
        request_method=method,
        extra=extra,
    )


def list_audit(
    *,
    actor_id: int | None,
    patient_id: int | None,
    action: str | None,
    date_from: str | None,
    date_to: str | None,
    page: int,
    limit: int,
) -> dict[str, Any]:
    page = max(1, page)
    limit = max(1, min(200, limit))
    rows, total = audit_repo.list_access(
        actor_id=actor_id, patient_id=patient_id, action=action,
        date_from=date_from, date_to=date_to, page=page, limit=limit,
    )
    pages = (total + limit - 1) // limit if limit else 1
    return {
        "data": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": pages},
    }
