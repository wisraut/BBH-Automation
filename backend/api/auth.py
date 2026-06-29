"""Dashboard auth endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, Response

from core.security import require_user
from schemas.auth import (
    AuditLogListResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    UserOut,
)
from services.auth_service import (
    change_password,
    list_my_audit_logs,
    login_user,
    logout_user,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request) -> dict:
    """Exchange email and password for a dashboard JWT."""
    return login_user(
        email=str(body.email),
        password=body.password,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


@router.get("/me", response_model=MeResponse)
def me(user: Annotated[dict, Depends(require_user())]) -> dict:
    """Return the current dashboard user."""
    return {"user": UserOut.model_validate(user)}


@router.post("/logout", status_code=204)
def logout(
    request: Request,
    response: Response,
    user: Annotated[dict, Depends(require_user())],
) -> None:
    """Record logout audit for the current dashboard user."""
    logout_user(user=user, ip_address=_client_ip(request), user_agent=request.headers.get("user-agent"))
    response.status_code = 204


@router.post("/change-password", status_code=204)
def post_change_password(
    body: ChangePasswordRequest,
    request: Request,
    response: Response,
    user: Annotated[dict, Depends(require_user())],
) -> None:
    """Verify old password and persist a new bcrypt hash + audit log."""
    change_password(
        user=user,
        old_password=body.old_password,
        new_password=body.new_password,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    response.status_code = 204


@router.get("/audit-logs", response_model=AuditLogListResponse)
def get_my_audit_logs(
    user: Annotated[dict, Depends(require_user())],
    limit: int = Query(default=20, ge=1, le=100),
) -> dict:
    """Recent auth events for the current user (login/logout/password_change/fail)."""
    return list_my_audit_logs(user=user, limit=limit)
