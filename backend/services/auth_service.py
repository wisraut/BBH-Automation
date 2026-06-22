"""Business logic for dashboard authentication."""
from typing import Any

from fastapi import HTTPException

from core.security import create_access_token, hash_password, verify_password
from repositories.user_repo import (
    find_user_by_email,
    find_user_by_id,
    insert_auth_audit,
    list_audit_logs_by_user,
    mark_login_success,
    mark_logout,
    update_password_hash,
)


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "role": row["role"],
        "specialty": row.get("specialty"),
        "avatar_url": row.get("avatar_url"),
        "last_login_at": row.get("last_login_at"),
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


def change_password(
    *,
    user: dict[str, Any],
    old_password: str,
    new_password: str,
    ip_address: str,
    user_agent: str | None,
) -> None:
    """Verify the old password, hash the new one, persist, and audit."""
    full = find_user_by_id(user["id"])
    if not full or not full.get("is_active"):
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
        )
    if not verify_password(old_password, full["password_hash"]):
        insert_auth_audit(
            event_type="login_fail",
            user_id=full["id"],
            email=full["email"],
            ip_address=ip_address,
            user_agent=user_agent,
            fail_reason="password_change_wrong_old",
        )
        raise HTTPException(
            status_code=400,
            detail={"code": "WRONG_OLD_PASSWORD", "message": "รหัสผ่านเดิมไม่ถูกต้อง"},
        )
    if new_password == old_password:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "SAME_PASSWORD",
                "message": "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม",
            },
        )
    update_password_hash(full["id"], hash_password(new_password))
    insert_auth_audit(
        event_type="password_change",
        user_id=full["id"],
        email=full["email"],
        ip_address=ip_address,
        user_agent=user_agent,
    )


def list_my_audit_logs(*, user: dict[str, Any], limit: int = 20) -> dict[str, Any]:
    rows = list_audit_logs_by_user(user["id"], limit=limit)
    return {"data": rows}
