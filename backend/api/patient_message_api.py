"""CRO ↔ patient LINE messaging + chat history.

- POST /api/patients/{id}/message — CRO sends custom message (auto-pauses AI)
- GET  /api/patients/{id}/messages — chat history for Web Dashboard render
"""
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.mysql import mysql_db
from core.security import require_user
from integrations import line_client
from repositories import message_repo, patient_repo
from services import audit_service
from utils.ai_mode import AUTO_PAUSE_MINUTES


router = APIRouter(prefix="/api/patients", tags=["patient-message"])

_CroOrAdmin = Annotated[dict, Depends(require_user(["cro", "admin"]))]


class CustomMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


def _resolve_line_uid(patient_id: int) -> str | None:
    """Find the most recent LINE user_id we have for this patient (from any
    LINE-channel booking)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT external_user_id
                FROM booking_requests
                WHERE patient_id = %s
                  AND channel LIKE 'line%%'
                  AND external_user_id IS NOT NULL AND external_user_id <> ''
                ORDER BY created_at DESC
                LIMIT 1
                """,
                (patient_id,),
            )
            row = cur.fetchone()
            return row["external_user_id"] if row else None


def _slide_auto_pause(uid: str) -> None:
    """Extend ai_pause_until so AI stays quiet while the CRO handles this thread.
    Uses MySQL NOW() so the pause TS is comparable to future NOW() checks
    without timezone confusion between app container and DB."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                UPDATE bot_sessions
                SET ai_pause_until = DATE_ADD(NOW(), INTERVAL %s MINUTE)
                WHERE channel LIKE 'line%%' AND external_user_id = %s
                """,
                (AUTO_PAUSE_MINUTES, uid),
            )
            cur.execute(
                "SELECT id FROM bot_sessions WHERE channel LIKE 'line%%' AND external_user_id=%s",
                (uid,),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    """
                    INSERT INTO bot_mode_events (session_id, from_mode, to_mode,
                        actor_type, trigger_reason)
                    VALUES (%s, NULL, 'paused', 'auto_pause', 'cro_reply')
                    """,
                    (row["id"],),
                )
        conn.commit()


@router.post("/{patient_id}/message")
def send_custom_message(
    patient_id: int, body: CustomMessageRequest, request: Request, user: _CroOrAdmin,
) -> dict:
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})

    uid = _resolve_line_uid(patient_id)
    if not uid:
        raise HTTPException(
            400,
            {"code": "NO_LINE_CHANNEL",
             "message": "คนไข้รายนี้ไม่มี LINE — ไม่สามารถส่งข้อความได้"},
        )

    try:
        line_client.push(
            uid, body.message,
            triggered_by=f"cro_custom_message:{user['id']}",
            reference_id=f"patient:{patient_id}",
        )
    except Exception as exc:
        raise HTTPException(
            502,
            {"code": "LINE_PUSH_FAILED",
             "message": f"ส่งไม่สำเร็จ — {type(exc).__name__}"},
        ) from exc

    # Log outbound + auto-pause AI for this session so AI won't race the CRO reply.
    message_repo.log_outbound_cro(
        channel="line_main", external_user_id=uid,
        text=body.message, actor_user_id=user["id"],
    )
    _slide_auto_pause(uid)

    audit_service.record_access(
        request, user,
        action="send_patient_line_message", subject_type="patient",
        subject_id=patient_id, patient_id=patient_id,
        extra={"message_length": len(body.message), "line_uid_preview": uid[:8] + "..."},
    )
    return {
        "ok": True,
        "channel": "line_main",
        "ai_paused_minutes": AUTO_PAUSE_MINUTES,
    }


@router.get("/{patient_id}/messages")
def list_messages(patient_id: int, user: _CroOrAdmin, limit: int = 100) -> dict:
    """Return chat history (ascending by time) for CRO to render as LINE-style bubbles."""
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})

    limit = max(1, min(500, int(limit)))
    rows = message_repo.list_by_patient(patient_id, limit=limit)
    items = [
        {
            "id": r["id"],
            "direction": r["direction"],
            "message_type": r["message_type"],
            "text": r["message_text"] or r["dify_answer"],
            "route_prefix": r["route_prefix"],
            "at": r["created_at"].isoformat() if r.get("created_at") else None,
        }
        for r in rows
    ]
    return {"data": items, "count": len(items)}
