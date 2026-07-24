"""CRUD helpers for booking_requests - parameterized SQL only."""
import json
import re
import uuid
from datetime import date, datetime, time, timedelta
from typing import Any

from core.mysql import mysql_db
from utils.phone import normalize_phone


_LIST_COLUMNS = (
    "request_uid, status, patient_name, phone, requested_datetime_text, "
    "symptom, booking_source, appointment_type, assigned_doctor_id, created_at"
)

_DETAIL_COLUMNS = (
    "request_uid, status, channel, external_user_id, patient_name, phone, "
    "requested_date, requested_time, requested_datetime_text, symptom, "
    "service_type, doctor_code, booking_source, appointment_type, duration_min, "
    "calendar_event_id, calendar_event_url, doctor_calendar_event_id, calendar_status, "
    "assigned_doctor_id, patient_id, notes, approved_by, approved_at, "
    "reminder_24h_sent_at, reminder_1h_sent_at, "
    "created_at, updated_at"
)


# Lifecycle groups for the Bookings inbox tabs. "active" = still needs / has
# CRO attention; "history" = terminal states kept for the record.
ACTIVE_STATUSES = ("pending_approval", "approved")
HISTORY_STATUSES = ("rejected", "cancelled", "expired", "no_show")


def list_bookings(
    *, status: str | None, group: str | None = None, page: int, limit: int
) -> tuple[list[dict[str, Any]], int]:
    """List bookings, filtered by exact ``status`` or by lifecycle ``group``.

    An explicit ``status`` always wins. Otherwise ``group`` selects a status
    set: 'active' (pending_approval/approved) or 'history' (rejected/cancelled/
    expired/no_show). When neither is given we default to 'active'.
    """
    offset = (page - 1) * limit
    if status:
        where_sql = "WHERE status = %s"
        where_args: tuple[Any, ...] = (status,)
    else:
        statuses = HISTORY_STATUSES if group == "history" else ACTIVE_STATUSES
        placeholders = ", ".join(["%s"] * len(statuses))
        where_sql = f"WHERE status IN ({placeholders})"
        where_args = tuple(statuses)

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS n FROM booking_requests {where_sql}",
                where_args,
            )
            total = int(cur.fetchone()["n"])

            cur.execute(
                f"""
                SELECT {_LIST_COLUMNS}
                FROM booking_requests
                {where_sql}
                ORDER BY created_at DESC
                LIMIT %s OFFSET %s
                """,
                (*where_args, limit, offset),
            )
            rows = cur.fetchall()
    return rows, total


def list_by_date_range(start: date, end: date) -> list[dict[str, Any]]:
    """Return approved bookings where requested_date is in [start, end] inclusive."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_uid, status, patient_name, phone,
                       requested_date, requested_time, requested_datetime_text,
                       symptom, appointment_type
                FROM booking_requests
                WHERE status = 'approved'
                  AND requested_date BETWEEN %s AND %s
                ORDER BY requested_date, requested_time
                """,
                (start.isoformat(), end.isoformat()),
            )
            rows = cur.fetchall()
    return [_serialize_booking_row(r) for r in rows]


