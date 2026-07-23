"""AI assistant service logic — BBH Staff Assistant, backed by our own LLM
(Gemini via OpenRouter) with context injection. No Dify dependency."""
import json
import time
from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from rag import embedder, llm, vector_store
from rag.service import is_book_domain
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
    "ถ้า context มีส่วน 'อ้างอิงตำราแพทย์' ให้ใช้เนื้อหานั้นประกอบคำตอบ และระบุที่มา "
    "(ชื่อตำรา/หน้า) เมื่ออ้างถึงข้อมูลจากตำรา "
    "ถ้าไม่มีข้อมูลให้บอกตรงๆ ว่าไม่มีข้อมูล ห้ามแต่งตัวเลข/ชื่อ/เบอร์/วันเวลาขึ้นเอง "
    "ห้ามใส่ prefix จำแนกประเภทใดๆ นำหน้าคำตอบ ตอบเหมือนคุยกับเพื่อนร่วมงาน"
)

# Schedule context is identical for every chat message within a short window,
# but building it costs 2 DB queries + 2 Google Calendar API calls (~1-4s).
# Cache per-day for 60s so rapid turns in the same conversation don't pay it.
_SCHEDULE_CACHE: dict[str, tuple[float, str]] = {}
_SCHEDULE_TTL_SEC = 60

# All patient display names, cached, used as redact_text known_names so ANY
# patient name is PDPA-masked wherever it lands in the prompt — a booking line, a
# free-text symptom, a Google Calendar summary (which carries names we can't
# structurally isolate), or even a textbook chunk that happens to match. Cached
# so we don't hit the DB per chat turn. Scale note: redact_text masks name-by-name
# (N passes); if the patient table grows to thousands, move to a single combined
# regex or NER instead of this dictionary. Residual: a name in free text that is
# NOT a registered patient (e.g. a relative mentioned in a symptom) can't be
# caught by a dictionary and would still pass through.
_PATIENT_NAMES_CACHE: dict[str, tuple[float, list[str]]] = {}
_PATIENT_NAMES_TTL_SEC = 300


def _all_patient_names() -> list[str]:
    """ชื่อคนไข้ทั้งหมด (display_name) สำหรับใช้เป็น known_names ของ redact_text —
    cache ไว้ตาม TTL กัน query ต่อทุกข้อความ; คืน [] ถ้า DB ล่ม (ยอมตอบต่อได้
    มากกว่าพังทั้งเทิร์น แต่ pattern-based PII อื่นยังทำงาน)"""
    cached = _PATIENT_NAMES_CACHE.get("all")
    if cached and cached[0] > time.time():
        return cached[1]
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT display_name FROM patients "
                    "WHERE display_name IS NOT NULL AND display_name <> ''"
                )
                names = [r["display_name"] for r in cur.fetchall()]
    except Exception:  # noqa: BLE001 — masking is best-effort; pattern PII still runs
        names = []
    _PATIENT_NAMES_CACHE["all"] = (time.time() + _PATIENT_NAMES_TTL_SEC, names)
    return names


# Default instruction when the staff attaches an image with no text of their own,
# so the model has a clear directive instead of a bare image.
_IMAGE_ONLY_PROMPT = "ช่วยดูรูปที่แนบมาแล้วอธิบาย/ให้ความเห็นหน่อย"


def _user_content(text: str, image: dict[str, Any] | None):
    """content ของ user message: string ปกติ หรือ array [text, image_url] ถ้ามีรูปแนบ
    (multimodal สำหรับ vision — OpenRouter/Gemini อ่าน image_url แบบ data URI).
    image = {'mime_type','data'(base64 ไม่รวม prefix)} ที่ schema validate ขนาด/ชนิดแล้ว"""
    if not image:
        return text
    return [
        {"type": "text", "text": text},
        {
            "type": "image_url",
            "image_url": {"url": f"data:{image['mime_type']};base64,{image['data']}"},
        },
    ]


