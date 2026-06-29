"""Dashboard auth endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response

from core import totp
from core.security import require_user, verify_password
from repositories import user_repo
from schemas.auth import (
    AuditLogListResponse,
    ChangePasswordRequest,
    LoginRequest,
    LoginResponse,
    MeResponse,
    TotpDisableRequest,
    TotpEnableRequest,
    TotpSetupResponse,
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
        otp_code=body.otp_code,
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


# --- TOTP 2FA --------------------------------------------------------------

@router.get("/2fa/status")
def totp_status(user: Annotated[dict, Depends(require_user())]) -> dict:
    row = user_repo.get_totp(int(user["id"]))
    return {
        "enabled": bool(row and row.get("totp_enabled")),
        "pending_setup": bool(row and row.get("totp_secret") and not row.get("totp_enabled")),
        "enrolled_at": row.get("totp_enrolled_at") if row else None,
    }


@router.post("/2fa/setup", response_model=TotpSetupResponse)
def totp_setup(user: Annotated[dict, Depends(require_user())]) -> dict:
    """Generate a fresh secret, save as unconfirmed, return secret + otpauth URL.
    Calling this again replaces any pending secret (and disables 2FA until
    re-confirmed)."""
    secret = totp.generate_secret()
    user_repo.set_totp_secret(int(user["id"]), secret)
    return {
        "secret": secret,
        "otpauth_url": totp.otpauth_url(secret, label=user["email"]),
    }


@router.post("/2fa/enable", status_code=204)
def totp_enable(
    body: TotpEnableRequest,
    user: Annotated[dict, Depends(require_user())],
    response: Response,
) -> None:
    """Confirm setup by submitting a current code from the authenticator app."""
    row = user_repo.get_totp(int(user["id"]))
    if not row or not row.get("totp_secret"):
        raise HTTPException(
            400, {"code": "NO_PENDING_SETUP", "message": "ยังไม่ได้เริ่ม setup 2FA"},
        )
    if not totp.verify(row["totp_secret"], body.code):
        raise HTTPException(401, {"code": "INVALID_OTP", "message": "รหัสไม่ถูกต้อง"})
    user_repo.confirm_totp(int(user["id"]))
    response.status_code = 204


@router.post("/2fa/disable", status_code=204)
def totp_disable(
    body: TotpDisableRequest,
    user: Annotated[dict, Depends(require_user())],
    response: Response,
) -> None:
    """Require password + current OTP to disable. Sensitive action."""
    row = user_repo.get_totp(int(user["id"]))
    if not row or not row.get("totp_enabled"):
        raise HTTPException(400, {"code": "TOTP_NOT_ENABLED", "message": "ยังไม่เปิดใช้ 2FA"})
    full = user_repo.find_user_by_id(int(user["id"]))
    if not full or not verify_password(body.password, full["password_hash"]):
        raise HTTPException(401, {"code": "INVALID_PASSWORD", "message": "รหัสผ่านไม่ถูกต้อง"})
    if not totp.verify(row["totp_secret"], body.code):
        raise HTTPException(401, {"code": "INVALID_OTP", "message": "รหัส 2FA ไม่ถูกต้อง"})
    user_repo.disable_totp(int(user["id"]))
    response.status_code = 204
