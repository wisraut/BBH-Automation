"""Send a custom LINE message to a patient — CRO communication tool.

Looks up the patient's most recent LINE external_user_id on booking_requests
(channel=line_*) and pushes the text via line_client. Logged via line_push_log
(line_client already does this) plus an audit entry.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from core.mysql import mysql_db
from core.security import require_user
from integrations import line_client
from repositories import patient_repo
from services import audit_service


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

    audit_service.record_access(
        request, user,
        action="send_patient_line_message", subject_type="patient",
        subject_id=patient_id, patient_id=patient_id,
        extra={"message_length": len(body.message), "line_uid_preview": uid[:8] + "..."},
    )
    return {"ok": True, "channel": "line_main"}
