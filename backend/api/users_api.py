"""JWT-protected lookup + admin user-management endpoints."""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException

from core.security import hash_password, require_user
from repositories import user_repo
from services.auth_service import _check_password_strength
from schemas.users import (
    DoctorListResponse,
    PasswordResetRequest,
    UserCreateRequest,
    UserListResponse,
    UserOut,
    UserUpdateRequest,
)

router = APIRouter(tags=["users"])

_StaffUser = Annotated[dict, Depends(require_user(["cro", "doctor", "admin"]))]
_AdminUser = Annotated[dict, Depends(require_user(["admin"]))]


@router.get("/api/doctors", response_model=DoctorListResponse)
def list_doctors(user: _StaffUser) -> dict:
    """List active doctors for assignment dropdowns."""
    return {"data": user_repo.list_doctors()}


# --- Admin user management ---

@router.get("/api/users", response_model=UserListResponse)
def admin_list_users(
    user: _AdminUser,
    role: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 30,
) -> dict:
    """admin ดูรายการ user ทั้งระบบ กรองตาม role/สถานะ/คำค้น พร้อม pagination"""
    page = max(1, page)
    limit = max(1, min(100, limit))
    rows, total = user_repo.list_users(
        role=role, is_active=is_active, search=search, page=page, limit=limit,
    )
    pages = (total + limit - 1) // limit if limit else 1
    return {
        "data": rows,
        "pagination": {"page": page, "limit": limit, "total": total, "total_pages": pages},
    }


@router.post("/api/users", response_model=UserOut, status_code=201)
def admin_create_user(body: UserCreateRequest, user: _AdminUser) -> dict:
    """admin สร้าง user ใหม่ (หมอ/พยาบาล/cro/admin) — กันอีเมลซ้ำ, เช็คความแข็งแรง
    รหัสผ่าน, hash แล้ว insert; คืน user ที่เพิ่งสร้าง"""
    if user_repo.find_user_by_email(body.email):
        raise HTTPException(
            status_code=409,
            detail={"code": "EMAIL_EXISTS", "message": "อีเมลนี้ถูกใช้แล้ว"},
        )
    _check_password_strength(body.password)
    new_id = user_repo.create_user(
        email=str(body.email),
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        role=body.role,
        specialty=body.specialty,
    )
    row = user_repo.find_user_by_id(new_id)
    if not row:
        raise HTTPException(500, {"code": "USER_NOT_FOUND_AFTER_CREATE", "message": "ผิดพลาด"})
    return row


@router.patch("/api/users/{user_id}", response_model=UserOut)
def admin_update_user(user_id: int, body: UserUpdateRequest, user: _AdminUser) -> dict:
    """admin แก้ไขข้อมูล user (ชื่อ/role/specialty/สถานะ) — กันไม่ให้ admin
    disable หรือลด role ของตัวเอง; คืน user หลังอัปเดต"""
    existing = user_repo.find_user_by_id(user_id)
    if not existing:
        raise HTTPException(404, {"code": "USER_NOT_FOUND", "message": "ไม่พบ user"})
    if user_id == int(user["id"]) and body.is_active is False:
        raise HTTPException(
            400, {"code": "CANNOT_DISABLE_SELF", "message": "ห้าม disable user ตัวเอง"},
        )
    if user_id == int(user["id"]) and body.role is not None and body.role != "admin":
        raise HTTPException(
            400, {"code": "CANNOT_DEMOTE_SELF", "message": "ห้ามเปลี่ยน role ของตัวเองออกจาก admin"},
        )
    user_repo.update_user_fields(
        user_id,
        display_name=body.display_name,
        role=body.role,
        specialty=body.specialty,
        is_active=body.is_active,
    )
    row = user_repo.find_user_by_id(user_id)
    return row or {}


@router.post("/api/users/{user_id}/reset-password", status_code=204)
def admin_reset_password(user_id: int, body: PasswordResetRequest, user: _AdminUser) -> None:
    """admin รีเซ็ตรหัสผ่านให้ user คนอื่น — เช็คความแข็งแรงรหัสใหม่แล้ว hash เก็บ;
    raise 404 ถ้าไม่พบ user"""
    existing = user_repo.find_user_by_id(user_id)
    if not existing:
        raise HTTPException(404, {"code": "USER_NOT_FOUND", "message": "ไม่พบ user"})
    _check_password_strength(body.new_password)
    user_repo.update_password_hash(user_id, hash_password(body.new_password))
