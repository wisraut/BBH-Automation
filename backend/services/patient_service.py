"""Patient business logic — list, create (HN assign), update."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from repositories import patient_repo
from utils.pagination import paginate

TZ_BANGKOK = timezone(timedelta(hours=7))


def list_patients(
    *, search: str | None, page: int, limit: int, panel_doctor_id: int | None = None,
) -> dict[str, Any]:
    rows, total = patient_repo.list_patients(
        search=search, page=page, limit=limit, panel_doctor_id=panel_doctor_id,
    )
    return paginate(rows=rows, total=total, page=page, limit=limit)


def get_patient(patient_id: int) -> dict[str, Any]:
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
    year_yy = datetime.now(TZ_BANGKOK).strftime("%y")
    hn = patient_repo.reserve_hn(year_yy)
    new_id = patient_repo.create(
        hn=hn,
        display_name=body.display_name.strip(),
        phone=body.phone.strip() if body.phone else None,
        email=body.email.strip() if body.email else None,
        dob=body.dob,
        gender=body.gender,
        notes=body.notes.strip() if body.notes else None,
        created_by=user.get("id"),
    )
    return get_patient(new_id)


def update_patient(
    *, patient_id: int, body: Any, user: dict[str, Any]
) -> dict[str, Any]:
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
    if body.notes is not None:
        fields["notes"] = body.notes.strip() or None

    if not fields:
        return existing  # nothing to change
    patient_repo.update(patient_id=patient_id, fields=fields)
    return get_patient(patient_id)