def chat(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
    image: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """ตอบแชทเจ้าหน้าที่แบบครั้งเดียวจบ (non-stream) — โหลด/สร้าง conversation,
    inject context คนไข้+ตารางนัด, ยิง LLM แล้วบันทึกเทิร์นเป็น short-term memory
    ถ้า LLM ล้มโยน 502 AI_ERROR (ไม่ให้ error ภายในหลุดถึง client)"""
    conv_pk, conv_token = ai_message_repo.get_or_create(
        conversation_id, user_id=int(user["id"]), patient_id=patient_id
    )
    effective_message = message.strip() or _IMAGE_ONLY_PROMPT
    # Prior turns (short-term memory) sit between the persona and the current,
    # context-injected message. History is fetched before we save this turn, and
    # also feeds the book-grounding gate so an in-domain thread keeps grounding
    # when a follow-up omits the disease name.
    history = ai_message_repo.load_history(conv_pk)
    final_message, book_sources = _compose_message(
        message=effective_message, patient_id=patient_id, history=history
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *_history_for_llm(history),
        {"role": "user", "content": _user_content(final_message, image)},
    ]
    try:
        answer = llm.chat(messages)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "AI_ERROR", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"},
        ) from exc
    _persist_turn(
        conv_pk, message, answer,
        image_thumb=(image or {}).get("thumb"), book_sources=book_sources,
    )
    return {"answer": answer, "conversation_id": conv_token, "book_sources": book_sources}


def chat_stream(
    *,
    message: str,
    conversation_id: str,
    patient_id: int | None,
    user: dict[str, Any],
    image: dict[str, Any] | None = None,
) -> Iterator[str]:
    """
    Yield SSE lines — each line is `data: <json>\\n\\n`.
    Events:
      { "type": "delta", "text": "..." }
      { "type": "book_sources", "sources": [{title, page, score}, ...] }  # optional, before conv_id
      { "type": "conv_id", "value": "..." }
      { "type": "done" }
      { "type": "error", "message": "..." }
    """
    conv_pk, conv_token = ai_message_repo.get_or_create(
        conversation_id, user_id=int(user["id"]), patient_id=patient_id
    )
    effective_message = message.strip() or _IMAGE_ONLY_PROMPT
    history = ai_message_repo.load_history(conv_pk)
    final_message, book_sources = _compose_message(
        message=effective_message, patient_id=patient_id, history=history
    )
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        *_history_for_llm(history),
        {"role": "user", "content": _user_content(final_message, image)},
    ]

    def _sse(payload: dict[str, Any]) -> str:
        return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"

    chunks: list[str] = []
    try:
        for delta in llm.chat_stream(messages):
            if delta:
                chunks.append(delta)
                yield _sse({"type": "delta", "text": delta})
        _persist_turn(
            conv_pk, message, "".join(chunks),
            image_thumb=(image or {}).get("thumb"), book_sources=book_sources,
        )
        # Textbook citations (if any) ride alongside the answer metadata so the
        # UI can footnote which sources grounded it — see search_books gate below.
        if book_sources:
            yield _sse({"type": "book_sources", "sources": book_sources})
        yield _sse({"type": "conv_id", "value": conv_token})
        yield _sse({"type": "done"})
    except Exception:  # noqa: BLE001
        yield _sse({"type": "error", "message": "AI ตอบไม่สำเร็จ กรุณาลองใหม่"})
        raise


def _persist_turn(
    conversation_pk: int,
    message: str,
    answer: str,
    image_thumb: str | None = None,
    book_sources: list[dict] | None = None,
) -> None:
    """Save both sides of a turn as short-term memory + display history. The ORIGINAL
    user text is stored (our MySQL is auth-gated — redaction happens only when text
    leaves for the external LLM, in load-for-send), together with any attached image
    thumbnail and textbook citations. The first user message seeds the conversation
    title for the sidebar."""
    title = " ".join(message.split())[:80] if message.strip() else None
    ai_message_repo.save_exchange(
        conversation_pk=conversation_pk,
        user_content=message,
        assistant_content=answer,
        image_thumb=image_thumb,
        book_sources=book_sources,
        title=title,
    )


def _history_for_llm(history: list[dict]) -> list[dict]:
    """PDPA-mask stored (original) history turns before they go back to the external
    LLM — same known_names dictionary as the current turn, so patient names never
    leave the bridge even though we store them verbatim for display."""
    names = _all_patient_names()
    return [
        {"role": h["role"], "content": redact_text(h["content"], known_names=names)}
        for h in history
    ]


def _compose_message(
    *, message: str, patient_id: int | None, history: list[dict] | None = None
) -> tuple[str, list[dict]]:
    """Assemble context blocks + user question into a single prompt string.

    Returns (composed_prompt, book_sources). Output is PDPA-scrubbed: PII patterns
    + the pinned patient's name are masked before the prompt leaves the bridge for
    OpenRouter/Gemini. book_sources lists the textbook chunks (if any) that were
    injected, so the caller can surface citations to the UI.
    """
    parts: list[str] = []

    # Seed the mask list with every registered patient name, so appointment names
    # (bookings + calendar summaries) and any patient named in free text are all
    # masked before the prompt leaves for OpenRouter. The pinned patient is added
    # explicitly too, in case they were registered after the cache last refreshed.
    known_names: list[str] = list(_all_patient_names())
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

    book_ctx, book_sources = _book_context(message, history)
    if book_ctx:
        parts.append(book_ctx)

    parts.append(f"=== คำถาม ===\n{message}")
    composed = "\n\n".join(parts)
    return redact_text(composed, known_names=known_names), book_sources


