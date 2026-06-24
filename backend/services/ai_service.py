"""AI assistant service logic — BBH Staff Assistant Dify proxy with context injection."""
import json
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

import integrations.dify_client as dify
import integrations.calendar_client as cal
from core.config import DIFY_STAFF_API_KEY
from core.mysql import mysql_db
from repositories import booking_repo, patient_repo, report_repo

_TZ_BKK = timezone(timedelta(hours=7))


def chat(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
) -> dict[str, str]:
    final_message = _compose_message(message=message, patient_id=patient_id)
    try:
        answer, conv_id = dify.ask(
            user_id=str(user["id"]),
            message=final_message,
            role="staff",
            conv_id=conversation_id,
            api_key=DIFY_STAFF_API_KEY or None,
            inputs={},
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "DIFY_ERROR", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"},
        ) from exc
    return {"answer": answer, "conversation_id": conv_id}


def chat_stream(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
) -> Iterator[str]:
    """
    Yield SSE lines — each line is `data: <json>\\n\\n`.
    Events:
      { "type": "delta", "text": "..." }
      { "type": "conv_id", "value": "..." }
      { "type": "done" }
      { "type": "error", "message": "..." }
    """
    final_message = _compose_message(message=message, patient_id=patient_id)

    def _sse(payload: dict[str, Any]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    try:
        for etype, value in dify.stream(
            user_id=str(user["id"]),
            message=final_message,
            role="staff",
            conv_id=conversation_id,
            api_key=DIFY_STAFF_API_KEY or None,
            inputs={},
        ):
            if etype == "delta":
                if value:
                    yield _sse({"type": "delta", "text": value})
            elif etype == "conv_id":
                yield _sse({"type": "conv_id", "value": value})
            elif etype == "done":
                yield _sse({"type": "done"})
    except Exception:  # noqa: BLE001
        yield _sse({"type": "error", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"})
        raise


def _compose_message(*, message: str, patient_id: int | None) -> str:
    """Assemble context blocks + user question into a single prompt string."""
    parts: list[str] = []

    patient_ctx = _build_patient_context(patient_id) if patient_id is not None else ""
    if patient_ctx:
        parts.append(patient_ctx)

    schedule_ctx = _build_schedule_context()
    if schedule_ctx:
        parts.append(schedule_ctx)

    parts.append(f"=== คำถาม ===\n{message}")
    return "\n\n".join(parts)


def _build_schedule_context() -> str:
    """Compose today + tomorrow schedule: approved bookings + Google Calendar events."""
    now = datetime.now(_TZ_BKK)
    today = now.date()
    tomorrow = today + timedelta(days=1)

    parts: list[str] = []

    for label, day in (("วันนี้", today), ("พรุ่งนี้", tomorrow)):
        day_parts = [f"=== สถานการณ์{label} ({day.strftime('%d/%m/%Y')}) ==="]

        try:
            bookings = booking_repo.list_by_date_range(day, day)
            if bookings:
                day_parts.append(f"Bookings ที่ approved ({len(bookings)} นัด):")
                for b in bookings:
                    day_parts.append(
                        f"  - {b.get('requested_time') or '-'} | {b.get('patient_name') or '-'} "
                        f"| {b.get('symptom') or '-'}"
                    )
            else:
                day_parts.append("Bookings approved: ไม่มี")
        except Exception:
            day_parts.append("Bookings: ดึงข้อมูลไม่ได้")

        if cal.is_configured():
            try:
                day_start = datetime(day.year, day.month, day.day, 0, 0, tzinfo=_TZ_BKK)
                day_end = day_start + timedelta(days=1)
                events = cal.list_events(day_start, day_end)
                if events:
                    day_parts.append(f"Google Calendar ({len(events)} events):")
                    for e in events:
                        start_str = (e.get("start") or "")[:16].replace("T", " ")
                        day_parts.append(f"  - {start_str} | {e.get('summary')}")
                else:
                    day_parts.append("Google Calendar: ไม่มี event")
            except Exception:
                day_parts.append("Google Calendar: ดึงข้อมูลไม่ได้")

        parts.append("\n".join(day_parts))

    return "\n\n".join(parts)


def _build_patient_context(patient_id: int) -> str:
    """Compose a Thai-formatted context block: profile + recent bookings + reports."""
    patient = patient_repo.get_by_id(patient_id)
    if not patient:
        return ""

    bookings = _recent_bookings(patient_id, limit=5)
    total_bookings = _count_bookings(patient_id)
    all_reports = report_repo.list_by_patient(patient_id)
    reports = all_reports[:5]
    total_reports = len(all_reports)

    parts = [
        "=== คนไข้ที่กำลังพูดถึง ===",
        f"HN: {patient.get('hn') or '-'}",
        f"ชื่อ: {patient.get('display_name') or '-'}",
        f"เพศ: {patient.get('gender') or '-'}",
        f"วันเกิด: {patient.get('dob') or '-'}",
        f"เบอร์: {patient.get('phone') or '-'}",
        f"หมายเหตุ: {patient.get('notes') or '-'}",
        f"จำนวน Bookings ทั้งหมด: {total_bookings} ครั้ง",
        f"จำนวน Reports ทั้งหมด: {total_reports} ฉบับ",
    ]

    if bookings:
        parts.append("")
        parts.append(f"=== Bookings ล่าสุด {len(bookings)} จาก {total_bookings} ครั้ง ===")
        for b in bookings:
            parts.append(
                f"- {b.get('requested_datetime_text') or '-'} | status: {b.get('status')} | "
                f"อาการ: {(b.get('symptom') or '-')[:120]}"
            )

    if reports:
        parts.append("")
        parts.append(f"=== Reports ล่าสุด {len(reports)} จาก {total_reports} ฉบับ ===")
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


def _count_bookings(patient_id: int) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM booking_requests WHERE patient_id = %s",
                (patient_id,),
            )
            return int(cur.fetchone()["n"])
