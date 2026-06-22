"""AI assistant service logic — Dify proxy + optional patient context injection."""
from typing import Any

from fastapi import HTTPException

import integrations.dify_client as dify
from core.mysql import mysql_db
from repositories import patient_repo, report_repo


def _dify_role(dashboard_role: str) -> str:
    return "doctor" if dashboard_role == "doctor" else "public_inquiry"


def chat(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
) -> dict[str, str]:
    role = _dify_role(user["role"])

    # If staff pinned a patient to the session, prepend their profile +
    # recent bookings/reports so Dify can answer questions about them.
    final_message = message
    if patient_id is not None:
        context = _build_patient_context(patient_id)
        if context:
            final_message = f"{context}\n\n=== คำถาม ===\n{message}"

    try:
        answer, conv_id = dify.ask(
            user_id=str(user["id"]),
            message=final_message,
            role=role,
            conv_id=conversation_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "DIFY_ERROR", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"},
        ) from exc

    if role != "doctor":
        _, _, clean = dify.parse_decision(answer)
        answer = clean

    return {"answer": answer, "conversation_id": conv_id}


def _build_patient_context(patient_id: int) -> str:
    """Compose a Thai-formatted context block: profile + recent bookings + reports."""
    patient = patient_repo.get_by_id(patient_id)
    if not patient:
        return ""

    bookings = _recent_bookings(patient_id, limit=5)
    reports = report_repo.list_by_patient(patient_id)[:5]

    parts = [
        "=== คนไข้ที่กำลังพูดถึง ===",
        f"HN: {patient.get('hn') or '-'}",
        f"ชื่อ: {patient.get('display_name') or '-'}",
        f"เพศ: {patient.get('gender') or '-'}",
        f"วันเกิด: {patient.get('dob') or '-'}",
        f"เบอร์: {patient.get('phone') or '-'}",
        f"หมายเหตุ: {patient.get('notes') or '-'}",
    ]

    if bookings:
        parts.append("")
        parts.append(f"=== Bookings ล่าสุด ({len(bookings)}) ===")
        for b in bookings:
            parts.append(
                f"- {b.get('requested_datetime_text') or '-'} | status: {b.get('status')} | "
                f"อาการ: {(b.get('symptom') or '-')[:120]}"
            )

    if reports:
        parts.append("")
        parts.append(f"=== Reports ล่าสุด ({len(reports)}) ===")
        for r in reports:
            snippet = (r.get("title") or "-")
            parts.append(f"- {r.get('uploaded_at')} | {r.get('report_type')} | {snippet}")

    return "\n".join(parts)


def _recent_bookings(patient_id: int, *, limit: int) -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_uid, status, requested_datetime_text, symptom, created_at
                FROM booking_requests
                WHERE patient_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (patient_id, limit),
            )
            return cur.fetchall()
