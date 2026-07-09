"""Booking management — create, approve, reject, and CRO user lookup."""
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

from api.health import _require_internal_token
from api.session import _db
from core.config import log
from repositories import booking_repo

router = APIRouter(prefix="/internal/booking")


class BookingCreate(BaseModel):
    # max_length mirrors the DB columns so an over-long value fails validation
    # (422) instead of overflowing the INSERT (DataError 1406 -> 500). The
    # name/phone come from patient free-text via LINE, so this is attacker-facing.
    user_id: str = Field(max_length=191)
    name: str = Field(max_length=191)
    phone: str = Field(max_length=80)
    date: str = Field(max_length=40)
    time: str = Field(max_length=40)
    symptom: str = Field(max_length=2000)
    email: Optional[str] = Field(default=None, max_length=191)
    raw_summary: Optional[dict] = None


class ApproveBooking(BaseModel):
    calendar_event_id: str = ""
    calendar_event_url: str = ""
    approved_by: str = "cro"


class RejectBooking(BaseModel):
    reason: str = ""
    rejected_by: str = "cro"


@router.post("")
def create_booking(body: BookingCreate, x_internal_token: str | None = Header(None)):
    _require_internal_token(x_internal_token)
    request_uid = str(uuid.uuid4())
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO booking_requests
                    (request_uid, channel, external_user_id, status,
                     patient_name, phone, email, requested_datetime_text,
                     symptom, raw_summary)
                VALUES (%s, 'line_main', %s, 'pending_approval',
                        %s, %s, %s, %s, %s, %s)
                """,
                (
                    request_uid, body.user_id, body.name, body.phone,
                    (body.email or None),
                    f"{body.date} {body.time}", body.symptom,
                    json.dumps(body.raw_summary or {}, ensure_ascii=False),
                ),
            )
        conn.commit()
    log.info("Booking created: %s for %s", request_uid[:8], body.name)
    return {"request_uid": request_uid, "ok": True}


@router.get("/cro-user/latest")
def get_latest_cro_user(x_internal_token: str | None = Header(None)):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            # LINE userId = 'U' + 32 hex; filter test users (Ucro-*, Utest-*, etc.)
            cur.execute(
                "SELECT external_user_id FROM bot_sessions "
                "WHERE channel = 'line_cro' "
                "  AND external_user_id REGEXP '^U[0-9a-f]{32}$' "
                "ORDER BY updated_at DESC LIMIT 1"
            )
            row = cur.fetchone()
    return {"user_id": row["external_user_id"] if row else None}


@router.get("/latest-pending")
def get_latest_pending(x_internal_token: str | None = Header(None)):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT request_uid, patient_name, phone, requested_datetime_text, symptom, external_user_id "
                "FROM booking_requests WHERE status = 'pending_approval' "
                "ORDER BY created_at DESC LIMIT 1"
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No pending booking")
    return row


@router.get("/{request_uid}")
def get_booking(request_uid: str, x_internal_token: str | None = Header(None)):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT * FROM booking_requests WHERE request_uid = %s LIMIT 1",
                (request_uid,),
            )
            row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Booking not found")
    # Convert non-serialisable types
    for k, v in row.items():
        if hasattr(v, 'isoformat'):
            row[k] = v.isoformat()
    return row


@router.post("/{request_uid}/approve")
def approve_booking(
    request_uid: str,
    body: ApproveBooking,
    x_internal_token: str | None = Header(None),
):
    _require_internal_token(x_internal_token)
    hn_year = datetime.now(timezone(timedelta(hours=7))).strftime("%y")
    approved = booking_repo.update_approved(
        uid=request_uid,
        event_id=body.calendar_event_id,
        event_url=body.calendar_event_url,
        approved_by=body.approved_by,
        approved_by_user_id=None,
        hn_year=hn_year,
    )
    if not approved:
        raise HTTPException(status_code=409, detail="Booking is not pending approval")
    log.info("Booking approved: %s by %s", request_uid[:8], body.approved_by)
    return {"ok": True, "patient_id": approved["patient_id"], "hn": approved["hn"]}


@router.post("/{request_uid}/reject")
def reject_booking(
    request_uid: str,
    body: RejectBooking,
    x_internal_token: str | None = Header(None),
):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE booking_requests SET status = 'rejected', notes = %s WHERE request_uid = %s",
                (body.reason, request_uid),
            )
        conn.commit()
    log.info("Booking rejected: %s", request_uid[:8])
    return {"ok": True}

