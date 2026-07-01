"""Booking business logic — list, approve (calendar + LINE push), reject (LINE push)."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from core.email_service import send_email
from integrations import calendar_client
from integrations.line_client import PRIMARY, push as line_push
from repositories import booking_repo, user_repo
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
    *,
    uid: str,
    start_at: datetime,
    duration_min: int,
    user: dict[str, Any],
    assigned_doctor_id: int | None = None,
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
        assigned_doctor_id=assigned_doctor_id,
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


def list_rescheduled_marks(
    *, start_date: str, end_date: str,
) -> list[dict[str, Any]]:
    """Return active reschedule marks for a date range (inclusive)."""
    return booking_repo.list_rescheduled_in_range(
        start_date=start_date, end_date=end_date,
    )


def assign_doctor(
    *, uid: str, assigned_doctor_id: int | None, user: dict[str, Any],
) -> dict[str, Any]:
    """CRO/admin sets or clears the assigned doctor on a booking. Idempotent
    — writes an audit row with the old + new doctor id."""
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, {"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"})

    if assigned_doctor_id is not None:
        doctor = user_repo.find_user_by_id(int(assigned_doctor_id))
        if not doctor or doctor.get("role") != "doctor" or not doctor.get("is_active"):
            raise HTTPException(
                422,
                {"code": "DOCTOR_NOT_FOUND",
                 "message": "แพทย์ที่เลือกไม่พบหรือไม่อยู่ในระบบ"},
            )

    updated = booking_repo.assign_doctor(
        uid=uid,
        assigned_doctor_id=assigned_doctor_id,
        actor_id=str(user.get("email") or user.get("sub") or "cro"),
    )
    if not updated:
        raise HTTPException(500, {"code": "ASSIGN_FAILED", "message": "บันทึกไม่สำเร็จ"})
    return updated


def reschedule_booking(
    *, uid: str, new_start_at: datetime | None, user: dict[str, Any], reason: str | None = None,
) -> dict[str, Any]:
    """Move an approved booking to a new time. Cancels the old Google Calendar
    event, creates a new one (if new_start_at given), rewrites the DB row +
    audits. Patient gets a LINE push. Assigned doctor gets an email.

    If new_start_at is None the booking is moved back to pending_approval
    (used when the patient asks to reschedule but is not yet sure when).
    """
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(404, {"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"})
    if row["status"] != "approved":
        raise HTTPException(
            409,
            {"code": "BOOKING_INVALID_STATE",
             "message": f"รายการนี้ {row['status']} แล้ว — เลื่อนนัดไม่ได้"},
        )

    # ── TBD branch: no new time — move to pending_approval ─────────────────
    if new_start_at is None:
        updated = booking_repo.reschedule_to_pending(
            uid=uid,
            actor_id=str(user.get("email") or user.get("sub") or "cro"),
            reason=reason,
        )
        if not updated:
            raise HTTPException(
                409,
                {"code": "BOOKING_INVALID_STATE",
                 "message": "รายการถูกแก้ไขโดยผู้อื่น ลองอีกครั้ง"},
            )

        # Cancel the old calendar event best-effort after DB commits.
        old_event = row.get("calendar_event_id")
        if old_event:
            try:
                calendar_client.cancel_event(old_event)
            except Exception:  # noqa: BLE001
                logger.exception("Failed to cancel old calendar event %s", old_event)

        if row.get("channel", "").startswith("line") and row.get("external_user_id"):
            _safe_push_patient(
                row["external_user_id"],
                (
                    f"แจ้งเลื่อนนัดของท่าน\n"
                    f"เวลาเดิม: {row.get('requested_datetime_text') or '-'}\n"
                    f"เวลาใหม่: รอยืนยัน — กรุณาแจ้งเวลาที่สะดวกกลับมาที่คลินิก"
                    + (f"\nหมายเหตุ: {reason}" if reason else "")
                ),
            )

        _notify_doctor_reschedule(
            row=row, new_start_at=None, reason=reason, actor_email=str(user.get("email") or ""),
        )
        return updated

    if new_start_at.tzinfo is None:
        new_start_at = new_start_at.replace(tzinfo=TZ_BANGKOK)
    else:
        new_start_at = new_start_at.astimezone(TZ_BANGKOK)
    duration_min = int(row.get("duration_min") or 30)

    if not calendar_client.check_availability(new_start_at, duration_min):
        raise HTTPException(
            409,
            {"code": "CALENDAR_CONFLICT",
             "message": "เวลาใหม่ชนนัดอื่น เลือกเวลาอื่น"},
        )

    # Doctor block check (same guard as approve flow)
    if row.get("assigned_doctor_id"):
        from datetime import timedelta as _td
        from repositories import schedule_block_repo
        end_at = new_start_at + _td(minutes=duration_min)
        overlap = schedule_block_repo.find_overlap(
            doctor_id=int(row["assigned_doctor_id"]),
            start_at=new_start_at, end_at=end_at,
        )
        if overlap:
            raise HTTPException(
                409,
                {"code": "DOCTOR_BLOCKED",
                 "message": (
                     f"แพทย์ลา/ไม่อยู่ ({overlap['block_type']}) ช่วงเวลาใหม่ "
                     f"{overlap['start_at']} – {overlap['end_at']}"
                 )},
            )

    # Book new calendar event first; if it fails we keep the old one.
    new_event = calendar_client.book_event(
        start=new_start_at,
        duration_min=duration_min,
        summary=f"นัด {row.get('patient_name') or '-'} (rescheduled)",
        description=(reason or row.get("symptom") or ""),
    )

    new_date = new_start_at.strftime("%Y-%m-%d")
    new_time = new_start_at.strftime("%H:%M:%S")
    updated = booking_repo.reschedule_approved(
        uid=uid,
        new_date=new_date,
        new_time=new_time,
        new_event_id=new_event.get("event_id"),
        new_event_url=new_event.get("event_url"),
        actor_id=str(user.get("email") or user.get("sub") or "cro"),
    )
    if not updated:
        # Race: someone cancelled between read + write. Roll back the new event.
        try:
            calendar_client.cancel_event(new_event["event_id"])
        except Exception:  # noqa: BLE001
            logger.exception("Failed to roll back calendar event %s", new_event.get("event_id"))
        raise HTTPException(
            409,
            {"code": "BOOKING_INVALID_STATE",
             "message": "รายการถูกแก้ไขโดยผู้อื่น ลองอีกครั้ง"},
        )

    # Best-effort: cancel old calendar event after the new one is committed.
    old_event = row.get("calendar_event_id")
    if old_event and old_event != new_event.get("event_id"):
        try:
            calendar_client.cancel_event(old_event)
        except Exception:  # noqa: BLE001
            logger.exception("Failed to cancel old calendar event %s for booking %s",
                             old_event, uid)

    # Notify patient via LINE (channel is line_main / external_user_id stored on booking).
    if row.get("channel", "").startswith("line") and row.get("external_user_id"):
        _safe_push_patient(
            row["external_user_id"],
            (
                f"แจ้งเปลี่ยนเวลานัดของท่าน\n"
                f"เวลาใหม่: {updated.get('requested_datetime_text') or new_date + ' ' + new_time[:5]}\n"
                + (f"\nหมายเหตุ: {reason}" if reason else "")
            ),
        )

    _notify_doctor_reschedule(
        row=row, new_start_at=new_start_at, reason=reason, actor_email=str(user.get("email") or ""),
    )
    return updated


def _notify_doctor_reschedule(
    *,
    row: dict[str, Any],
    new_start_at: datetime | None,
    reason: str | None,
    actor_email: str,
) -> None:
    """Email the assigned doctor about a rescheduled appointment. Silent if
    the booking has no doctor, the doctor has no email, or SMTP fails."""
    doctor_id = row.get("assigned_doctor_id")
    if not doctor_id:
        return
    doctor = user_repo.find_user_by_id(int(doctor_id))
    if not doctor or not doctor.get("email"):
        return

    patient_name = row.get("patient_name") or "-"
    phone = row.get("phone") or "-"
    symptom = row.get("symptom") or "-"
    old_slot = row.get("requested_datetime_text") or "-"
    is_tbd = new_start_at is None
    new_slot = (
        new_start_at.strftime("%d/%m/%Y %H:%M น.")
        if new_start_at
        else "รอยืนยัน · คนไข้จะแจ้งเวลาใหม่"
    )
    doctor_name = doctor.get("display_name") or ""
    request_uid = row.get("request_uid") or ""
    actor = actor_email or "CRO"

    subject = f"[BBH] เลื่อนนัดคนไข้ {patient_name} — {new_slot}"
    body_text = _render_reschedule_text(
        doctor_name=doctor_name, patient_name=patient_name, phone=phone,
        symptom=symptom, old_slot=old_slot, new_slot=new_slot, reason=reason,
        actor=actor, request_uid=request_uid, is_tbd=is_tbd,
    )
    body_html = _render_reschedule_html(
        doctor_name=doctor_name, patient_name=patient_name, phone=phone,
        symptom=symptom, old_slot=old_slot, new_slot=new_slot, reason=reason,
        actor=actor, request_uid=request_uid, is_tbd=is_tbd,
    )
    ok = send_email(
        to=doctor["email"], subject=subject,
        body=body_text, html=body_html,
        from_name="Better Being Hospital",
    )
    if not ok:
        logger.warning(
            "Doctor reschedule email skipped or failed (booking=%s doctor=%s)",
            request_uid, doctor.get("email"),
        )


def _render_reschedule_text(**k: Any) -> str:
    """Plain-text fallback — kept simple and monospace-friendly for accessibility."""
    lead = "รอเวลาใหม่จากคนไข้" if k["is_tbd"] else "เวลานัดถูกเลื่อน"
    return (
        f"BETTER BEING HOSPITAL\n"
        f"การแจ้งเตือน · {lead}\n"
        f"{'=' * 40}\n\n"
        f"เรียน คุณหมอ {k['doctor_name']}\n\n"
        f"คนไข้: {k['patient_name']}\n\n"
        f"เวลาเดิม   {k['old_slot']}\n"
        f"เวลาใหม่   {k['new_slot']}\n\n"
        f"---- ข้อมูลคนไข้ ----\n"
        f"เบอร์      {k['phone']}\n"
        f"อาการ     {k['symptom']}\n"
        f"เหตุผล    {k['reason'] or '-'}\n\n"
        f"---- Audit ----\n"
        f"ดำเนินการโดย: {k['actor']}\n"
        f"Booking UID:  {k['request_uid']}\n\n"
        f"Better Being Hospital · bbh-hospital.com\n"
    )


def _render_reschedule_html(**k: Any) -> str:
    """Table-based, inline-styled HTML — safe across Gmail, Outlook, Apple Mail.

    Design: 600px capped container, single column, clay/jade/bone palette,
    Georgia serif for headline (safe Fraunces substitute), system font for
    body. Comparison card shows old (strikethrough) vs new (bold jade)."""
    lead = (
        "รอเวลาใหม่จากคนไข้ (คนไข้ยังไม่ยืนยัน)"
        if k["is_tbd"] else "เวลานัดถูกเลื่อนแล้ว"
    )
    new_time_color = "#8A7B63" if k["is_tbd"] else "#0E7E5E"
    new_eyebrow_color = "#8A7B63" if k["is_tbd"] else "#16A77C"
    reason_html = k["reason"] or "-"
    body_font = (
        "-apple-system,BlinkMacSystemFont,'Segoe UI','Sarabun',"
        "'Prompt','Noto Sans Thai',Arial,sans-serif"
    )
    serif_font = "Georgia,'Sarabun','Noto Sans Thai',serif"
    return f"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>BBH · เลื่อนนัด</title>
</head>
<body style="margin:0;padding:0;background:#F6F3EC;font-family:{body_font};color:#2B2622;">
<div style="display:none;overflow:hidden;line-height:1px;opacity:0;max-height:0;max-width:0;">
  {lead} · คนไข้ {k['patient_name']} · {k['new_slot']}
</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F3EC;">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;">
        <tr>
          <td style="padding:24px 32px 20px;border-bottom:1px solid #E7E0D3;">
            <p style="margin:0;font-size:11px;letter-spacing:0.22em;color:#8C8377;text-transform:uppercase;font-weight:600;">
              Better Being Hospital · การแจ้งเตือน
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 32px 16px;">
            <h1 style="margin:0;font-family:{serif_font};font-size:26px;line-height:1.3;color:#2B2622;font-weight:600;">
              เลื่อนนัด <span style="color:#0E7E5E;">{k['patient_name']}</span>
            </h1>
            <p style="margin:12px 0 0;font-size:14px;line-height:1.6;color:#8C8377;">
              เรียน คุณหมอ {k['doctor_name']} — {lead}
            </p>
          </td>
        </tr>
        <tr>
          <td style="padding:0 32px 24px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F6F3EC;border-radius:12px;">
              <tr>
                <td width="50%" valign="top" style="padding:20px;border-right:1px solid #E7E0D3;">
                  <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#8C8377;font-weight:600;">เวลาเดิม</p>
                  <p style="margin:8px 0 0;font-family:{serif_font};font-size:18px;color:#8A7B63;text-decoration:line-through;font-weight:500;">
                    {k['old_slot']}
                  </p>
                </td>
                <td width="50%" valign="top" style="padding:20px;">
                  <p style="margin:0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:{new_eyebrow_color};font-weight:600;">เวลาใหม่</p>
                  <p style="margin:8px 0 0;font-family:{serif_font};font-size:18px;color:{new_time_color};font-weight:600;">
                    {k['new_slot']}
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:8px 32px 28px;">
            <p style="margin:0 0 12px;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#8C8377;font-weight:600;">
              ข้อมูลคนไข้
            </p>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-size:14px;line-height:1.6;">
              <tr>
                <td style="padding:6px 12px 6px 0;color:#8C8377;width:80px;vertical-align:top;">เบอร์</td>
                <td style="padding:6px 0;color:#2B2622;">{k['phone']}</td>
              </tr>
              <tr>
                <td style="padding:6px 12px 6px 0;color:#8C8377;vertical-align:top;">อาการ</td>
                <td style="padding:6px 0;color:#2B2622;">{k['symptom']}</td>
              </tr>
              <tr>
                <td style="padding:6px 12px 6px 0;color:#8C8377;vertical-align:top;">เหตุผล</td>
                <td style="padding:6px 0;color:#2B2622;">{reason_html}</td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px 28px;background:#F0EADD;">
            <p style="margin:0;font-size:11px;line-height:1.7;color:#8C8377;">
              การแจ้งเตือนอัตโนมัติจาก BBH Bridge<br>
              ดำเนินการโดย: <span style="color:#2B2622;">{k['actor']}</span><br>
              รหัสการจอง: <span style="font-family:'SFMono-Regular',Consolas,monospace;color:#2B2622;">{k['request_uid']}</span>
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:16px 0 0;font-size:11px;color:#8C8377;text-align:center;letter-spacing:0.06em;">
        Better Being Hospital · bbh-hospital.com
      </p>
    </td>
  </tr>
</table>
</body>
</html>
"""


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
