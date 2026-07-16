"""Booking business logic — list, approve (calendar + LINE push), reject (LINE push)."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from core.email_service import send_email
from core.email_templates import (
    COLOR_GREEN,
    COLOR_GREEN_DARK,
    COLOR_MUTED,
    FONT_MONO,
    render_html_shell,
    render_kv_section,
    render_stat_split,
    render_text_shell,
)
from integrations import calendar_client
from integrations.line_client import PRIMARY, push as line_push
from repositories import (
    availability_repo,
    booking_repo,
    doctor_settings_repo,
    patient_doctor_repo,
    patient_repo,
    schedule_block_repo,
    user_repo,
)
from utils.pagination import paginate
from utils.phone import normalize_phone

logger = logging.getLogger(__name__)
TZ_BANGKOK = timezone(timedelta(hours=7))


def _assert_doctor_available(
    *, doctor_id: int | None, start_at: datetime, duration_min: int
) -> None:
    """Reject booking slots that overlap a doctor's unavailable block."""
    if not doctor_id:
        return
    end_at = start_at + timedelta(minutes=duration_min)
    overlap = schedule_block_repo.find_overlap(
        doctor_id=int(doctor_id), start_at=start_at, end_at=end_at,
    )
    if overlap:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DOCTOR_BLOCKED",
                "message": (
                    f"แพทย์ไม่ว่าง ({overlap['block_type']}) "
                    f"ช่วง {overlap['start_at']} - {overlap['end_at']}"
                ),
            },
        )


def _assert_within_availability(
    *, doctor_id: int | None, start_at: datetime, duration_min: int
) -> None:
    """Reject slots outside a doctor's recurring open-for-booking template.
    OPT-IN: a doctor with no template is unconstrained (backward-compatible).
    Distinct from DOCTOR_BLOCKED (time-off) — this is 'outside open hours'."""
    if not doctor_id:
        return
    if not availability_repo.has_template(int(doctor_id)):
        return
    end_at = start_at + timedelta(minutes=duration_min)
    covered = (
        end_at.date() == start_at.date()
        and availability_repo.covers(
            doctor_id=int(doctor_id),
            day_of_week=start_at.weekday(),  # Mon=0..Sun=6, matches the template
            start_time=start_at.strftime("%H:%M:%S"),
            end_time=end_at.strftime("%H:%M:%S"),
        )
    )
    if not covered:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "DOCTOR_UNAVAILABLE",
                "message": "เวลานี้อยู่นอกช่วงเวลาที่แพทย์เปิดรับนัด",
            },
        )


def _assert_is_doctor(doctor_id: int | None) -> None:
    """Reject an assigned_doctor_id that is not an active user with role=doctor
    (e.g. a CRO/admin id). Used by both approve and assign-doctor."""
    if doctor_id is None:
        return
    doctor = user_repo.find_user_by_id(int(doctor_id))
    if not doctor or doctor.get("role") != "doctor" or not doctor.get("is_active"):
        raise HTTPException(
            status_code=422,
            detail={"code": "DOCTOR_NOT_FOUND", "message": "แพทย์ที่เลือกไม่พบหรือไม่อยู่ในระบบ"},
        )


def _normalize_booking_date(value: str) -> tuple[str, str]:
    """แปลงวันที่ที่ผู้ใช้พิมพ์มา (รับได้ทั้ง YYYY-MM-DD และ DD/MM/YYYY) ให้เป็น
    รูปแบบมาตรฐาน คืนคู่ (วันแบบ ISO สำหรับเก็บ DB, วันแบบไทยสำหรับโชว์) —
    ถ้ารูปแบบไม่ถูกโยน 422 กันข้อมูลเพี้ยนเข้าระบบ"""
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


