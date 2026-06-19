"""Dashboard auth endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response

from core.security import require_user
from schemas.auth import LoginRequest, LoginResponse, MeResponse, UserOut
from services.auth_service import login_user, logout_user

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
