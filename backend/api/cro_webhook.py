"""CRO LINE webhook: staff login, monitoring, and override commands."""
import json
import re

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from core.config import CRO_CHANNEL_ENABLED, log
from flows import cro
from integrations import line_client

router = APIRouter()


@router.post("/webhook/cro")
async def webhook_cro(request: Request, background_tasks: BackgroundTasks):
    if not CRO_CHANNEL_ENABLED:
        raise HTTPException(status_code=503, detail="CRO channel not configured")

    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")

    if not signature or not line_client.verify_signature(body, signature, line_client.CRO):
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

        if cro.is_cro_team(user_id):
            background_tasks.add_task(cro.handle_team_command, reply_token, user_id, text)
            continue

        code = text.strip().upper()
        if re.match(r"^CRO\d+$", code):
            _handle_cro_registration(reply_token, user_id, code)
            continue

        line_client.reply(
            reply_token,
            "กรุณาส่งรหัสเพื่อเข้าใช้งาน\n"
            "(เช่น CRO001, CRO002, CRO003, CRO004)",
            ch=line_client.CRO,
        )

    return JSONResponse({"status": "ok"})


def _handle_cro_registration(reply_token: str, user_id: str, code: str) -> None:
    status, c = cro.try_register(user_id, code)
    if status == "registered":
        line_client.reply(
            reply_token,
            f"✅ ลงทะเบียนสำเร็จ\n"
            f"ยินดีต้อนรับ พี่{c['name']} ({c['cro_code']})\n\n"
            "คำสั่งที่ใช้ได้:\n"
            "• active / list — ดู conversations\n"
            "• queue         — ที่ AI escalate\n"
            "• view <N>      — ดูประวัติ #N\n"
            "• take <N>      — รับคุยเอง override AI\n"
            "• /end          — จบ take-over\n\n"
            "🔴 ระหว่าง take-over: ทุกข้อความ → ส่งลูกค้า",
            ch=line_client.CRO,
        )
        log.info("CRO registered: %s (%s) → %s", c["name"], c["cro_code"], user_id)
    elif status == "already_me":
        line_client.reply(
            reply_token,
            f"✅ คุณลงทะเบียนแล้ว (พี่{c['name']} / {c['cro_code']})",
            ch=line_client.CRO,
        )
    elif status == "already_taken":
        line_client.reply(reply_token, f"❌ รหัส {code} ถูกใช้งานแล้ว ติดต่อผู้ดูแล", ch=line_client.CRO)
    else:
        line_client.reply(reply_token, f"❌ ไม่พบรหัส {code} (ใช้ CRO001-004)", ch=line_client.CRO)