# Book grounding for staff: same corpus + retrieval gate as the LINE bot's
# CONSULT pass (rag.service). The corpus covers ONLY autoimmune / functional
# medicine, so we gate on is_book_domain FIRST — a general staff question
# ("ปวดหัวทำไง") would otherwise pull weakly-related autoimmune chunks (the books
# have nothing else) and skew the answer. search_books' min_score is a second
# guard. Single-pass here (no re-answer) — staff persona is free-form, so we just
# hand the model the textbook context and let it cite.
def _book_context(message: str, history: list[dict] | None = None) -> tuple[str, list[dict]]:
    """ค้นตำราแพทย์มาเสริม context ให้ผู้ช่วยเจ้าหน้าที่ เฉพาะคำถามที่เข้าโดเมนตำรา
    (โรคภูมิแพ้ตัวเอง/เวชศาสตร์เชิงหน้าที่) เท่านั้น; คืน (context_block, sources).
    คืน ('', []) ถ้าไม่เข้าโดเมน ค้นไม่เจอ หรือ embedder/DB ล่ม — ให้ตอบต่อได้โดย
    ไม่ทำทั้งเทิร์นพัง (book grounding เป็น best-effort ไม่ใช่ hard dependency).

    เช็คโดเมนจากข้อความปัจจุบัน *หรือ* 3 เทิร์นล่าสุด (mirror เส้น LINE) เพื่อให้
    เธรดที่กำลังคุยเรื่องในโดเมนอยู่ ยัง ground ต่อได้เมื่อ follow-up ไม่เอ่ยชื่อโรคซ้ำ
    (เช่น 'แล้วเรื่องอาหารที่ควรเลี่ยงล่ะ')"""
    in_domain = is_book_domain(message) or any(
        is_book_domain(h.get("content", "")) for h in (history or [])[-3:]
    )
    if not in_domain:
        return "", []
    # No separate rate limit here (unlike the public LINE path): this endpoint is
    # authenticated staff-only, the embed + book search hit LOCAL resources (no
    # paid API), and the per-turn LLM call that follows is itself ungated — so a
    # book-search-only cap would add cost without changing the real ceiling.
    try:
        query_vec = embedder.embed_one(message, kind="query")
        hits = vector_store.search_books(query_vec)
    except Exception:  # noqa: BLE001 — embedder/DB down must not break the chat
        return "", []
    if not hits:
        return "", []

    lines = ["=== อ้างอิงตำราแพทย์ (ใช้ประกอบคำตอบเมื่อเกี่ยวข้อง) ==="]
    for i, h in enumerate(hits, 1):
        cite = h.get("title") or h.get("source") or "-"
        page = h.get("page")
        if page:
            cite += f" · หน้า {page}"
        lines.append(f"[{i}] {cite}\n{(h.get('text') or '').strip()}")

    # De-duplicate by (title, page): several retrieved chunks often come from the
    # same book/page, and the footnote should list each source once — not repeat
    # identical lines. score is intentionally dropped: it grounds retrieval, not
    # the citation shown to staff, so persisting it would be dead payload.
    sources: list[dict] = []
    seen: set[tuple[str, object]] = set()
    for h in hits:
        title = h.get("title") or h.get("source") or ""
        page = h.get("page")
        key = (title, page)
        if not title or key in seen:
            continue
        seen.add(key)
        sources.append({"title": title, "page": page})
    return "\n\n".join(lines), sources


_SCHEDULE_WINDOW_DAYS = 7  # past N days + next N days = 2N+1 days centered on today


def _build_schedule_context() -> str:
    """Schedule for [today-7, today+7]: approved bookings + Google Calendar events
    grouped per day so the assistant can answer 'what's on 19/6?' style questions.

    Patient names rendered here are masked by the caller via redact_text's
    known_names (seeded from _all_patient_names), so no real name reaches the LLM."""
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
    """ดึง booking ล่าสุดของคนไข้ (เรียงใหม่->เก่า) จำกัด limit แถว
    ใช้เติม context ให้ AI — query ตรงเพราะต้องการ field เฉพาะชุดนี้"""
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
    """นับจำนวน booking ทั้งหมดของคนไข้ ใช้แสดง 'ล่าสุด N จาก M ครั้ง' ใน context"""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM booking_requests WHERE patient_id = %s",
                (patient_id,),
            )
            return int(cur.fetchone()["n"])