def get_by_uid(uid: str) -> dict[str, Any] | None:
    """ดึงการจอง 1 ใบด้วย request_uid พร้อมคอลัมน์รายละเอียดครบ (คืน None ถ้าไม่เจอ).
    วันที่/เวลาถูก serialize เป็น string."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_DETAIL_COLUMNS} FROM booking_requests "
                "WHERE request_uid = %s LIMIT 1",
                (uid,),
            )
            row = cur.fetchone()
            return _serialize_booking_row(row) if row else None


def _serialize_booking_row(row: dict[str, Any]) -> dict[str, Any]:
    """แปลงแถว booking ให้ JSON-serializable in-place: requested_date เป็น ISO,
    requested_time เป็น 'HH:MM:SS' (รองรับทั้ง time และ timedelta ที่ driver คืนมา)."""
    requested_date = row.get("requested_date")
    requested_time = row.get("requested_time")
    if isinstance(requested_date, date):
        row["requested_date"] = requested_date.isoformat()
    if isinstance(requested_time, time):
        row["requested_time"] = requested_time.strftime("%H:%M:%S")
    elif isinstance(requested_time, timedelta):
        total_seconds = int(requested_time.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        seconds = total_seconds % 60
        row["requested_time"] = f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    return row


def create_manual_booking(
    *,
    patient_name: str,
    phone: str,
    requested_date: str,
    requested_time: str,
    requested_datetime_text: str,
    symptom: str,
    booking_source: str,
    created_by: str,
) -> str:
    """สร้างการจองด้วยมือจาก Web Dashboard (channel='web_dashboard',
    status='pending_approval' รอ CRO อนุมัติ). gen request_uid + external_user_id
    เอง คืน request_uid."""
    request_uid = str(uuid.uuid4())
    external_user_id = f"web-{request_uid}"
    raw_summary = {
        "created_by": created_by,
        "created_from": "web_dashboard",
    }

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO booking_requests
                    (request_uid, channel, external_user_id, status,
                     patient_name, phone, requested_date, requested_time,
                     requested_datetime_text, symptom, booking_source, raw_summary)
                VALUES
                    (%s, 'web_dashboard', %s, 'pending_approval',
                     %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    request_uid,
                    external_user_id,
                    patient_name,
                    phone,
                    requested_date,
                    requested_time,
                    requested_datetime_text,
                    symptom,
                    booking_source,
                    json.dumps(raw_summary, ensure_ascii=False),
                ),
            )
        conn.commit()
    return request_uid


def reschedule_approved(
    *,
    uid: str,
    new_date: str,
    new_time: str,
    new_event_id: str | None,
    new_event_url: str | None,
    actor_id: str,
) -> dict[str, Any] | None:
    """Atomically rewrite the time of an approved booking + log the audit row
    that captures the old slot. Returns the new row or None if the booking is
    not currently approved (e.g. already cancelled)."""
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, request_uid, status,
                           requested_date, requested_time, requested_datetime_text,
                           calendar_event_id, calendar_event_url
                    FROM booking_requests
                    WHERE request_uid = %s
                    FOR UPDATE
                    """,
                    (uid,),
                )
                row = cur.fetchone()
                if not row or row["status"] != "approved":
                    conn.rollback()
                    return None

                old_date = row.get("requested_date")
                old_time = row.get("requested_time")
                old_text = row.get("requested_datetime_text")
                old_event = row.get("calendar_event_id")

                new_text = f"{new_date} {new_time[:5]}"
                cur.execute(
                    """
                    UPDATE booking_requests
                    SET requested_date = %s,
                        requested_time = %s,
                        requested_datetime_text = %s,
                        calendar_event_id = %s,
                        calendar_event_url = %s,
                        calendar_status = CASE
                            WHEN %s IS NULL THEN 'pending_event' ELSE 'created'
                        END,
                        reminder_24h_sent_at = NULL,
                        reminder_1h_sent_at = NULL
                    WHERE id = %s
                    """,
                    (new_date, new_time, new_text, new_event_id, new_event_url,
                     new_event_id, row["id"]),
                )

                cur.execute(
                    """
                    INSERT INTO booking_audit_logs
                        (booking_request_id, actor_type, actor_id, action,
                         from_status, to_status, detail)
                    VALUES (%s, 'cro', %s, 'rescheduled', 'approved', 'approved', %s)
                    """,
                    (
                        row["id"],
                        actor_id,
                        json.dumps({
                            "old_date": str(old_date) if old_date else None,
                            "old_time": str(old_time) if old_time else None,
                            "old_text": old_text,
                            "old_event_id": old_event,
                            "new_date": new_date,
                            "new_time": new_time,
                            "new_event_id": new_event_id,
                        }),
                    ),
                )

                cur.execute(
                    f"SELECT {_DETAIL_COLUMNS} FROM booking_requests WHERE id = %s",
                    (row["id"],),
                )
                fresh = cur.fetchone()
            conn.commit()
            return _serialize_booking_row(fresh) if fresh else None
        except Exception:
            conn.rollback()
            raise


