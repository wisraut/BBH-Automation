"""Business logic for dashboard authentication."""
from typing import Any

from fastapi import HTTPException

from core.security import create_access_token, verify_password
from repositories.user_repo import (
    find_user_by_email,
    insert_auth_audit,
    mark_login_success,
    mark_logout,
)


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "role": row["role"],
        "specialty": row.get("specialty"),
        "avatar_url": row.get("avatar_url"),
    }


def login_user(
    *,
    email: str,
    password: str,
    ip_address: str,
    user_agent: str | None,
) -> dict[str, Any]:
    normalized_email = email.strip().lower()
    user = find_user_by_email(normalized_email)

    if not user or not user.get("is_active") or not verify_password(password, user["password_hash"]):
        insert_auth_audit(
            event_type="login_fail",
            user_id=user["id"] if user else None,
            email=normalized_email,
            ip_address=ip_address,
            user_agent=user_agent,
            fail_reason="invalid_credentials",
        )
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CREDENTIALS", "message": "อีเมลหรือรหัสผ่านไม่ถูกต้อง"},
        )

    token, expires_at = create_access_token(user)
    mark_login_success(user["id"])
    insert_auth_audit(
        event_type="login_success",
        user_id=user["id"],
        email=normalized_email,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return {"token": token, "user": _public_user(user), "expires_at": expires_at}


def logout_user(*, user: dict[str, Any], ip_address: str, user_agent: str | None) -> None:
    mark_logout(user["id"])
    insert_auth_audit(
        event_type="logout",
        user_id=user["id"],
        email=user["email"],
        ip_address=ip_address,
        user_agent=user_agent,
    )
