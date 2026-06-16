"""Primary LINE webhook: routes all messages to n8n, falls back to Dify CRO flow."""
import json

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from flows import cro
from integrations import line_client
from core.config import N8N_INTERNAL_BASE_URL, log

router = APIRouter()


@router.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")

    if not signature or not line_client.verify_signature(body, signature, line_client.PRIMARY):
        raise HTTPException(status_code=400, detail="Invalid X-Line-Signature")

    payload = json.loads(body)

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        if event["message"].get("type") != "text":
            continue

        user_id = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text = event["message"]["text"]

        if not user_id:
            continue

        if await _try_handle_public_with_n8n(event):
            continue
        background_tasks.add_task(cro.handle_public_inquiry, reply_token, user_id, text)

    return JSONResponse({"status": "ok"})


async def _try_handle_public_with_n8n(event: dict) -> bool:
    if not N8N_INTERNAL_BASE_URL:
        return False

    url = f"{N8N_INTERNAL_BASE_URL.rstrip('/')}/webhook/bbh-line-main"
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.post(url, json={"events": [event]})
        resp.raise_for_status()
        result = resp.json()
    except Exception:
        log.exception("n8n public LINE flow failed; falling back to CRO Dify flow")
        return False

    answer = result.get("answer")
    reply_token = event.get("replyToken")
    if answer and reply_token:
        line_client.reply(reply_token, answer)
        log.info("n8n public LINE flow replied via BBH workflow")
        return True

    log.warning("n8n public LINE flow returned no answer; falling back")
    return False


