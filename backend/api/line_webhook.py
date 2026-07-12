"""Primary LINE webhook: routes all messages to n8n, falls back to the CRO flow."""
import asyncio
import json
import time

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from flows import cro
from integrations import line_client
from repositories import message_repo, webhook_queue_repo
from core.config import N8N_INTERNAL_BASE_URL, log

router = APIRouter()

# Human labels for non-text inbound messages (chat-history placeholder).
_NONTEXT_LABEL = {
    "image": "รูปภาพ",
    "audio": "ข้อความเสียง",
    "video": "วิดีโอ",
    "file": "ไฟล์",
    "sticker": "สติกเกอร์",
    "location": "ตำแหน่ง",
}

# Canned guide sent when a patient sends a non-text message. The bot handles
# text only, so we ask them to type instead of leaving them with no reply.
_UNSUPPORTED_REPLY = (
    "ขออภัยค่ะ ระบบรองรับเฉพาะข้อความ "
    "รบกวนพิมพ์เป็นข้อความเข้ามาสอบถามหรือนัดหมายได้เลยนะคะ"
)

# Module-level singleton — reused across all events so we pay the
# TCP/TLS/SSL-context cost once instead of per request.
_n8n_client: httpx.AsyncClient | None = None


def _get_n8n_client() -> httpx.AsyncClient:
    global _n8n_client
    if _n8n_client is None:
        _n8n_client = httpx.AsyncClient(timeout=20)
    return _n8n_client


async def close_n8n_client() -> None:
    """Called from lifespan shutdown to drain in-flight requests."""
    global _n8n_client
    if _n8n_client is not None:
        await _n8n_client.aclose()
        _n8n_client = None


async def _reply_unsupported(reply_token: str) -> None:
    """Reply the 'please type text' guide for a non-text message. line_client
    .reply is sync (httpx) so run it off the event loop; never raises."""
    try:
        await asyncio.to_thread(line_client.reply, reply_token, _UNSUPPORTED_REPLY)
    except Exception:
        log.exception("failed to send unsupported-message guide reply")


@router.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    # LINE webhook must return 200 within ~1-2s or LINE retries the event.
    # All slow work (n8n + AI) is scheduled as a background task.
    t0 = time.perf_counter()
    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")
    t1 = time.perf_counter()

    # HMAC SHA256 on a tiny payload is microseconds — keep sync.
    # asyncio.to_thread here would only add threadpool dispatch overhead.
    if not signature or not line_client.verify_signature(body, signature, line_client.PRIMARY):
        raise HTTPException(status_code=400, detail="Invalid X-Line-Signature")
    t2 = time.perf_counter()

    payload = json.loads(body)
    queued = 0
    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        msg_type = event["message"].get("type")
        user_id = event.get("source", {}).get("userId")
        if msg_type != "text":
            # Don't ghost the patient on non-text (image/audio/sticker/...):
            # record it for chat history and reply a short "please type" guide.
            # Canned reply — no LLM/n8n — scheduled off the webhook hot path.
            if user_id:
                message_repo.log_inbound(
                    channel="line_main",
                    external_user_id=user_id,
                    text=f"[{_NONTEXT_LABEL.get(msg_type, msg_type)}]",
                    raw_payload={"webhookEventId": event.get("webhookEventId"), "type": msg_type},
                )
            reply_token = event.get("replyToken")
            if reply_token:
                background_tasks.add_task(_reply_unsupported, reply_token)
            continue
        if not user_id:
            continue
        # Log inbound to booking_messages for chat-history render. Best-effort;
        # message_repo swallows exceptions so this never blocks LINE ack.
        message_repo.log_inbound(
            channel="line_main",
            external_user_id=user_id,
            text=event.get("message", {}).get("text", ""),
            raw_payload={"webhookEventId": event.get("webhookEventId"), "type": event.get("type")},
        )
        # Persist BEFORE acking LINE so a crash here doesn't drop the
        # message. If DB insert fails (dup or DB down) fall back to in-process
        # only — better one missed retry than complete silence.
        queue_id = webhook_queue_repo.enqueue(
            channel="main",
            webhook_event_id=event.get("webhookEventId"),
            event=event,
        )
        if queue_id is not None:
            background_tasks.add_task(_process_queued_event, queue_id)
        else:
            background_tasks.add_task(_handle_event_async, event)
        queued += 1
    t3 = time.perf_counter()

    # Log per-stage timing so we can see if the bottleneck is body read,
    # signature, or task dispatch. Sub-ms granularity, no async overhead.
    log.info(
        "webhook timing body=%.1fms sig=%.1fms dispatch=%.1fms total=%.1fms queued=%d",
        (t1 - t0) * 1000,
        (t2 - t1) * 1000,
        (t3 - t2) * 1000,
        (t3 - t0) * 1000,
        queued,
    )

    return JSONResponse({"status": "ok"})


async def _handle_event_async(event: dict) -> None:
    """Process one LINE event off the webhook hot path; never raises.

    The CRO fallback is sync (DB + HTTP + LINE reply) — running it
    directly here would block the asyncio event loop and starve other
    webhook requests. asyncio.to_thread moves it off the loop.
    """
    try:
        if await _try_handle_public_with_n8n(event):
            return
        reply_token = event.get("replyToken", "")
        user_id = event.get("source", {}).get("userId", "")
        text = event.get("message", {}).get("text", "")
        if user_id:
            await asyncio.to_thread(cro.handle_public_inquiry, reply_token, user_id, text)
    except Exception:
        log.exception("LINE event handler crashed (id=%s)", event.get("webhookEventId"))


async def _process_queued_event(queue_id: int) -> None:
    """Claim row by id, run handler, mark done/failed. Idempotent — if a
    competing worker has already claimed it, this returns without doing
    anything. Marks row 'failed' (or back to 'pending' if retryable) on
    handler exception so the retry loop can attempt again."""
    row = webhook_queue_repo.claim(queue_id)
    if row is None:
        return
    event = row.get("event_json") or {}
    try:
        await _handle_event_async_inner(event)
        webhook_queue_repo.mark_done(queue_id)
    except Exception as exc:
        log.exception("queued LINE event handler crashed id=%s", queue_id)
        webhook_queue_repo.mark_failed(queue_id, f"{type(exc).__name__}: {exc}")


async def _handle_event_async_inner(event: dict) -> None:
    """Same body as _handle_event_async but re-raises on error so the
    queue wrapper can mark the row for retry."""
    if await _try_handle_public_with_n8n(event):
        return
    reply_token = event.get("replyToken", "")
    user_id = event.get("source", {}).get("userId", "")
    text = event.get("message", {}).get("text", "")
    if user_id:
        await asyncio.to_thread(cro.handle_public_inquiry, reply_token, user_id, text)


async def _try_handle_public_with_n8n(event: dict) -> bool:
    if not N8N_INTERNAL_BASE_URL:
        return False

    url = f"{N8N_INTERNAL_BASE_URL.rstrip('/')}/webhook/bbh-line-main"
    try:
        client = _get_n8n_client()
        resp = await client.post(url, json={"events": [event]})
        resp.raise_for_status()
        result = resp.json()
    except Exception:
        log.exception("n8n public LINE flow failed; falling back to CRO flow")
        return False

    answer = result.get("answer")
    reply_token = event.get("replyToken")
    if answer and reply_token:
        line_client.reply(reply_token, answer)
        log.info("n8n public LINE flow replied via BBH workflow")
        return True

    log.warning("n8n public LINE flow returned no answer; falling back")
    return False