def list_bookings(
    *, status: str | None, group: str | None = None, page: int, limit: int
) -> dict[str, Any]:
    """ดึงรายการจองแบบแบ่งหน้า สำหรับหน้า inbox ของ CRO — กรองได้ทั้งด้วย
    status ตรงๆ (เช่น pending_approval) หรือด้วยกลุ่มวงจร (active/history)"""
    rows, total = booking_repo.list_bookings(
        status=status, group=group, page=page, limit=limit,
    )
    return paginate(rows=rows, total=total, page=page, limit=limit)


def get_booking(uid: str) -> dict[str, Any]:
    """ดึงรายการจอง 1 ใบด้วย uid (ไม่เจอ = 404). ถ้ายัง pending และยังไม่ผูก
    คนไข้ จะแนบ 'patient_candidates' คนไข้เดิมที่เบอร์ตรงกันมาด้วย เพื่อให้
    ApproveModal ถาม CRO ยืนยันตัวตนก่อน (กันสร้าง chart ซ้ำคนเดียวกัน)"""
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    # Surface phone-matched existing charts so the ApproveModal can ask the CRO
    # to confirm identity. Only relevant while still pending + not yet linked.
    candidates: list[dict[str, Any]] = []
    if row.get("status") == "pending_approval" and not row.get("patient_id"):
        candidates = patient_repo.find_candidates_by_phone(normalize_phone(row.get("phone")))
    row["patient_candidates"] = candidates
    return row


def _resolve_patient_choice(
    *, row: dict[str, Any], link_patient_id: int | None, create_new_patient: bool,
) -> tuple[int | None, bool]:
    """Decide how the approved booking attaches to a patient chart.

    Returns ``(resolved_patient_id, create_new_patient)`` to hand to the repo.
    Raises 409 PATIENT_MATCH_REQUIRED when the phone collides with an existing
    chart and the CRO hasn't yet chosen — never merge on phone alone.
    """
    if row.get("patient_id"):
        return None, False  # already linked upstream; repo keeps it

    candidates = patient_repo.find_candidates_by_phone(normalize_phone(row.get("phone")))
    if create_new_patient:
        return None, True
    if link_patient_id is not None:
        if not any(c["id"] == link_patient_id for c in candidates):
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "INVALID_PATIENT_CHOICE",
                    "message": "คนไข้ที่เลือกไม่ตรงกับเบอร์นี้ กรุณาเลือกใหม่",
                },
            )
        return link_patient_id, False
    if candidates:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "PATIENT_MATCH_REQUIRED",
                "message": "เบอร์นี้ตรงกับคนไข้เดิม กรุณายืนยันว่าเป็นคนเดียวกันหรือสร้างใหม่",
                "candidates": candidates,
            },
        )
    return None, False  # no collision — repo auto-creates a fresh chart