def reschedule_to_pending(
    *,
    uid: str,
    actor_id: str,
    reason: str | None = None,
) -> dict[str, Any] | None:
    """Move an approved booking back to pending_approval without a fixed time.

    Used when the patient asks to reschedule but is not yet sure when. Clears
    the calendar event, requested date/time, and reminder flags. The audit row
    captures the old slot so the previous time is not lost.
    """
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, request_uid, status,
                           requested_date, requested_time, requested_datetime_text,
                           calendar_event_id, calendar_event_url
                    FROM booking_requests
                    WHERE request_uid = %s
                    FOR UPDATE
                    """,
                    (uid,),
                )
                row = cur.fetchone()
                if not row or row["status"] != "approved":
                    conn.rollback()
                    return None

                cur.execute(
                    """
                    UPDATE booking_requests
                    SET status = 'pending_approval',
                        requested_date = NULL,
                        requested_time = NULL,
                        requested_datetime_text = NULL,
                        calendar_event_id = NULL,
                        calendar_event_url = NULL,
                        doctor_calendar_event_id = NULL,
                        calendar_status = 'not_created',
                        approved_at = NULL,
                        approved_by = NULL,
                        reminder_24h_sent_at = NULL,
                        reminder_1h_sent_at = NULL
                    WHERE id = %s
                    """,
                    (row["id"],),
                )

                cur.execute(
                    """
                    INSERT INTO booking_audit_logs
                        (booking_request_id, actor_type, actor_id, action,
                         from_status, to_status, detail)
                    VALUES (%s, 'cro', %s, 'rescheduled_pending', 'approved',
                            'pending_approval', %s)
                    """,
                    (
                        row["id"],
                        actor_id,
                        json.dumps({
                            "old_date": str(row.get("requested_date")) if row.get("requested_date") else None,
                            "old_time": str(row.get("requested_time")) if row.get("requested_time") else None,
                            "old_text": row.get("requested_datetime_text"),
                            "old_event_id": row.get("calendar_event_id"),
                            "reason": reason,
                        }),
                    ),
                )

                cur.execute(
                    f"SELECT {_DETAIL_COLUMNS} FROM booking_requests WHERE id = %s",
                    (row["id"],),
                )
                fresh = cur.fetchone()
            conn.commit()
            return _serialize_booking_row(fresh) if fresh else None
        except Exception:
            conn.rollback()
            raise


def update_approved(
    *,
    uid: str,
    event_id: str,
    event_url: str,
    approved_by: str,
    approved_by_user_id: int | None,
    hn_year: str,
    assigned_doctor_id: int | None = None,
    requested_date: str | None = None,
    requested_time: str | None = None,
    resolved_patient_id: int | None = None,
    create_new_patient: bool = False,
) -> dict[str, Any] | None:
    """Approve booking and attach/create the real patient record atomically.

    ``requested_date``/``requested_time`` persist the confirmed slot so the DB
    is the source of truth for per-doctor schedule views (the doctor calendar
    filters on ``requested_date``). Google Calendar stays a mirror.

    Patient identity resolution (only when the booking isn't already linked):
      - ``resolved_patient_id`` — CRO confirmed this is an existing patient; link.
      - ``create_new_patient``  — CRO confirmed it's a new person despite a phone
        match; force a fresh record.
      - neither — auto path (LINE/n8n, no human to confirm): link by normalized
        phone if there's a match, else create. The dashboard never reaches this
        branch: ``booking_service`` blocks (409) on an unresolved phone collision.
    """
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT request_uid, status, patient_id, patient_name, phone, email, nationality
                    FROM booking_requests
                    WHERE request_uid = %s
                    FOR UPDATE
                    """,
                    (uid,),
                )
                booking = cur.fetchone()
                if not booking or booking["status"] != "pending_approval":
                    conn.rollback()
                    return None

                patient_id = booking.get("patient_id")
                hn = None
                if patient_id:
                    cur.execute("SELECT hn FROM patients WHERE id = %s LIMIT 1", (patient_id,))
                    patient = cur.fetchone()
                    hn = patient.get("hn") if patient else None
                elif resolved_patient_id and not create_new_patient:
                    # CRO confirmed link to an existing chart.
                    cur.execute(
                        "SELECT hn FROM patients WHERE id = %s AND deleted_at IS NULL LIMIT 1",
                        (resolved_patient_id,),
                    )
                    patient = cur.fetchone()
                    if not patient:
                        conn.rollback()
                        return None
                    patient_id = resolved_patient_id
                    hn = patient.get("hn")
                else:
                    # Auto path only: create_new_patient forces a fresh record;
                    # otherwise link by normalized phone if there's a match.
                    patient = None if create_new_patient else _find_patient_for_booking(cur, booking)
                    if patient:
                        patient_id = patient["id"]
                        hn = patient.get("hn")
                    else:
                        hn = _next_hn(cur, hn_year)
                        cur.execute(
                            """
                            INSERT INTO patients
                                (hn, display_name, phone, phone_normalized, email, nationality, notes, created_by)
                            VALUES
                                (%s, %s, %s, %s, %s, %s, %s, %s)
                            """,
                            (
                                hn,
                                booking.get("patient_name") or "Unknown Patient",
                                booking.get("phone") or None,
                                normalize_phone(booking.get("phone")) or None,
                                booking.get("email") or None,
                                booking.get("nationality") or None,
                                f"Created from booking {uid}",
                                approved_by_user_id,
                            ),
                        )
                        patient_id = cur.lastrowid

                rows = cur.execute(
                    """
                    UPDATE booking_requests SET
                        status              = 'approved',
                        patient_id          = %s,
                        calendar_event_id   = %s,
                        calendar_event_url  = %s,
                        calendar_status     = 'created',
                        requested_date      = COALESCE(%s, requested_date),
                        requested_time      = COALESCE(%s, requested_time),
                        approved_by         = %s,
                        approved_at         = NOW(),
                        assigned_doctor_id  = COALESCE(%s, assigned_doctor_id)
                    WHERE request_uid = %s AND status = 'pending_approval'
                    """,
                    (patient_id, event_id, event_url, requested_date, requested_time,
                     approved_by, assigned_doctor_id, uid),
                )
            if rows == 0:
                conn.rollback()
                return None
            conn.commit()
            return {"patient_id": patient_id, "hn": hn}
        except Exception:
            conn.rollback()
            raise


