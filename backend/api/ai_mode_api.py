"""CRO/admin AI-mode toggle for a patient's LINE conversation.

3 sticky modes: auto | copilot | silent
Effective mode is computed at read time (business-hours + auto-pause override).
"""
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.mysql import mysql_db
from core.security import require_user
from repositories import patient_repo
from services import audit_service
from utils.ai_mode import compute_effective

router = APIRouter(prefix="/api/patients", tags=["ai-mode"])

_CroOrAdmin = Annotated[dict, Depends(require_user(["cro", "admin"]))]


def _resolve_line_uid(patient_id: int) -> str | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT external_user_id FROM booking_requests
                WHERE patient_id = %s AND channel LIKE 'line%%'
                  AND external_user_id IS NOT NULL AND external_user_id <> ''
                ORDER BY created_at DESC LIMIT 1
                """,
                (patient_id,),
            )
            row = cur.fetchone()
            return row["external_user_id"] if row else None


class ModeRequest(BaseModel):
    mode: Literal["auto", "copilot", "silent"]
    reason: str = Field(default="cro_manual", max_length=255)


@router.get("/{patient_id}/ai-mode")
def get_mode(patient_id: int, user: _CroOrAdmin) -> dict:
    """Return sticky + effective mode + banner state for a patient's LINE session."""
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})

    uid = _resolve_line_uid(patient_id)
    if not uid:
        eff = compute_effective(None, None)
        return {
            "has_line_session": False,
            "ai_mode": "auto",
            "ai_pause_until": None,
            **eff,
        }

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, ai_mode, ai_pause_until, mode_changed_by, mode_changed_at
                FROM bot_sessions
                WHERE channel LIKE 'line%%' AND external_user_id = %s
                ORDER BY updated_at DESC LIMIT 1
                """,
                (uid,),
            )
            row = cur.fetchone()

    if not row:
        eff = compute_effective(None, None)
        return {"has_line_session": False, "ai_mode": "auto", "ai_pause_until": None, **eff}

    eff = compute_effective(row["ai_mode"], row["ai_pause_until"])
    return {
        "has_line_session": True,
        "session_id": row["id"],
        "ai_mode": row["ai_mode"] or "auto",
        "ai_pause_until": row["ai_pause_until"].isoformat() if row["ai_pause_until"] else None,
        "mode_changed_by": row["mode_changed_by"],
        "mode_changed_at": row["mode_changed_at"].isoformat() if row["mode_changed_at"] else None,
        **eff,
    }


@router.post("/{patient_id}/ai-mode")
def set_mode(
    patient_id: int, body: ModeRequest, request: Request, user: _CroOrAdmin,
) -> dict:
    """Set sticky ai_mode + write audit event. Requires patient to have a
    LINE session (won't create one from scratch)."""
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})

    uid = _resolve_line_uid(patient_id)
    if not uid:
        raise HTTPException(
            400,
            {"code": "NO_LINE_SESSION",
             "message": "คนไข้ยังไม่มี LINE session — ต้องรอคนไข้ทักมาก่อน"},
        )

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, ai_mode FROM bot_sessions WHERE channel LIKE 'line%%' AND external_user_id=%s LIMIT 1",
                (uid,),
            )
            sess = cur.fetchone()
            if not sess:
                raise HTTPException(
                    400,
                    {"code": "NO_LINE_SESSION",
                     "message": "คนไข้ยังไม่มี LINE session"},
                )
            from_mode = sess["ai_mode"] or "auto"
            if from_mode == body.mode:
                return {"ok": True, "unchanged": True, "ai_mode": body.mode}

            cur.execute(
                """
                UPDATE bot_sessions
                SET ai_mode = %s,
                    mode_changed_by = %s,
                    mode_changed_at = NOW(),
                    ai_pause_until = NULL
                WHERE id = %s
                """,
                (body.mode, user["id"], sess["id"]),
            )
            cur.execute(
                """
                INSERT INTO bot_mode_events (session_id, from_mode, to_mode,
                    actor_type, actor_id, trigger_reason)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (sess["id"], from_mode, body.mode,
                 "admin" if user.get("role") == "admin" else "cro",
                 user["id"], body.reason[:255]),
            )
        conn.commit()

    audit_service.record_access(
        request, user,
        action="set_patient_ai_mode", subject_type="patient",
        subject_id=patient_id, patient_id=patient_id,
        extra={"from_mode": from_mode, "to_mode": body.mode, "reason": body.reason},
    )
    return {
        "ok": True,
        "from_mode": from_mode,
        "ai_mode": body.mode,
        "changed_at": datetime.now().isoformat(),
    }