def create_booking(*, body: Any, user: dict[str, Any]) -> dict[str, Any]:
    """สร้างรายการจองด้วยมือจากฟอร์มบนเว็บ (กรณี CRO รับนัดทางโทรศัพท์/walk-in
    แทนที่จะมาจาก LINE) — คืน request_uid ของใบจองที่เพิ่งสร้าง"""
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
    link_patient_id: int | None = None,
    create_new_patient: bool = False,
) -> dict[str, str]:
    """อนุมัตินัดที่ยัง pending — หัวใจของ flow ฝั่ง CRO ทำตามลำดับนี้:
    ตรวจ state/เวลา/แพทย์ว่าง -> เช็คคิวชนใน Google Calendar -> ระบุตัวคนไข้
    (ผูก chart เดิมหรือสร้างใหม่) -> สร้าง event บนปฏิทิน -> เขียน DB แบบ
    atomic (แพ้ race จะยกเลิก event ที่เพิ่งสร้างทิ้ง) -> mirror ขึ้นปฏิทินหมอ
    -> push LINE แจ้งคนไข้. คืน id คนไข้ + HN + ข้อมูล event ปฏิทิน"""
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

    if duration_min <= 0 or duration_min > 480:
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_DURATION", "message": "ระยะเวลานัดต้องอยู่ระหว่าง 1-480 นาที"},
        )
    if start_at < datetime.now(TZ_BANGKOK) - timedelta(minutes=5):
        raise HTTPException(
            status_code=422,
            detail={"code": "PAST_SLOT", "message": "ไม่สามารถอนุมัตินัดในเวลาที่ผ่านมาแล้ว"},
        )
    _assert_is_doctor(assigned_doctor_id)

    if not calendar_client.check_availability(start_at, duration_min):
        raise HTTPException(
            status_code=409,
            detail={
                "code": "CALENDAR_CONFLICT",
                "message": "ช่วงเวลานี้มีนัดอยู่แล้ว เลือกเวลาอื่น",
            },
        )

    # Doctor schedule block check: use the doctor selected in this approval
    # request, not only the doctor currently stored on the pending booking.
    effective_doctor_id = assigned_doctor_id or row.get("assigned_doctor_id")
    _doctor_int = int(effective_doctor_id) if effective_doctor_id else None
    # Open-hours (availability template) then time-off (blocks): both raise 409
    # with distinct codes so the CRO UI can message precisely.
    _assert_within_availability(
        doctor_id=_doctor_int, start_at=start_at, duration_min=duration_min,
    )
    _assert_doctor_available(
        doctor_id=_doctor_int,
        start_at=start_at,
        duration_min=duration_min,
    )

    # Resolve patient identity BEFORE creating the calendar event so an
    # unresolved phone collision (409) never leaves an orphan Google event.
    resolved_patient_id, create_new = _resolve_patient_choice(
        row=row,
        link_patient_id=link_patient_id,
        create_new_patient=create_new_patient,
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
        requested_date=start_at.strftime("%Y-%m-%d"),
        requested_time=start_at.strftime("%H:%M:%S"),
        resolved_patient_id=resolved_patient_id,
        create_new_patient=create_new,
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

    # Seed the patient's care team from the assigned doctor (best-effort — a
    # care-team hiccup must not fail an otherwise-successful approval).
    seed_doctor = assigned_doctor_id or row.get("assigned_doctor_id")
    if seed_doctor and approved.get("patient_id"):
        try:
            patient_doctor_repo.seed_from_booking(
                patient_id=int(approved["patient_id"]),
                doctor_id=int(seed_doctor),
                added_by=user.get("id"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("Care-team seed failed for booking %s: %s", uid, exc)

    # Mirror the appointment onto the assigned doctor's own calendar (best-effort).
    _mirror_to_doctor(
        uid=uid, doctor_id=_doctor_int, old_mirror_event_id=row.get("doctor_calendar_event_id"),
        summary=summary, description=description, start_at=start_at, duration_min=duration_min,
    )

    _safe_push_patient(
        row.get("external_user_id"),
        f"ยืนยันนัด {patient_name}\n"
        f"{start_at.strftime('%d/%m/%Y %H:%M น.')}\n"
        f"ที่ BBH (Better Being Hospital)",
    )

    return {
        "calendar_event_id": event["event_id"],
        "calendar_event_url": event["html_link"],
        "patient_id": approved["patient_id"],
        "hn": approved["hn"],
    }


def _row_start(row: dict[str, Any]) -> datetime | None:
    """Rebuild the Asia/Bangkok start datetime from a booking's stored
    requested_date + requested_time (ISO strings from the repo serializer)."""
    d = row.get("requested_date")
    if not d:
        return None
    t = row.get("requested_time") or "09:00:00"
    try:
        return datetime.fromisoformat(f"{d}T{t}").replace(tzinfo=TZ_BANGKOK)
    except ValueError:
        return None


def set_video_link(
    *, uid: str, video_link: str | None, user: dict[str, Any]
) -> dict[str, bool]:
    """Write (or clear) an online-meeting link on an approved booking's Google
    Calendar event. If that event is missing (e.g. it lived on a calendar we no
    longer use), recreate it on the active calendar and re-link the booking so
    the doctor still sees the join button."""
    row = booking_repo.get_by_uid(uid)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "BOOKING_NOT_FOUND", "message": "ไม่พบรายการจองนี้"},
        )
    url = (video_link or "").strip()
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_URL", "message": "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"},
        )

    event_id = row.get("calendar_event_id") or ""
    if event_id and calendar_client.event_exists(event_id):
        if not calendar_client.set_event_video_link(event_id, url):
            raise HTTPException(
                status_code=502,
                detail={"code": "CALENDAR_ERROR", "message": "อัปเดตลิงก์บนปฏิทินไม่สำเร็จ"},
            )
        return {"ok": True}

    # Event missing/stale -> recreate on the active calendar (approved only).
    if row.get("status") != "approved":
        raise HTTPException(
            status_code=409,
            detail={"code": "NO_CALENDAR_EVENT", "message": "ต้อง approve นัดก่อนจึงจะใส่ลิงก์ได้"},
        )
    start = _row_start(row)
    if not start:
        raise HTTPException(
            status_code=409,
            detail={"code": "NO_SLOT", "message": "นัดนี้ไม่มีวัน/เวลา ใส่ลิงก์ไม่ได้"},
        )
    if not calendar_client.is_configured():
        raise HTTPException(
            status_code=503,
            detail={"code": "CALENDAR_DISABLED", "message": "Google Calendar service ยังไม่ได้ตั้งค่า"},
        )
    event = calendar_client.book_event(
        summary=f"BBH — {row.get('patient_name') or 'ผู้ป่วย'}",
        description=f"Request UID: {uid}",
        start=start,
        duration_min=30,
    )
    calendar_client.set_event_video_link(event["event_id"], url)
    booking_repo.set_calendar_event(uid, event["event_id"], event.get("html_link", ""))
    return {"ok": True}