def set_doctor_calendar_event(uid: str, event_id: str | None) -> int:
    """Store (or clear) the per-doctor mirror event id for a booking."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE booking_requests SET doctor_calendar_event_id = %s "
                "WHERE request_uid = %s",
                (event_id, uid),
            )
        conn.commit()
    return rows


def set_calendar_event(uid: str, event_id: str, event_url: str) -> int:
    """Re-point a booking at a (re)created calendar event — used when the old
    event_id is stale (event lived on a calendar we no longer use)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE booking_requests SET calendar_event_id = %s, "
                "calendar_event_url = %s WHERE request_uid = %s",
                (event_id, event_url, uid),
            )
        conn.commit()
    return rows


_DATE_RE = re.compile(r"(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?")


def _parse_thai_date_text(text: str | None, fallback_year: int) -> str | None:
    """Parse "25/6 11:00" or "25/6/2026 11:00" → "2026-06-25".

    LINE-originated bookings store the request as free text only, so
    reschedule audits fall back to parsing this when the DATE column is NULL.
    """
    if not text:
        return None
    m = _DATE_RE.search(text)
    if not m:
        return None
    d, mm, yr = m.groups()
    year = int(yr) if yr else fallback_year
    if year < 100:
        year += 2000
    try:
        return f"{year:04d}-{int(mm):02d}-{int(d):02d}"
    except ValueError:
        return None


def list_rescheduled_in_range(
    *, start_date: str, end_date: str,
) -> list[dict[str, Any]]:
    """Bookings whose LATEST audit action is a reschedule that is still in
    effect. Used by Calendar to render a gray "เลื่อนนัด N" marker on the day
    cell.

    With-time reschedule → status='approved', marker on new requested_date.
    TBD reschedule → status='pending_approval', marker on old_date from
    the audit detail (falls back to parsing old_text when the DATE column
    was NULL — common for LINE-originated bookings).
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT b.request_uid, b.patient_name, b.status,
                       b.requested_date, b.requested_datetime_text,
                       la.action AS latest_action, la.detail AS latest_detail,
                       la.created_at AS audit_at
                FROM booking_requests b
                INNER JOIN (
                    SELECT booking_request_id, MAX(id) AS latest_id
                    FROM booking_audit_logs
                    GROUP BY booking_request_id
                ) latest ON latest.booking_request_id = b.id
                INNER JOIN booking_audit_logs la ON la.id = latest.latest_id
                WHERE la.action IN ('rescheduled', 'rescheduled_pending')
                """
            )
            rows = cur.fetchall() or []

    result: list[dict[str, Any]] = []
    for row in rows:
        action = row["latest_action"]
        status = row["status"]
        # Status must match the audit — TBD then re-approved has
        # status='approved' but latest audit still 'rescheduled_pending';
        # skip so a freshly re-approved booking is not still marked.
        if action == "rescheduled" and status != "approved":
            continue
        if action == "rescheduled_pending" and status != "pending_approval":
            continue

        audit_at = row.get("audit_at")
        fallback_year = audit_at.year if audit_at else datetime.utcnow().year

        if action == "rescheduled":
            display = row.get("requested_date")
            if hasattr(display, "isoformat"):
                display_date = display.isoformat()
            elif display:
                display_date = str(display)
            else:
                # LINE booking has no DATE column — parse the text instead
                display_date = _parse_thai_date_text(
                    row.get("requested_datetime_text"), fallback_year,
                ) or ""
            is_tbd = False
        else:
            try:
                detail = json.loads(row["latest_detail"]) if row["latest_detail"] else {}
            except Exception:  # noqa: BLE001
                detail = {}
            display_date = str(detail.get("old_date") or "") \
                or _parse_thai_date_text(detail.get("old_text"), fallback_year) \
                or ""
            is_tbd = True

        if not display_date or display_date < start_date or display_date > end_date:
            continue
        result.append({
            "request_uid": row["request_uid"],
            "patient_name": row.get("patient_name"),
            "display_date": display_date,
            "is_tbd": is_tbd,
            "current_status": status,
        })
    return result


