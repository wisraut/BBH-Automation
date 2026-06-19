"""CRUD helpers for booking_requests — parameterized SQL only."""
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


def get_by_uid(uid: str) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_DETAIL_COLUMNS} FROM booking_requests "
                "WHERE request_uid = %s LIMIT 1",
                (uid,),
            )
            return cur.fetchone()


def update_approved(
    *, uid: str, event_id: str, event_url: str, approved_by: str
) -> int:
    """Atomic: only flip pending_approval → approved. Returns affected row count."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE booking_requests SET
                    status            = 'approved',
                    calendar_event_id = %s,
                    calendar_event_url= %s,
                    calendar_status   = 'created',
                    approved_by       = %s,
                    approved_at       = NOW()
                WHERE request_uid = %s AND status = 'pending_approval'
                """,
                (event_id, event_url, approved_by, uid),
            )
        conn.commit()
    return rows


def update_rejected(*, uid: str, reason: str, rejected_by: str) -> int:
    """Atomic: only flip pending_approval → rejected. Returns affected row count."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE booking_requests SET
                    status      = 'rejected',
                    notes       = %s,
                    approved_by = %s
                WHERE request_uid = %s AND status = 'pending_approval'
                """,
                (reason, rejected_by, uid),
            )
        conn.commit()
    return rows
