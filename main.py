"""
LINE–Dify Hospital Bridge — entry point

ทุก business logic อยู่ใน `flows/` modules:
  - flows.doctor   (LINE #1: DR login + report analysis)
  - flows.patient  (LINE #1: PT login + advisor)
  - flows.cro      (LINE #1 public Q&A + LINE #2 CRO commands + take-over)

main.py ทำหน้าที่:
  - FastAPI app + lifespan
  - Webhook routing — LINE #1 (/webhook), LINE #2 CRO (/webhook/cro)
  - Email poller integration
"""
import asyncio
import json
import re
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse

import email_poller
import line_client
from config import (
    CRO_CHANNEL_ENABLED,
    LINE_CRO_CHANNEL_ID, LINE_CRO_CHANNEL_SECRET,
    NGROK_PUBLIC_URL, SERVER_PORT,
    DB_CONFIG, log,
)
from db import get_db
from flows import cro, doctor, patient


# ─── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE doctors SET line_uid = NULL")
                cur.execute("UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL")
                cur.execute("UPDATE cro_users SET line_uid = NULL")
                cur.execute("UPDATE reports SET status = NULL WHERE status = 'analyzing'")
                conn.commit()
        log.info("Startup reset: sessions cleared (doctor + patient + CRO), stuck reports unlocked")
    except Exception:
        log.exception("Startup reset failed")

    app.state.ngrok_url = NGROK_PUBLIC_URL or f"http://localhost:{SERVER_PORT}"
    log.info("=" * 60)
    log.info("Bridge public URL: %s", app.state.ngrok_url)
    log.info("LINE Webhook URL:  %s/webhook", app.state.ngrok_url)
    if CRO_CHANNEL_ENABLED:
        log.info("CRO Webhook URL:   %s/webhook/cro", app.state.ngrok_url)
    log.info("=" * 60)

    poller_task = asyncio.create_task(
        email_poller.start_poller(DB_CONFIG, doctor.notify_new_report)
    )
    yield
    poller_task.cancel()


app = FastAPI(title="LINE–Dify Hospital Bridge", lifespan=lifespan)


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/")
def health():
    base = getattr(app.state, "ngrok_url", "")
    return {
        "status":      "ok",
        "ngrok_url":   base or "starting…",
        "webhook":     f"{base}/webhook",
        "webhook_cro": f"{base}/webhook/cro" if CRO_CHANNEL_ENABLED else None,
    }


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    """LINE #1 (BBH BOT TEST): DR / PT login + public anonymous Q&A"""
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

        user_id     = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text        = event["message"]["text"]

        if not user_id:
            continue

        if doctor.is_doctor(user_id):
            background_tasks.add_task(doctor.handle_message, reply_token, user_id, text)
            continue
        if patient.is_patient(user_id):
            background_tasks.add_task(patient.handle_message, reply_token, user_id, text)
            continue

        code = text.strip().upper()
        if re.match(r"^DR\d+$", code):
            status, doc = doctor.try_register(user_id, code)
            if status == "registered":
                line_client.reply(
                    reply_token,
                    f"✅ ลงทะเบียนสำเร็จ\n"
                    f"ยินดีต้อนรับ {doc['name']}\n\n"
                    f"รอรับแจ้งเตือน Report ใหม่จากระบบ\n"
                    f"หรือพิมพ์ Report ID เพื่อวิเคราะห์ได้ทันที",
                )
                log.info("Doctor registered: %s → %s", doc["name"], user_id)
            elif status == "already_me":
                line_client.reply(reply_token, f"✅ คุณลงทะเบียนแล้ว ({doc['name']})")
            elif status == "already_taken":
                line_client.reply(reply_token, "❌ รหัสแพทย์นี้ถูกใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่")
            else:
                line_client.reply(reply_token, f"❌ ไม่พบรหัสแพทย์ {code}")
        elif re.match(r"^PT\d+$", code):
            status, pat = patient.try_register(user_id, code)
            if status == "registered":
                line_client.reply(
                    reply_token,
                    f"✅ ลงทะเบียนสำเร็จ\n"
                    f"ยินดีต้อนรับ คุณ{pat['name']}\n\n"
                    f"คุณสามารถสอบถามอาการ หรือข้อมูลสุขภาพได้\n"
                    f"⚠️ ระบบนี้ให้ข้อมูลทั่วไป ไม่ใช่การวินิจฉัย — กรุณาปรึกษาแพทย์เสมอ\n"
                    f"พิมพ์ \"logout\" เพื่อออกจากระบบ",
                )
                log.info("Patient registered: %s → %s", pat["name"], user_id)
            elif status == "already_me":
                line_client.reply(reply_token, f"✅ คุณลงทะเบียนแล้ว (คุณ{pat['name']})")
            elif status == "already_taken":
                line_client.reply(reply_token, "❌ รหัสคนไข้นี้ถูกใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่")
            else:
                line_client.reply(reply_token, f"❌ ไม่พบรหัสคนไข้ {code}")
        else:
            background_tasks.add_task(cro.handle_public_inquiry, reply_token, user_id, text)

    return JSONResponse({"status": "ok"})


@app.post("/webhook/cro")
async def webhook_cro(request: Request, background_tasks: BackgroundTasks):
    """LINE #2 (CRO): login CRO001-004 + monitoring/override commands"""
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

        user_id     = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text        = event["message"]["text"]

        if not user_id:
            continue

        if cro.is_cro_team(user_id):
            background_tasks.add_task(cro.handle_team_command, reply_token, user_id, text)
            continue

        code = text.strip().upper()
        if re.match(r"^CRO\d+$", code):
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
                line_client.reply(reply_token, f"✅ คุณลงทะเบียนแล้ว (พี่{c['name']} / {c['cro_code']})", ch=line_client.CRO)
            elif status == "already_taken":
                line_client.reply(reply_token, f"❌ รหัส {code} ถูกใช้งานแล้ว ติดต่อผู้ดูแล", ch=line_client.CRO)
            else:
                line_client.reply(reply_token, f"❌ ไม่พบรหัส {code} (ใช้ CRO001-004)", ch=line_client.CRO)
            continue

        line_client.reply(
            reply_token,
            "กรุณาส่งรหัสเพื่อเข้าใช้งาน\n"
            "(เช่น CRO001, CRO002, CRO003, CRO004)",
            ch=line_client.CRO,
        )

    return JSONResponse({"status": "ok"})


# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)
