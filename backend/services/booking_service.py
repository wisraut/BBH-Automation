"""Booking business logic — list, approve (calendar + LINE push), reject (LINE push)."""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from integrations import calendar_client
from integrations.line_client import PRIMARY, push as line_push
from repositories import booking_repo
from utils.pagination import paginate

TZ_BANGKOK = timezone(timedelta(hours=7))


def list_bookings(*, status: str | None, page: int, limit: int) -> dict[str, Any]:
    rows, total = booking_repo.list_bookings(status=status, page=page, limit=limit)
    return paginate(rows=rows, total=total, page=page, limit=limit)


def get_booking(uid: str) -> dict[str, Any]:
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    return row


def approve_booking(
    *, uid: str, start_at: datetime, duration_min: int, user: dict[str, Any]
) -> dict[str, str]:
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    if row["status"] != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": f"รายการนี้ {row['status']} แล้ว — approve ไม่ได้",
            },
        )

    if not calendar_client.is_configured():
        raise HTTPException(
            status_code=503,
            detail={
                "code": "CALENDAR_DISABLED",
                "message": "Google Calendar service ยังไม่ได้ตั้งค่า",
            },
        )

    # Normalize to Asia/Bangkok if client sent naive datetime
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=TZ_BANGKOK)
    else:
        start_at = start_at.astimezone(TZ_BANGKOK)

    if not calendar_client.check_availability(start_at, duration_min):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CALENDAR_CONFLICT",
                "message": "ช่วงเวลานี้มีนัดอยู่แล้ว เลือกเวลาอื่น",
            },
        )

    patient_name = row.get("patient_name") or "ผู้ป่วย"
    phone = row.get("phone") or "-"
    symptom = row.get("symptom") or "-"
    summary = f"BBH — {patient_name}"
    description = (
        f"ผู้ป่วย: {patient_name}\nเบอร์: {phone}\nอาการ: {symptom}\n"
        f"Request UID: {uid}\nApproved by: {user.get('email')}"
    )

    event = calendar_client.book_event(
        summary=summary,
        description=description,
        start=start_at,
        duration_min=duration_min,
    )

    affected = booking_repo.update_approved(
        uid=uid,
        event_id=event["event_id"],
        event_url=event["html_link"],
        approved_by=str(user.get("email") or user.get("sub") or "cro"),
    )
    if affected == 0:
        # Lost race — another approver acted first; clean up the just-created event
        calendar_client.cancel_event(event["event_id"])
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": "รายการถูกอัปเดตโดยผู้อื่นแล้ว",
            },
        )

    _safe_push_patient(
        row.get("external_user_id"),
        f"✅ ยืนยันนัด {patient_name}\n"
        f"📅 {start_at.strftime('%d/%m/%Y %H:%M น.')}\n"
        f"ที่ BBH (Better Being Hospital)",
    )

    return {
        "calendar_event_id": event["event_id"],
        "calendar_event_url": event["html_link"],
    }


def reject_booking(
    *, uid: str, reason: str, user: dict[str, Any]
) -> dict[str, bool]:
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    if row["status"] != "pending_approval":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": f"รายการนี้ {row['status']} แล้ว — reject ไม่ได้",
            },
        )

    affected = booking_repo.update_rejected(
        uid=uid,
        reason=reason,
        rejected_by=str(user.get("email") or user.get("sub") or "cro"),
    )
    if affected == 0:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": "รายการถูกอัปเดตโดยผู้อื่นแล้ว",
            },
        )

    patient_name = row.get("patient_name") or "ผู้ป่วย"
    body = f"ขออภัย ไม่สามารถยืนยันนัดของ {patient_name} ได้ในตอนนี้"
    if reason:
        body += f"\nเหตุผล: {reason}"
    body += "\nเจ้าหน้าที่จะติดต่อกลับเพื่อหาวันใหม่ครับ"
    _safe_push_patient(row.get("external_user_id"), body)

    return {"ok": True}


def _safe_push_patient(user_id: str | None, text: str) -> None:
    if not user_id:
        return
    try:
        line_push(user_id, text, ch=PRIMARY)
    except Exception:  # noqa: BLE001 — push failure must not break the API response
        pass