def find_approved_overlapping(
    *, doctor_id: int, start_at: datetime, end_at: datetime,
) -> list[dict[str, Any]]:
    """Approved bookings for this doctor whose appointment window overlaps
    [start_at, end_at]. Used to warn the CRO when a doctor blocks time that
    clashes with already-confirmed appointments (the reverse of the approve/
    assign DOCTOR_BLOCKED guard — a block added AFTER the doctor was assigned)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_uid, patient_name, phone,
                       requested_date, requested_time, requested_datetime_text
                FROM booking_requests
                WHERE assigned_doctor_id = %s
                  AND status = 'approved'
                  AND requested_date IS NOT NULL
                  AND requested_time IS NOT NULL
                  AND TIMESTAMP(requested_date, requested_time) < %s
                  AND TIMESTAMP(requested_date, requested_time)
                      + INTERVAL COALESCE(duration_min, 60) MINUTE > %s
                ORDER BY requested_date, requested_time
                """,
                (doctor_id, end_at, start_at),
            )
            return cur.fetchall() or []


def list_active_cro_line_uids() -> list[str]:
    """Distinct CRO LINE user ids that have messaged the CRO bot (bot_sessions,
    channel='line_cro', valid LINE uid). This is the reachable CRO target the
    booking notifications use — cro_users.line_uid is frequently unset."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT external_user_id
                FROM bot_sessions
                WHERE channel = 'line_cro'
                  AND external_user_id REGEXP '^U[0-9a-f]{32}$'
                """
            )
            return [r["external_user_id"] for r in cur.fetchall()]


def assign_doctor(
    *,
    uid: str,
    assigned_doctor_id: int | None,
    actor_id: str,
) -> dict[str, Any] | None:
    """Set (or clear) the assigned doctor on a booking. Works on any status
    so CRO can also correct assignments post-approval. Writes an audit row
    with the old + new doctor id."""
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, status, assigned_doctor_id FROM booking_requests "
                    "WHERE request_uid = %s FOR UPDATE",
                    (uid,),
                )
                row = cur.fetchone()
                if not row:
                    conn.rollback()
                    return None
                old_doctor = row.get("assigned_doctor_id")
                cur.execute(
                    "UPDATE booking_requests SET assigned_doctor_id = %s WHERE id = %s",
                    (assigned_doctor_id, row["id"]),
                )
                cur.execute(
                    """
                    INSERT INTO booking_audit_logs
                        (booking_request_id, actor_type, actor_id, action,
                         from_status, to_status, detail)
                    VALUES (%s, 'cro', %s, 'doctor_assigned', %s, %s, %s)
                    """,
                    (
                        row["id"], actor_id, row["status"], row["status"],
                        json.dumps({
                            "old_doctor_id": int(old_doctor) if old_doctor else None,
                            "new_doctor_id": int(assigned_doctor_id) if assigned_doctor_id else None,
                        }),
                    ),
                )
                cur.execute(
                    f"SELECT {_DETAIL_COLUMNS} FROM booking_requests WHERE id = %s",
                    (row["id"],),
                )
                fresh = cur.fetchone()
            conn.commit()
            return _serialize_booking_row(fresh) if fresh else None
        except Exception:
            conn.rollback()
            raise


def _find_patient_for_booking(cur: Any, booking: dict[str, Any]) -> dict[str, Any] | None:
    """Auto-path patient match by NORMALIZED phone (format-insensitive). The
    dashboard doesn't rely on this — it resolves identity with the CRO first;
    this is the LINE/n8n fallback where no human is present to confirm."""
    phone_norm = normalize_phone(booking.get("phone"))
    if not phone_norm:
        return None
    cur.execute(
        """
        SELECT id, hn
        FROM patients
        WHERE phone_normalized = %s AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1
        """,
        (phone_norm,),
    )
    return cur.fetchone()


