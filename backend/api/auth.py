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
    """คืน IP จริงของ client โดยอ่านจาก X-Forwarded-For ก่อน (ผ่าน Cloudflare Tunnel)
    แล้ว fallback ไป request.client — ใช้บันทึก audit log ของ auth"""
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",", 1)[0].strip()
    return request.client.host if request.client else "unknown"


def _is_https_request(request: Request) -> bool:
    """ตรวจว่า request เดิมเป็น HTTPS ไหม โดยดู X-Forwarded-Proto ก่อน (เพราะ
    Cloudflare Tunnel ถอด TLS ทำให้ขาเข้า bridge เป็น http) — ใช้ตัดสิน secure flag ของ cookie"""
    # Cloudflare Tunnel terminates TLS — the inbound request to bridge is plain
    # http but the original scheme is in X-Forwarded-Proto.
    proto = request.headers.get("x-forwarded-proto", "").lower()
    if proto == "https":
        return True
    return request.url.scheme == "https"


def _set_session_cookies(response: Response, *, request: Request, token: str) -> None:
    """Set the HttpOnly JWT cookie + a readable CSRF cookie (double-submit pattern)."""
    import secrets

    secure = _is_https_request(request)
    response.set_cookie(
        key="bbh_token",
        value=token,
        httponly=True,
        secure=secure,
        samesite="lax" if secure else "strict",
        max_age=24 * 3600,
        path="/",
    )
    csrf = secrets.token_urlsafe(32)
    response.set_cookie(
        key="bbh_csrf",
        value=csrf,
        httponly=False,  # JS reads this and echoes back in X-CSRF-Token
        secure=secure,
        samesite="lax" if secure else "strict",
        max_age=24 * 3600,
        path="/",
    )


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest, request: Request, response: Response) -> dict:
    """Exchange email and password for a dashboard session.

    Sets an HttpOnly bbh_token cookie (XSS-safe) plus a readable bbh_csrf
    cookie. The token is also returned in the body so existing CLI tests
    and the n8n bot can use the Authorization-header path."""
    data = login_user(
        email=str(body.email),
        password=body.password,
        ip_address=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_session_cookies(response, request=request, token=data["token"])
    return data


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
    response.delete_cookie("bbh_token", path="/")
    response.delete_cookie("bbh_csrf", path="/")
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
