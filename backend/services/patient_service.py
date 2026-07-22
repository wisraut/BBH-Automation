"""Patient business logic — list, create (HN assign), update."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from repositories import patient_repo
from utils.pagination import paginate

TZ_BANGKOK = timezone(timedelta(hours=7))


def list_patients(
    *, search: str | None, page: int, limit: int, panel_doctor_id: int | None = None,
    sort_key: str = "hn", direction: str = "desc",
) -> dict[str, Any]:
    """คืนรายชื่อคนไข้แบบแบ่งหน้า ค้นด้วย search ได้; panel_doctor_id จำกัดเฉพาะ
    คนไข้ในความดูแลของแพทย์คนนั้น (ใช้ในมุมมองของหมอ)"""
    rows, total = patient_repo.list_patients(
        search=search, page=page, limit=limit, panel_doctor_id=panel_doctor_id,
        sort_key=sort_key, direction=direction,
    )
    return paginate(rows=rows, total=total, page=page, limit=limit)


def get_patient(patient_id: int) -> dict[str, Any]:
    """คืนข้อมูลคนไข้รายเดียว — 404 ถ้าไม่พบ (หรือถูก soft-delete ไปแล้ว)"""
    row = patient_repo.get_by_id(patient_id)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )
    return row


def delete_patient(patient_id: int, *, user: dict[str, Any]) -> dict[str, bool]:
    """Soft delete the patient row. Related reports/bookings/audit rows are
    retained for the legal retention window. Idempotent."""
    row = patient_repo.get_by_id(patient_id, include_deleted=True)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )
    patient_repo.soft_delete(patient_id, deleted_by=int(user["id"]))
    return {"ok": True}


def create_patient(*, body: Any, user: dict[str, Any]) -> dict[str, Any]:
    """สร้างคนไข้ใหม่ — จอง HN แบบ atomic ตามปี พ.ศ. (ปีจากเวลาไทย), strip ช่องว่าง
    field ที่พิมพ์มา แล้วคืนคนไข้ที่สร้างเสร็จ"""
    year_yy = datetime.now(TZ_BANGKOK).strftime("%y")
    hn = patient_repo.reserve_hn(year_yy)
    new_id = patient_repo.create(
        hn=hn,
        display_name=body.display_name.strip(),
        phone=body.phone.strip() if body.phone else None,
        email=body.email.strip() if body.email else None,
        dob=body.dob,
        gender=body.gender,
        nationality=body.nationality.strip() if body.nationality else None,
        notes=body.notes.strip() if body.notes else None,
        created_by=user.get("id"),
    )
    return get_patient(new_id)


def update_patient(
    *, patient_id: int, body: Any, user: dict[str, Any]
) -> dict[str, Any]:
    """อัปเดตคนไข้แบบ partial — อัปเดตเฉพาะ field ที่ส่งมา (ไม่ใช่ None); ถ้าไม่มี
    field ให้แก้เลยคืนข้อมูลเดิม ไม่ยิง DB เปล่าๆ"""
    existing = get_patient(patient_id)
    fields: dict[str, Any] = {}
    if body.display_name is not None:
        fields["display_name"] = body.display_name.strip()
    if body.phone is not None:
        fields["phone"] = body.phone.strip() or None
    if body.email is not None:
        fields["email"] = body.email.strip() or None
    if body.dob is not None:
        fields["dob"] = body.dob
    if body.gender is not None:
        fields["gender"] = body.gender
    if body.nationality is not None:
        fields["nationality"] = body.nationality.strip() or None
    if body.national_id is not None:
        fields["national_id"] = body.national_id.strip() or None
    if body.blood_type is not None:
        fields["blood_type"] = body.blood_type.strip() or None
    if body.phone2 is not None:
        fields["phone2"] = body.phone2.strip() or None
    if body.phone3 is not None:
        fields["phone3"] = body.phone3.strip() or None
    if body.phone4 is not None:
        fields["phone4"] = body.phone4.strip() or None
    if body.address is not None:
        fields["address"] = body.address.strip() or None
    if body.intake_by is not None:
        fields["intake_by"] = body.intake_by.strip() or None
    if body.notes is not None:
        fields["notes"] = body.notes.strip() or None

    if not fields:
        return existing  # nothing to change
    patient_repo.update(patient_id=patient_id, fields=fields)
    return get_patient(patient_id)