def reject_booking(
    *, uid: str, reason: str, user: dict[str, Any]
) -> dict[str, bool]:
    """ปฏิเสธนัดที่ยัง pending (เช่น เวลาที่ขอมาไม่ว่างจริง) — อัปเดต DB เป็น
    rejected แล้ว push LINE แจ้งคนไข้พร้อมเหตุผลว่าจะติดต่อกลับหาวันใหม่"""
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

    _assert_is_doctor(assigned_doctor_id)

    # When ATTACHING a new doctor — a real change, and only if the booking has a
    # concrete time — enforce the same guards approve/reschedule use: the doctor
    # must be free of a time-off block AND within their open-hours template.
    # Re-saving the already-assigned doctor is exempt, so a doctor blocking their
    # own time later never traps the CRO (that case is surfaced as a warning pill,
    # and as a LINE alert), and a TBD booking (no requested_time) is not checked
    # against a fabricated slot.
    if (
        assigned_doctor_id is not None
        and assigned_doctor_id != row.get("assigned_doctor_id")
        and row.get("requested_time")
    ):
        start_at = _row_start(row)
        if start_at is not None:
            duration_min = int(row.get("duration_min") or 60)
            _assert_doctor_available(
                doctor_id=assigned_doctor_id, start_at=start_at, duration_min=duration_min,
            )
            _assert_within_availability(
                doctor_id=assigned_doctor_id, start_at=start_at, duration_min=duration_min,
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
        # Remove the doctor-calendar mirror too, else it lingers at the old time.
        _cancel_doctor_mirror(
            doctor_id=row.get("assigned_doctor_id"),
            mirror_event_id=row.get("doctor_calendar_event_id"),
        )

        if row.get("channel", "").startswith("line") and row.get("external_user_id"):
            _safe_push_patient(
                row["external_user_id"],
                (
                    f"แจ้งเลื่อนนัดของท่าน\n"
                    f"เวลาเดิม: {row.get('requested_datetime_text') or '-'}\n"
                    f"เวลาใหม่: รอยืนยัน — กรุณาแจ้งเวลาที่สะดวกกลับมาที่โรงพยาบาล"
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

    if new_start_at < datetime.now(TZ_BANGKOK) - timedelta(minutes=5):
        raise HTTPException(
            422,
            {"code": "PAST_SLOT", "message": "ไม่สามารถเลื่อนนัดไปเวลาที่ผ่านมาแล้ว"},
        )

    if not calendar_client.check_availability(new_start_at, duration_min):
        raise HTTPException(
            409,
            {"code": "CALENDAR_CONFLICT",
             "message": "เวลาใหม่ชนนัดอื่น เลือกเวลาอื่น"},
        )

    # Doctor open-hours + block check (same guards as approve flow)
    _resched_doctor = int(row["assigned_doctor_id"]) if row.get("assigned_doctor_id") else None
    _assert_within_availability(
        doctor_id=_resched_doctor, start_at=new_start_at, duration_min=duration_min,
    )
    _assert_doctor_available(
        doctor_id=_resched_doctor,
        start_at=new_start_at,
        duration_min=duration_min,
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

    # Re-mirror onto the doctor's own calendar at the new time (best-effort).
    _mirror_to_doctor(
        uid=uid, doctor_id=_resched_doctor,
        old_mirror_event_id=row.get("doctor_calendar_event_id"),
        summary=f"BBH — {row.get('patient_name') or '-'}",
        description=(reason or row.get("symptom") or ""),
        start_at=new_start_at, duration_min=duration_min,
    )

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
    """ประกอบเนื้ออีเมลแบบ plain-text แจ้งหมอเรื่องเลื่อนนัด (fallback สำหรับ
    เมลไคลเอนต์ที่ไม่แสดง HTML) — ปรับหัวเรื่องตามว่ามีเวลาใหม่แล้วหรือยัง TBD"""
    lead = "รอเวลาใหม่จากคนไข้" if k["is_tbd"] else "เวลานัดถูกเลื่อน"
    return render_text_shell(
        eyebrow=f"การแจ้งเตือน · {lead}",
        title=f"เลื่อนนัด {k['patient_name']}",
        subtitle=f"เรียน คุณหมอ {k['doctor_name']} — {lead}",
        content_text=(
            f"เวลาเดิม   {k['old_slot']}\n"
            f"เวลาใหม่   {k['new_slot']}\n\n"
            f"---- ข้อมูลคนไข้ ----\n"
            f"เบอร์      {k['phone']}\n"
            f"อาการ     {k['symptom']}\n"
            f"เหตุผล    {k['reason'] or '-'}"
        ),
        footer_text=(
            f"ดำเนินการโดย: {k['actor']}\n"
            f"Booking UID:  {k['request_uid']}"
        ),
    )


def _render_reschedule_html(**k: Any) -> str:
    """Uses the shared shell + reschedule-specific content sections."""
    lead = (
        "รอเวลาใหม่จากคนไข้ (คนไข้ยังไม่ยืนยัน)"
        if k["is_tbd"] else "เวลานัดถูกเลื่อนแล้ว"
    )
    # TBD hides the jade accent because the slot is not yet confirmed;
    # with-time uses the full brand green so the reader trusts the value.
    new_value_color = COLOR_MUTED if k["is_tbd"] else COLOR_GREEN_DARK
    new_eyebrow_color = COLOR_MUTED if k["is_tbd"] else COLOR_GREEN

    stat = render_stat_split(
        left_eyebrow="เวลาเดิม",
        left_value_html=k["old_slot"],
        left_strike=True,
        right_eyebrow="เวลาใหม่",
        right_value_html=k["new_slot"],
        right_value_color=new_value_color,
        right_eyebrow_color=new_eyebrow_color,
    )
    details = render_kv_section(
        eyebrow="ข้อมูลคนไข้",
        items=[
            ("เบอร์", k["phone"]),
            ("อาการ", k["symptom"]),
            ("เหตุผล", k["reason"] or "-"),
        ],
    )
    footer_html = (
        f"การแจ้งเตือนอัตโนมัติจาก BBH Bridge<br>"
        f"ดำเนินการโดย: <span style=\"color:{COLOR_MUTED};\">{k['actor']}</span><br>"
        f"รหัสการจอง: "
        f"<span style=\"font-family:{FONT_MONO};color:{COLOR_MUTED};\">{k['request_uid']}</span>"
    )
    return render_html_shell(
        eyebrow="การแจ้งเตือน",
        title_html=(
            f"เลื่อนนัด <span style=\"color:{COLOR_GREEN_DARK};\">{k['patient_name']}</span>"
        ),
        subtitle=f"เรียน คุณหมอ {k['doctor_name']} — {lead}",
        content_html=stat + details,
        footer_html=footer_html,
        preheader=f"{lead} · {k['patient_name']} · {k['new_slot']}",
    )


def cancel_booking(
    *, uid: str, reason: str, user: dict[str, Any]
) -> dict[str, bool]:
    """ยกเลิกนัดที่อนุมัติไปแล้ว — อัปเดต DB เป็น cancelled แบบ atomic แล้ว
    ลบ event ทั้งบนปฏิทินกลางและปฏิทินส่วนตัวของหมอ (การลบปฏิทินเป็น best-effort
    ทำหลัง DB สำเร็จแล้ว ถ้าลบพลาดก็ไม่ทำให้ยกเลิกล้มเหลว)"""
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
    _cancel_doctor_mirror(
        doctor_id=cancelled.get("assigned_doctor_id"),
        mirror_event_id=cancelled.get("doctor_calendar_event_id"),
    )
    return {"ok": True}


def _mirror_to_doctor(
    *, uid: str, doctor_id: int | None, old_mirror_event_id: str | None,
    summary: str, description: str, start_at: datetime, duration_min: int,
) -> None:
    """Best-effort: mirror an approved booking onto the assigned doctor's OWN
    Google Calendar (if they configured one on their account). Purely additive —
    it never touches the primary shared-calendar event or the booking result, so
    a mirror failure can't break approve/reschedule."""
    try:
        if not doctor_id or not calendar_client.is_configured():
            return
        cal = (doctor_settings_repo.get(int(doctor_id)) or {}).get("google_calendar_id")
        if not cal:
            return
        if old_mirror_event_id:
            calendar_client.cancel_event(old_mirror_event_id, calendar_id=cal)
        ev = calendar_client.book_event(
            summary=summary, description=description, start=start_at,
            duration_min=duration_min, calendar_id=cal,
        )
        booking_repo.set_doctor_calendar_event(uid, ev["event_id"])
    except Exception as exc:  # noqa: BLE001 — doctor mirror is best-effort
        logger.warning("Doctor-calendar mirror failed for booking %s: %s", uid, exc)


def _cancel_doctor_mirror(*, doctor_id: int | None, mirror_event_id: str | None) -> None:
    """Best-effort removal of a booking's doctor-calendar mirror event."""
    try:
        if not mirror_event_id or not doctor_id or not calendar_client.is_configured():
            return
        cal = (doctor_settings_repo.get(int(doctor_id)) or {}).get("google_calendar_id")
        if cal:
            calendar_client.cancel_event(mirror_event_id, calendar_id=cal)
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("Doctor-calendar mirror cancel failed: %s", exc)


def _safe_push_patient(user_id: str | None, text: str) -> None:
    """push ข้อความ LINE หาคนไข้แบบ 'ไม่ล้ม' — ถ้าไม่มี user_id หรือ LINE พัง
    จะเงียบไว้ ไม่โยน error ออกไป เพราะการแจ้งเตือนพลาดไม่ควรทำให้ทั้ง API
    (เช่น approve/reject ที่สำเร็จไปแล้ว) พังตาม"""
    if not user_id:
        return
    try:
        line_push(user_id, text, ch=PRIMARY)
    except Exception:  # noqa: BLE001 — push failure must not break the API response
        pass
