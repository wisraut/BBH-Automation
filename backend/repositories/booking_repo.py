"""CRUD helpers for booking_requests - parameterized SQL only."""
import json
import uuid
from datetime import date, time, timedelta
from typing import Any

from core.mysql import mysql_db


_LIST_COLUMNS = (
    "request_uid, status, patient_name, phone, requested_datetime_text, "
    "symptom, booking_source, appointment_type, created_at"
)

_DETAIL_COLUMNS = (
    "request_uid, status, channel, external_user_id, patient_name, phone, "
    "requested_date, requested_time, requested_datetime_text, symptom, "
    "service_type, doctor_code, booking_source, appointment_type, duration_min, "
    "calendar_event_id, calendar_event_url, calendar_status, "
    "assigned_doctor_id, patient_id, notes, approved_by, approved_at, "
    "reminder_24h_sent_at, reminder_1h_sent_at, "
    "created_at, updated_at"
)


def list_bookings(
    *, status: str | None, page: int, limit: int
) -> tuple[list[dict[str, Any]], int]:
    offset = (page - 1) * limit
    where_sql = "WHERE status = %s" if status else ""
    where_args: tuple[Any, ...] = (status,) if status else ()

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
) -> dict[str, Any] | None:
    """Approve booking and attach/create the real patient record atomically."""
    with mysql_db() as conn:
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT request_uid, status, patient_id, patient_name, phone, email
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
                else:
                    patient = _find_patient_for_booking(cur, booking)
                    if patient:
                        patient_id = patient["id"]
                        hn = patient.get("hn")
                    else:
                        hn = _next_hn(cur, hn_year)
                        cur.execute(
                            """
                            INSERT INTO patients
                                (hn, display_name, phone, email, notes, created_by)
                            VALUES
                                (%s, %s, %s, %s, %s, %s)
                            """,
                            (
                                hn,
                                booking.get("patient_name") or "Unknown Patient",
                                booking.get("phone") or None,
                                booking.get("email") or None,
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
                        approved_by         = %s,
                        approved_at         = NOW(),
                        assigned_doctor_id  = COALESCE(%s, assigned_doctor_id)
                    WHERE request_uid = %s AND status = 'pending_approval'
                    """,
                    (patient_id, event_id, event_url, approved_by, assigned_doctor_id, uid),
                )
            if rows == 0:
                conn.rollback()
                return None
            conn.commit()
            return {"patient_id": patient_id, "hn": hn}
        except Exception:
            conn.rollback()
            raise


def list_rescheduled_in_range(
    *, start_date: str, end_date: str,
) -> list[dict[str, Any]]:
    """Bookings whose LATEST audit action is a reschedule that is still in
    effect. Used by Calendar to render a gray "เลื่อนนัด N" marker on the day
    cell.

    With-time reschedule → status='approved', marker on new requested_date.
    TBD reschedule → status='pending_approval', marker on old_date from
    the audit detail (until CRO re-approves with a new time).
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT b.request_uid, b.patient_name, b.status,
                       b.requested_date,
                       la.action AS latest_action, la.detail AS latest_detail
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
        # An "in effect" reschedule requires the current status to match the
        # audit — TBD then re-approved has status='approved' but latest audit
        # still 'rescheduled_pending', which should NOT show a marker.
        if action == "rescheduled" and status != "approved":
            continue
        if action == "rescheduled_pending" and status != "pending_approval":
            continue

        if action == "rescheduled":
            display = row.get("requested_date")
            display_date = display.isoformat() if hasattr(display, "isoformat") else str(display or "")
            is_tbd = False
        else:
            try:
                detail = json.loads(row["latest_detail"]) if row["latest_detail"] else {}
            except Exception:  # noqa: BLE001
                detail = {}
            display_date = str(detail.get("old_date") or "")
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
    phone = (booking.get("phone") or "").strip()
    if not phone:
        return None
    cur.execute(
        """
        SELECT id, hn
        FROM patients
        WHERE phone = %s
        ORDER BY id ASC
        LIMIT 1
        """,
        (phone,),
    )
    return cur.fetchone()


def _next_hn(cur: Any, year_yy: str) -> str:
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
                    SELECT id, calendar_event_id
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
            return {"calendar_event_id": booking.get("calendar_event_id")}
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
