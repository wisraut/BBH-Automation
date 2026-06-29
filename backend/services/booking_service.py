"""Booking business logic — list, approve (calendar + LINE push), reject (LINE push)."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from integrations import calendar_client
from integrations.line_client import PRIMARY, push as line_push
from repositories import booking_repo
from utils.pagination import paginate

logger = logging.getLogger(__name__)
TZ_BANGKOK = timezone(timedelta(hours=7))


def _normalize_booking_date(value: str) -> tuple[str, str]:
    clean = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y"):
        try:
            parsed = datetime.strptime(clean, fmt)
            return parsed.strftime("%Y-%m-%d"), parsed.strftime("%d/%m/%Y")
        except ValueError:
            continue
    raise HTTPException(
        status_code=422,
        detail={
            "code": "BOOKING_INVALID_DATE",
            "message": "Invalid booking date format. Use YYYY-MM-DD.",
        },
    )


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


def create_booking(*, body: Any, user: dict[str, Any]) -> dict[str, Any]:
    requested_date, display_date = _normalize_booking_date(body.requested_date)
    requested_time = body.requested_time.strip()
    request_uid = booking_repo.create_manual_booking(
        patient_name=body.patient_name.strip(),
        phone=body.phone.strip(),
        requested_date=requested_date,
        requested_time=requested_time,
        requested_datetime_text=f"{display_date} {requested_time}",
        symptom=body.symptom.strip(),
        booking_source=body.booking_source,
        created_by=str(user.get("email") or user.get("id") or "web"),
    )
    return {"ok": True, "request_uid": request_uid}


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

    # Doctor schedule block check: if booking is for a specific doctor and
    # that doctor has a vacation/off-hours block overlapping this slot, refuse.
    assigned = row.get("assigned_doctor_id")
    if assigned:
        from datetime import timedelta as _td
        from repositories import schedule_block_repo
        end_at = start_at + _td(minutes=duration_min)
        overlap = schedule_block_repo.find_overlap(
            doctor_id=int(assigned), start_at=start_at, end_at=end_at,
        )
        if overlap:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "DOCTOR_BLOCKED",
                    "message": (
                        f"แพทย์ลา/ไม่อยู่ ({overlap['block_type']}) "
                        f"ช่วง {overlap['start_at']} – {overlap['end_at']}"
                    ),
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

    approved = booking_repo.update_approved(
        uid=uid,
        event_id=event["event_id"],
        event_url=event["html_link"],
        approved_by=str(user.get("email") or user.get("sub") or "cro"),
        approved_by_user_id=user.get("id"),
        hn_year=start_at.strftime("%y"),
    )
    if not approved:
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
        "patient_id": approved["patient_id"],
        "hn": approved["hn"],
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


def cancel_booking(
    *, uid: str, reason: str, user: dict[str, Any]
) -> dict[str, bool]:
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    if row["status"] != "approved":
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": f"รายการนี้ {row['status']} แล้ว — cancel ไม่ได้",
            },
        )

    cancelled = booking_repo.update_cancelled(
        uid=uid,
        reason=reason,
        cancelled_by=str(user.get("email") or user.get("sub") or "cro"),
    )
    if not cancelled:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "BOOKING_INVALID_STATE",
                "message": "Booking was already updated by another user.",
            },
        )

    event_id = cancelled.get("calendar_event_id")
    if event_id:
        try:
            calendar_client.cancel_event(event_id)
        except Exception:  # noqa: BLE001 - calendar cleanup is best-effort after DB wins
            logger.exception("Failed to cancel Google Calendar event for booking %s", uid)
    return {"ok": True}


def _safe_push_patient(user_id: str | None, text: str) -> None:
    if not user_id:
        return
    try:
        line_push(user_id, text, ch=PRIMARY)
    except Exception:  # noqa: BLE001 — push failure must not break the API response
        pass