def _next_hn(cur: Any, year_yy: str) -> str:
    """gen เลข HN ถัดไปของปี (format 'YY-NNNN') แบบ atomic ผ่าน
    patient_hn_counters + SELECT ... FOR UPDATE กัน HN ชนตอน approve พร้อมกัน.
    ใช้ cursor เดิมของ transaction ที่เรียกมา (ต้องอยู่ใน tx ที่ยังไม่ commit)."""
    cur.execute(
        """
        INSERT INTO patient_hn_counters (year_yy, last_seq)
        VALUES (%s, 0)
        ON DUPLICATE KEY UPDATE year_yy = VALUES(year_yy)
        """,
        (year_yy,),
    )
    cur.execute(
        "SELECT last_seq FROM patient_hn_counters WHERE year_yy = %s FOR UPDATE",
        (year_yy,),
    )
    row = cur.fetchone()
    next_seq = int(row["last_seq"]) + 1
    cur.execute(
        "UPDATE patient_hn_counters SET last_seq = %s WHERE year_yy = %s",
        (next_seq, year_yy),
    )
    return f"{year_yy}-{next_seq:04d}"


def update_rejected(*, uid: str, reason: str, rejected_by: str) -> int:
    """Atomic: only flip pending_approval -> rejected. Returns affected row count."""
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                rows = cur.execute(
                    """
                    UPDATE booking_requests SET
                        status = 'rejected',
                        notes  = %s
                    WHERE request_uid = %s AND status = 'pending_approval'
                    """,
                    (reason, uid),
                )
                if rows:
                    _insert_booking_audit(
                        cur,
                        uid=uid,
                        actor_id=rejected_by,
                        action="rejected",
                        from_status="pending_approval",
                        to_status="rejected",
                        detail={"reason": reason},
                    )
            conn.commit()
        except Exception:
            conn.rollback()
            raise
    return rows


def update_cancelled(*, uid: str, reason: str, cancelled_by: str) -> dict[str, Any] | None:
    """Atomic: only flip approved -> cancelled. Returns calendar data if updated."""
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id, calendar_event_id, assigned_doctor_id,
                           doctor_calendar_event_id
                    FROM booking_requests
                    WHERE request_uid = %s AND status = 'approved'
                    FOR UPDATE
                    """,
                    (uid,),
                )
                booking = cur.fetchone()
                if not booking:
                    conn.rollback()
                    return None

                rows = cur.execute(
                    """
                    UPDATE booking_requests SET
                        status          = 'cancelled',
                        calendar_status = 'cancelled',
                        notes           = %s
                    WHERE request_uid = %s AND status = 'approved'
                    """,
                    (reason, uid),
                )
                if rows == 0:
                    conn.rollback()
                    return None

                _insert_booking_audit(
                    cur,
                    uid=uid,
                    actor_id=cancelled_by,
                    action="cancelled",
                    from_status="approved",
                    to_status="cancelled",
                    detail={"reason": reason},
                )
            conn.commit()
            return {
                "calendar_event_id": booking.get("calendar_event_id"),
                "assigned_doctor_id": booking.get("assigned_doctor_id"),
                "doctor_calendar_event_id": booking.get("doctor_calendar_event_id"),
            }
        except Exception:
            conn.rollback()
            raise


def _insert_booking_audit(
    cur: Any,
    *,
    uid: str,
    actor_id: str,
    action: str,
    from_status: str,
    to_status: str,
    detail: dict[str, Any],
) -> None:
    """เขียน audit log 1 แถวของการเปลี่ยนสถานะ booking (lookup booking id จาก uid
    ใน INSERT...SELECT). ใช้ cursor เดิมของ transaction ที่เรียกมา — atomic กับการอัปเดต."""
    cur.execute(
        """
        INSERT INTO booking_audit_logs
            (booking_request_id, actor_type, actor_id, action, from_status, to_status, detail)
        SELECT id, 'cro', %s, %s, %s, %s, %s
        FROM booking_requests
        WHERE request_uid = %s
        """,
        (
            actor_id,
            action,
            from_status,
            to_status,
            json.dumps(detail, ensure_ascii=False),
            uid,
        ),
    )
