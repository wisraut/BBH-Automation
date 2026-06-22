"""Password verification, JWT helpers, and auth dependencies."""
from datetime import UTC, datetime, timedelta
import os
from collections.abc import Iterable
from typing import Annotated, Any

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from repositories.user_repo import find_user_by_id

ALGORITHM = "HS256"
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer(auto_error=False)


def _jwt_secret() -> str:
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
    return pwd_context.verify(plain_password, password_hash)


def hash_password(plain_password: str) -> str:
    return pwd_context.hash(plain_password)


def create_access_token(user: dict[str, Any]) -> tuple[str, datetime]:
    expires_at = datetime.now(UTC) + timedelta(hours=int(os.getenv("JWT_EXPIRE_HOURS", "24")))
    payload = {
        "sub": str(user["id"]),
        "email": user["email"],
        "role": user["role"],
        "exp": expires_at,
    }
    return jwt.encode(payload, _jwt_secret(), algorithm=ALGORITHM), expires_at


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        return jwt.decode(token, _jwt_secret(), algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(
            status_code=401,
            detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
        ) from exc


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


def require_user(roles: Iterable[str] | None = None):
    allowed_roles = set(roles) if roles else None

    def dependency(
        credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    ) -> dict[str, Any]:
        if credentials is None:
            raise HTTPException(
                status_code=401,
                detail={"code": "TOKEN_EXPIRED", "message": "กรุณาเข้าสู่ระบบใหม่"},
            )

        payload = decode_access_token(credentials.credentials)
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
