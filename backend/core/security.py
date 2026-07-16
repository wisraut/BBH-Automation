"""Password verification, JWT helpers, and auth dependencies."""
from datetime import UTC, datetime, timedelta
import os
from collections.abc import Iterable
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from repositories.user_repo import find_user_by_id

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def _jwt_secret() -> str:
    """อ่าน JWT_SECRET จาก env — บังคับยาว >= 32 ตัว ไม่งั้นโยน 503
    กันไม่ให้ระบบ sign token ด้วย secret อ่อน/ว่างซึ่งเดา/brute-force ได้"""
    secret = os.getenv("JWT_SECRET", "")
    if len(secret) < 32:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "AUTH_NOT_CONFIGURED",
                "message": "ระบบ Login ยังไม่ได้ตั้งค่า JWT_SECRET",
            },
        )
    return secret


def verify_password(plain_password: str, password_hash: str) -> bool:
    """เทียบรหัสผ่าน plaintext กับ bcrypt hash — คืน True เมื่อตรง
    ใช้ passlib จึงเทียบแบบ constant-time กัน timing attack"""
    return pwd_context.verify(plain_password, password_hash)


def hash_password(plain_password: str) -> str:
    """แฮชรหัสผ่านด้วย bcrypt ก่อนเก็บลง DB — ห้ามเก็บ plaintext เด็ดขาด"""
    return pwd_context.hash(plain_password)


def create_access_token(user: dict[str, Any]) -> tuple[str, datetime]:
    """สร้าง JWT access token (sub/email/role/exp) + คืนเวลาหมดอายุคู่กัน
    เวลาหมดอายุคืนมาด้วยเพื่อให้ caller ตั้ง cookie Max-Age ให้ตรงกับ exp ใน token"""
    expires_at = datetime.now(UTC) + timedelta(hours=int(os.getenv("JWT_EXPIRE_HOURS", "24")))
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": expires_at,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGORITHM), expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    """ถอดรหัส + verify JWT — โยน 401 (TOKEN_EXPIRED) เมื่อ token เสีย/หมดอายุ/ปลอม
    รวม error ทุกแบบเป็นข้อความเดียวเพื่อไม่บอกใบ้ attacker ว่าพลาดตรงไหน"""
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
        ) from exc


def _public_user(row: dict[str, Any]) -> dict[str, Any]:
    """คัดเฉพาะ field ที่เปิดเผยได้ออกจาก user row — กัน field ไว (เช่น password_hash)
    หลุดออกไปกับ response หรือ auth dependency"""
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "role": row["role"],
        "specialty": row.get("specialty"),
        "avatar_url": row.get("avatar_url"),
        "last_login_at": row.get("last_login_at"),
    }


JWT_COOKIE_NAME = "bbh_token"


def require_user(roles: Iterable[str] | None = None):
    """สร้าง FastAPI dependency สำหรับ endpoint ที่ต้อง login
    ส่ง roles มาเพื่อจำกัดเฉพาะบาง role (เช่น doctor/cro) — ไม่ส่ง = ผู้ login คนไหนก็ผ่าน"""
    allowed_roles = set(roles) if roles else None

    def dependency(
        request: Request,
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> dict[str, Any]:
        """ตรวจ auth ต่อ request: อ่าน token จาก cookie ก่อน (XSS-safe) fallback เป็น Bearer header
        แล้ว verify + โหลด user + เช็ค is_active + เช็ค role — ผ่านครบคืน public user, ไม่ผ่านโยน 401/403"""
        # Prefer HttpOnly cookie (XSS-safe). Fall back to Authorization header
        # so legacy CLI tests and the n8n bot can still authenticate.
        token: str | None = request.cookies.get(JWT_COOKIE_NAME)
        if not token and credentials is not None:
            token = credentials.credentials

        if not token:
            raise HTTPException(
                status_code=401,
                detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
            )

        payload = decode_access_token(token)
        user_id = int(payload.get("sub", 0))
        user = find_user_by_id(user_id)
        if not user or not user.get("is_active"):
            raise HTTPException(
                status_code=401,
                detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
            )

        if allowed_roles and user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail={"code": "INSUFFICIENT_ROLE", "message": "บัญชีนี้ไม่มีสิทธิ์ใช้งานหน้านี้"},
            )

        return _public_user(user)

    return dependency
