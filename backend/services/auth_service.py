"""Business logic for dashboard authentication."""
import os
import time
from collections import defaultdict, deque
from threading import Lock
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


# ─── Pilot allowlist ──────────────────────────────────────────────────────
# Until doctor/nurse/lab_staff workspaces are ready for real use, only admin
# and CRO may log in. Override via env LOGIN_ALLOWED_ROLES="admin,cro,doctor"
# when ready to widen access.
_ALLOWED_ROLES = set(
    r.strip().lower()
    for r in os.getenv("LOGIN_ALLOWED_ROLES", "admin,cro").split(",")
    if r.strip()
)


# ─── Login rate limiter ───────────────────────────────────────────────────
# Sliding window: max 5 attempts per IP in the last 15 minutes. In-memory is
# fine for single-instance pilot; switch to Redis when scaling.
_RATE_WINDOW_SEC = 15 * 60
_RATE_MAX = 5
_attempts: dict[str, deque[float]] = defaultdict(deque)
_attempts_lock = Lock()


def _rate_limit_check(ip: str) -> None:
    now = time.time()
    with _attempts_lock:
        bucket = _attempts[ip]
        # Drop entries outside the window.
        while bucket and now - bucket[0] > _RATE_WINDOW_SEC:
            bucket.popleft()
        if len(bucket) >= _RATE_MAX:
            retry_after = int(_RATE_WINDOW_SEC - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=429,
                detail={
                    "code": "RATE_LIMITED",
                    "message": f"พยายามเข้าระบบบ่อยเกินไป กรุณารอ {retry_after} วินาที",
                },
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)


_COMMON_PASSWORDS = {
    "1234567890", "0123456789", "qwertyuiop", "password12", "password123",
    "password1234", "admin12345", "letmein1234", "welcome123", "abcdef1234",
    "abcdefghij", "12345abcde", "asdfghjklq", "iloveyou12",
}


def _check_password_strength(pw: str) -> None:
    """Beyond min-length, require ≥3 of (lowercase / uppercase / digit / symbol)
    and reject obvious common patterns. Cheap and stops the worst offenders
    without forcing legacy mainframe theatrics."""
    if len(pw) < 10:
        raise HTTPException(400, {
            "code": "WEAK_PASSWORD", "message": "รหัสผ่านต้องยาวอย่างน้อย 10 ตัว",
        })
    classes = sum([
        any(c.islower() for c in pw),
        any(c.isupper() for c in pw),
        any(c.isdigit() for c in pw),
        any(not c.isalnum() for c in pw),
    ])
    if classes < 3:
        raise HTTPException(400, {
            "code": "WEAK_PASSWORD",
            "message": "รหัสผ่านต้องมี 3 ประเภทขึ้นไป (พิมพ์เล็ก/พิมพ์ใหญ่/ตัวเลข/สัญลักษณ์)",
        })
    if pw.lower() in _COMMON_PASSWORDS:
        raise HTTPException(400, {
            "code": "WEAK_PASSWORD", "message": "รหัสผ่านนี้พบในรายการรหัสผ่านที่ใช้บ่อย",
        })


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
    # Rate limit BEFORE touching DB so login flood can't DoS MySQL.
    _rate_limit_check(ip_address or "unknown")

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

    # Pilot allowlist: roles not yet supported get a clear message instead of
    # a JWT they can't use.
    if user.get("role") not in _ALLOWED_ROLES:
        insert_auth_audit(
            event_type="login_fail",
            user_id=user["id"],
            email=normalized_email,
            ip_address=ip_address,
            user_agent=user_agent,
            fail_reason=f"role_not_allowed:{user.get('role')}",
        )
        raise HTTPException(
            status_code=403,
            detail={
                "code": "ROLE_NOT_AVAILABLE",
                "message": (
                    "ระบบส่วน " f"{user.get('role')} ยังไม่เปิดให้ใช้งานในขณะนี้ "
                    "กรุณารอประกาศจากผู้ดูแลระบบ"
                ),
            },
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
    _check_password_strength(new_password)
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
