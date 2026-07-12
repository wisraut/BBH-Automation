"""AI assistant service logic — BBH Staff Assistant, backed by our own LLM
(Gemini via OpenRouter) with context injection. No Dify dependency."""
import json
import time
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from rag import llm
from services.pii_redactor import redact_text
import integrations.calendar_client as cal
from core.mysql import mysql_db
from repositories import ai_message_repo, booking_repo, patient_repo, report_repo

_TZ_BKK = timezone(timedelta(hours=7))

# Free-form staff assistant persona. Unlike the LINE customer bot this app has
# NO routing prefix (AUTO/ESCALATE/...) — it answers CRO/staff questions plainly.
_SYSTEM_PROMPT = (
    "คุณเป็นผู้ช่วย AI ภายในของโรงพยาบาล Better Being สำหรับเจ้าหน้าที่ (CRO/แพทย์/พยาบาล) "
    "ตอบเป็นภาษาไทย สุภาพ กระชับ ตรงประเด็น อ้างอิงเฉพาะข้อมูลใน context ที่ระบบให้มา "
    "ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่มีข้อมูล ห้ามแต่งตัวเลข/ชื่อ/เบอร์/วันเวลาขึ้นเอง "
    "ห้ามใส่ prefix จำแนกประเภทใดๆ นำหน้าคำตอบ ตอบเหมือนคุยกับเพื่อนร่วมงาน"
)

# Schedule context is identical for every chat message within a short window,
# but building it costs 2 DB queries + 2 Google Calendar API calls (~1-4s).
# Cache per-day for 60s so rapid turns in the same conversation don't pay it.
_SCHEDULE_CACHE: dict[str, tuple[float, str]] = {}
_SCHEDULE_TTL_SEC = 60


