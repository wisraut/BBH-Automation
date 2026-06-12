"""Primary LINE webhook: doctor, patient, and public CRO inquiry routing."""
import json
import re

import httpx
from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from fastapi.responses import JSONResponse

from flows import cro, doctor, patient
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

        if doctor.is_doctor(user_id):
            background_tasks.add_task(doctor.handle_message, reply_token, user_id, text)
            continue
        if patient.is_patient(user_id):
            background_tasks.add_task(patient.handle_message, reply_token, user_id, text)
            continue

        code = text.strip().upper()
        if re.match(r"^DR\d+$", code):
            _handle_doctor_registration(reply_token, user_id, code)
        elif re.match(r"^PT\d+$", code):
            _handle_patient_registration(reply_token, user_id, code)
        else:
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


def _handle_doctor_registration(reply_token: str, user_id: str, code: str) -> None:
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


def _handle_patient_registration(reply_token: str, user_id: str, code: str) -> None:
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