def chat(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
) -> dict[str, str]:
    conv_pk, conv_token = ai_message_repo.get_or_create(
        conversation_id, user_id=int(user["id"]), patient_id=patient_id
    )
    final_message = _compose_message(message=message, patient_id=patient_id)
    # Prior turns (short-term memory) sit between the persona and the current,
    # context-injected message. History is fetched before we save this turn.
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *ai_message_repo.load_history(conv_pk),
        {"role": "user", "content": final_message},
    ]
    try:
        answer = llm.chat(messages)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "AI_ERROR", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"},
        ) from exc
    _persist_turn(conv_pk, message, answer)
    return {"answer": answer, "conversation_id": conv_token}


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
    conv_pk, conv_token = ai_message_repo.get_or_create(
        conversation_id, user_id=int(user["id"]), patient_id=patient_id
    )
    final_message = _compose_message(message=message, patient_id=patient_id)
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *ai_message_repo.load_history(conv_pk),
        {"role": "user", "content": final_message},
    ]

    def _sse(payload: dict[str, Any]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    chunks: list[str] = []
    try:
        for delta in llm.chat_stream(messages):
            if delta:
                chunks.append(delta)
                yield _sse({"type": "delta", "text": delta})
        _persist_turn(conv_pk, message, "".join(chunks))
        yield _sse({"type": "conv_id", "value": conv_token})
        yield _sse({"type": "done"})
    except Exception:  # noqa: BLE001
        yield _sse({"type": "error", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"})
        raise


def _persist_turn(conversation_pk: int, message: str, answer: str) -> None:
    """Save both sides of a turn as short-term memory. The user message is
    PII-redacted before storage (same posture as what we send to OpenRouter);
    the assistant answer is already phrased in general terms."""
    ai_message_repo.save_turn(
        conversation_pk=conversation_pk, role="user", content=redact_text(message),
    )
    ai_message_repo.save_turn(
        conversation_pk=conversation_pk, role="assistant", content=answer,
    )


def _compose_message(*, message: str, patient_id: int | None) -> str:
    """Assemble context blocks + user question into a single prompt string.

    Output is PDPA-scrubbed: PII patterns + the pinned patient's name are
    masked before the prompt leaves the bridge for OpenRouter/Gemini.
    """
    parts: list[str] = []

    known_names: list[str] = []
    if patient_id is not None:
        patient_ctx = _build_patient_context(patient_id)
        if patient_ctx:
            parts.append(patient_ctx)
            pat = patient_repo.get_by_id(patient_id)
            if pat:
                name = pat.get("display_name") or pat.get("name")
                if name:
                    known_names.append(name)

    schedule_ctx = _build_schedule_context()
    if schedule_ctx:
        parts.append(schedule_ctx)

    parts.append(f"=== คำถาม ===\n{message}")
    composed = "\n\n".join(parts)
    return redact_text(composed, known_names=known_names)


_SCHEDULE_WINDOW_DAYS = 7  # past N days + next N days = 2N+1 days centered on today


def _build_schedule_context() -> str:
    """Schedule for [today-7, today+7]: approved bookings + Google Calendar events
    grouped per day so the assistant can answer 'what's on 19/6?' style questions."""
    now = datetime.now(_TZ_BKK)
    today = now.date()
    range_start = today - timedelta(days=_SCHEDULE_WINDOW_DAYS)
    range_end   = today + timedelta(days=_SCHEDULE_WINDOW_DAYS)

    cache_key = today.isoformat()
    cached = _SCHEDULE_CACHE.get(cache_key)
    if cached and cached[0] > time.time():
        return cached[1]

    # Fetch the entire window in one query each, then bucket by day.
    bookings_by_day: dict[str, list[dict[str, Any]]] = {}
    try:
        for b in booking_repo.list_by_date_range(range_start, range_end):
            day_key = str(b.get("requested_date") or "")
            bookings_by_day.setdefault(day_key, []).append(b)
    except Exception:
        bookings_by_day = {}

    events_by_day: dict[str, list[dict[str, Any]]] = {}
    if cal.is_configured():
        try:
            tmin = datetime(range_start.year, range_start.month, range_start.day, 0, 0, tzinfo=_TZ_BKK)
            tmax = datetime(range_end.year,   range_end.month,   range_end.day,   0, 0, tzinfo=_TZ_BKK) + timedelta(days=1)
            for e in cal.list_events(tmin, tmax):
                start_str = (e.get("start") or "")[:10]  # YYYY-MM-DD
                events_by_day.setdefault(start_str, []).append(e)
        except Exception:
            events_by_day = {}

    def _day_lines(day) -> list[str]:
        lines: list[str] = []
        for b in bookings_by_day.get(day.isoformat(), []):
            lines.append(
                f"  - {b.get('requested_time') or '-'} | {b.get('patient_name') or '-'} "
                f"| {b.get('symptom') or '-'}  [booking]"
            )
        for e in events_by_day.get(day.isoformat(), []):
            start_str = (e.get("start") or "")[11:16]
            lines.append(f"  - {start_str or '-'} | {e.get('summary') or '-'}  [calendar]")
        return lines or ["  ไม่มีนัด"]

    tomorrow = today + timedelta(days=1)
    parts: list[str] = [
        f"# Today is {today.strftime('%A %d/%m/%Y')} (Asia/Bangkok)",
        "",
        f"=== วันนี้ ({today.strftime('%d/%m/%Y')}) ===",
        *_day_lines(today),
        "",
        f"=== พรุ่งนี้ ({tomorrow.strftime('%d/%m/%Y')}) ===",
        *_day_lines(tomorrow),
        "",
        f"=== ตารางนัดอื่นในช่วง {range_start.strftime('%d/%m/%Y')} ถึง {range_end.strftime('%d/%m/%Y')} ===",
        "(ทุกวันที่อยู่นอกช่วงนี้ ระบบยังไม่ได้ให้ข้อมูลมา)",
    ]

    for offset in range(-_SCHEDULE_WINDOW_DAYS, _SCHEDULE_WINDOW_DAYS + 1):
        if offset in (0, 1):
            continue  # already rendered above
        day = today + timedelta(days=offset)
        day_lines = _day_lines(day)
        # Single empty days collapse to one row to keep the prompt compact.
        if day_lines == ["  ไม่มีนัด"]:
            parts.append(f"{day.strftime('%d/%m/%Y')}: ไม่มีนัด")
        else:
            parts.append(f"{day.strftime('%d/%m/%Y')}:")
            parts.extend(day_lines)

    result = "\n".join(parts)
    _SCHEDULE_CACHE[cache_key] = (time.time() + _SCHEDULE_TTL_SEC, result)
    return result


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
