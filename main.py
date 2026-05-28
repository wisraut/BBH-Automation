import hashlib
import hmac
import base64
import json
import time
import asyncio
import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
import uvicorn
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pyngrok import ngrok, conf
from dotenv import load_dotenv

load_dotenv()

# ─── Config ────────────────────────────────────────────────────────────────────
# อ่านจาก .env ทั้งหมด ไม่มี secret ใน code
LINE_CHANNEL_ID     = os.getenv("LINE_CHANNEL_ID")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
DIFY_API_URL        = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_API_KEY        = os.getenv("DIFY_API_KEY")
OLLAMA_API_URL      = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
OLLAMA_MODEL        = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
SERVER_PORT         = int(os.getenv("SERVER_PORT", 8000))

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}

# รูปแบบ Report ID เช่น RPT-20260528-0001
RPT_PATTERN = re.compile(r"^RPT-\d{8}-\d{4}$", re.IGNORECASE)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

# cache LINE access token
_line_token: str = ""
_line_token_expiry: float = 0.0


# ─── LINE helpers ──────────────────────────────────────────────────────────────

def _get_line_token() -> str:
    """ขอ LINE Channel Access Token และ cache ไว้จนหมดอายุ"""
    global _line_token, _line_token_expiry
    if _line_token and time.time() < _line_token_expiry:
        return _line_token
    resp = httpx.post(
        "https://api.line.me/v2/oauth/accessToken",
        data={
            "grant_type":    "client_credentials",
            "client_id":     LINE_CHANNEL_ID,
            "client_secret": LINE_CHANNEL_SECRET,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    _line_token = data["access_token"]
    _line_token_expiry = time.time() + data.get("expires_in", 2_592_000) - 120
    return _line_token


def _verify_signature(body: bytes, signature: str) -> bool:
    """ตรวจสอบว่า webhook request มาจาก LINE จริงๆ ด้วย HMAC-SHA256"""
    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _line_reply(reply_token: str, text: str) -> None:
    """ตอบกลับ user ด้วย reply token (ใช้ได้แค่ครั้งเดียว หมดอายุใน 60 วิ)"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"replyToken": reply_token, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE reply failed %s: %s", resp.status_code, resp.text)


def _line_push(user_id: str, text: str) -> None:
    """ส่งข้อความหา user โดยตรงโดยไม่ใช้ reply token"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={"to": user_id, "messages": [{"type": "text", "text": text}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE push failed %s: %s", resp.status_code, resp.text)


# ─── Validation ────────────────────────────────────────────────────────────────

def _build_validation_prompt(user_message: str) -> str:
    """สร้าง few-shot prompt ให้ Ollama เช็คว่าข้อมูลผู้ป่วยครบ 4 ข้อหรือไม่"""
    return (
        "You are a medical intake validator. Check if the patient message contains ALL 4 required fields.\n"
        "Read carefully and check each field:\n"
        "Field 1: Age and gender — SATISFIED by any age number + gender word anywhere in the message.\n"
        "  Examples that SATISFY: 'ชาย 45 ปี', 'หญิง 28 ปี', 'อายุ 30 ปีเพศหญิง', 'ผู้ป่วยชาย 50 ปี'\n"
        "Field 2: Main symptoms — SATISFIED by any illness, pain, rash, or complaint described.\n"
        "Field 3: Duration — SATISFIED by any time period (วัน/สัปดาห์/เดือน/ปี or phrases like 'เป็นมา 3 วัน').\n"
        "Field 4: Drug allergies or underlying diseases — SATISFIED by listing allergies, listing diseases,\n"
        "  OR explicitly stating none. These ALL satisfy Field 4:\n"
        "  'ไม่มียาแพ้', 'ไม่แพ้ยา', 'ไม่มีโรคประจำตัว', 'ไม่มี', 'แพ้ยา X', 'มีโรค X'\n\n"
        "Output ONLY valid JSON with keys 'complete' (bool) and 'missing' (list). No other text.\n\n"
        "Patient: ผื่นแดงที่หน้า ปวดข้อ เป็นมา 3 เดือน\n"
        '{"complete": false, "missing": ["อายุและเพศ", "ยาที่แพ้หรือโรคประจำตัว"]}\n\n'
        "Patient: ผู้ป่วยหญิง อายุ 28 ปี ผื่นแดงรูปผีเสื้อที่หน้า ปวดข้อมือ เป็นมา 3 เดือน ไม่มียาแพ้ ไม่มีโรคประจำตัว\n"
        '{"complete": true, "missing": []}\n\n'
        "Patient: ชาย 45 ปี เจ็บหน้าอก หายใจไม่ออก แพ้ยา penicillin\n"
        '{"complete": false, "missing": ["ระยะเวลาที่มีอาการ"]}\n\n'
        "Patient: หญิง 35 ปี ไข้สูง ปวดศีรษะ เป็นมา 2 วัน ไม่มียาแพ้\n"
        '{"complete": true, "missing": []}\n\n'
        f"Patient: {user_message}\n"
    )


def _validate_message(user_message: str) -> tuple[bool, list[str]]:
    """
    เรียก Ollama โดยตรงเพื่อความเร็ว
    คืนค่า (ข้อมูลครบไหม, รายการที่ขาด)
    ถ้า error → fail open ไม่บล็อก user
    """
    prompt = _build_validation_prompt(user_message)
    raw = ""
    try:
        resp = httpx.post(
            f"{OLLAMA_API_URL}/api/chat",
            json={
                "model":    OLLAMA_MODEL,
                "stream":   False,
                "messages": [{"role": "user", "content": prompt}],
                "options":  {"temperature": 0},
            },
            timeout=60,
        )
        resp.raise_for_status()
        raw = resp.json()["message"]["content"].strip()

        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]

        start = raw.find("{")
        end   = raw.rfind("}") + 1
        data  = json.loads(raw[start:end])
        return bool(data.get("complete")), data.get("missing", [])

    except json.JSONDecodeError:
        log.warning("Validation JSON parse failed, raw: %.200s", raw)
        return True, []
    except Exception as exc:
        log.exception("Validation call failed: %s", exc)
        return True, []


# ─── DB helpers ────────────────────────────────────────────────────────────────

def _get_db():
    """เปิด connection ไป PostgreSQL hospital_db"""
    return psycopg2.connect(**DB_CONFIG)


def _generate_report_id() -> str:
    """สร้าง Report ID รูปแบบ RPT-YYYYMMDD-XXXX โดยนับจำนวนใน DB วันนั้น"""
    date_str = datetime.now().strftime("%Y%m%d")
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM reports WHERE report_id LIKE %s",
                (f"RPT-{date_str}-%",)
            )
            count = cur.fetchone()[0]
    return f"RPT-{date_str}-{count + 1:04d}"


def _ensure_patient(patient_id: str) -> str | None:
    """
    สร้าง patient record ถ้ายังไม่มี
    auto-assign ให้แพทย์คนแรกใน DB
    คืนค่า doctor_id ที่ assigned
    """
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id FROM patients WHERE patient_id = %s", (patient_id,))
            row = cur.fetchone()
            if row:
                return row[0]
            cur.execute("SELECT doctor_id FROM doctors LIMIT 1")
            doctor = cur.fetchone()
            doctor_id = doctor[0] if doctor else None
            cur.execute(
                "INSERT INTO patients (patient_id, doctor_id) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (patient_id, doctor_id),
            )
            conn.commit()
            return doctor_id


def _save_report(patient_id: str, conversation_id: str) -> str:
    """บันทึก report ลง DB และ log audit พร้อมคืน report_id"""
    report_id = _generate_report_id()
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO reports (report_id, patient_id, conversation_id, status) VALUES (%s, %s, %s, 'pending')",
                (report_id, patient_id, conversation_id),
            )
            cur.execute(
                "INSERT INTO audit_logs (actor_id, actor_type, action, report_id) VALUES (%s, 'patient', 'report_submitted', %s)",
                (patient_id, report_id),
            )
            conn.commit()
    log.info("Saved report %s for patient %s", report_id, patient_id)
    return report_id


def _get_report(report_id: str) -> dict | None:
    """ดึงข้อมูล report พร้อม doctor_id ของคนไข้"""
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT r.*, p.doctor_id
                   FROM reports r
                   JOIN patients p ON r.patient_id = p.patient_id
                   WHERE r.report_id = %s""",
                (report_id,),
            )
            return cur.fetchone()


def _save_analysis(report_id: str, doctor_id: str, doctor_summary: str, patient_note: str):
    """บันทึกผลวิเคราะห์ อัพเดต status เป็น analyzed และ log audit"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO analyses (report_id, doctor_summary, patient_note) VALUES (%s, %s, %s)",
                (report_id, doctor_summary, patient_note),
            )
            cur.execute(
                "UPDATE reports SET status = 'analyzed' WHERE report_id = %s",
                (report_id,),
            )
            cur.execute(
                "INSERT INTO audit_logs (actor_id, actor_type, action, report_id) VALUES (%s, 'doctor', 'analysis_triggered', %s)",
                (doctor_id, report_id),
            )
            conn.commit()


def _is_doctor(user_id: str) -> bool:
    """เช็คว่า LINE user_id นี้เป็นแพทย์ที่ลงทะเบียนไว้ใน DB หรือไม่"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM doctors WHERE doctor_id = %s", (user_id,))
            return cur.fetchone() is not None


# ─── Dify helper ───────────────────────────────────────────────────────────────

def _ask_dify(user_id: str, message: str, conv_id: str = "") -> tuple[str, str]:
    """
    ส่งข้อความไป Dify
    คืนค่า (answer, conversation_id)
    conv_id="" = เริ่ม conversation ใหม่
    """
    try:
        resp = httpx.post(
            f"{DIFY_API_URL}/chat-messages",
            headers={
                "Authorization": f"Bearer {DIFY_API_KEY}",
                "Content-Type":  "application/json",
            },
            json={
                "inputs":          {},
                "query":           message,
                "response_mode":   "blocking",
                "conversation_id": conv_id,
                "user":            user_id,
            },
            timeout=300,
        )
        resp.raise_for_status()
        data = resp.json()
        return data.get("answer", "ขออภัย ไม่สามารถตอบได้ในขณะนี้"), data.get("conversation_id", conv_id)
    except Exception as exc:
        log.exception("Dify request failed: %s", exc)
        return "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ กรุณาลองใหม่อีกครั้ง", conv_id


# ─── Patient flow ──────────────────────────────────────────────────────────────

def _handle_message(reply_token: str, user_id: str, text: str) -> None:
    """
    Flow คนไข้:
    1. validate ข้อมูล 4 ข้อ
    2. ถ้าไม่ครบ → แจ้งกลับ
    3. ถ้าครบ → ส่ง Dify (เก็บ conversation_id) → บันทึก DB → แจ้งแพทย์
    """
    log.info("Patient %s: %s", user_id, text[:80])

    is_complete, missing = _validate_message(text)
    log.info("Validation → complete=%s missing=%s", is_complete, missing)

    if not is_complete:
        items = "\n".join(f"  • {m}" for m in missing)
        reply = (
            "⚠️ ข้อมูลยังไม่ครบถ้วน กรุณาเพิ่มข้อมูลต่อไปนี้:\n\n"
            f"{items}\n\n"
            "📋 ข้อมูลที่ต้องการครบทั้ง 4 ข้อ:\n"
            "  1. อายุและเพศ\n"
            "  2. อาการหลัก\n"
            "  3. ระยะเวลาที่มีอาการ\n"
            "  4. ยาที่แพ้หรือโรคประจำตัว"
        )
        _line_reply(reply_token, reply)
        return

    # ตอบรับทันทีก่อน reply token หมดอายุ
    _line_reply(reply_token, "✅ ได้รับ Report แล้ว แพทย์จะวิเคราะห์เร็วๆ นี้")

    # ส่งไป Dify เพื่อเริ่ม conversation และเก็บ conversation_id
    _, conv_id = _ask_dify(user_id, text)

    # บันทึกลง DB
    doctor_id = _ensure_patient(user_id)
    report_id = _save_report(user_id, conv_id)

    # แจ้งแพทย์ประจำตัว
    if doctor_id:
        _line_push(
            doctor_id,
            f"📋 Report ใหม่ #{report_id}\n"
            f"เวลา: {datetime.now().strftime('%H:%M')}\n\n"
            f"พิมพ์รหัส Report เพื่อวิเคราะห์:\n{report_id}",
        )
        log.info("Notified doctor %s for report %s", doctor_id, report_id)
    else:
        log.warning("No doctor assigned for patient %s", user_id)


# ─── Doctor flow ───────────────────────────────────────────────────────────────

def _handle_doctor_message(reply_token: str, doctor_id: str, text: str) -> None:
    """
    Flow แพทย์:
    แพทย์พิมพ์ Report ID → ดึงจาก DB → ส่ง Dify วิเคราะห์ → บันทึก → ส่งผลกลับ
    """
    report_id = text.strip().upper()
    log.info("Doctor %s trigger: %s", doctor_id, report_id)

    if not RPT_PATTERN.match(report_id):
        _line_reply(reply_token, "พิมพ์รหัส Report เช่น RPT-20260528-0001 เพื่อวิเคราะห์")
        return

    report = _get_report(report_id)

    if not report:
        _line_reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        return

    if report["status"] == "analyzed":
        _line_reply(reply_token, f"⚠️ Report #{report_id} วิเคราะห์แล้ว")
        return

    _line_reply(reply_token, f"🔍 กำลังวิเคราะห์ #{report_id} กรุณารอสักครู่…")

    # ต่อ conversation เดิมของคนไข้ใน Dify แล้วขอ summary 2 แบบ
    conv_id = report["conversation_id"]

    doctor_summary, _ = _ask_dify(
        doctor_id,
        "สรุปอาการของผู้ป่วยสำหรับแพทย์ พร้อม Keywords สำคัญท้าย",
        conv_id=conv_id,
    )
    patient_note, _ = _ask_dify(
        doctor_id,
        "อธิบายอาการให้ผู้ป่วยเข้าใจง่าย ไม่ใช้ศัพท์แพทย์",
        conv_id=conv_id,
    )

    _save_analysis(report_id, doctor_id, doctor_summary, patient_note)

    _line_push(
        doctor_id,
        f"📊 ผลวิเคราะห์ #{report_id}\n\n{doctor_summary}",
    )
    log.info("Analysis done for %s by doctor %s", report_id, doctor_id)


# ─── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """เปิด ngrok tunnel ตอน startup และปิดตอน shutdown"""
    tunnel = ngrok.connect(SERVER_PORT, domain="ineffectual-marian-nonnattily.ngrok-free.dev")
    public_url = tunnel.public_url
    app.state.ngrok_url = public_url
    log.info("=" * 60)
    log.info("ngrok tunnel:     %s", public_url)
    log.info("LINE Webhook URL: %s/webhook", public_url)
    log.info("=" * 60)
    yield
    ngrok.disconnect(public_url)


app = FastAPI(title="LINE–Dify Hospital Bridge", lifespan=lifespan)


@app.get("/")
def health():
    """Health check — ดู ngrok URL ได้จากที่นี่"""
    return {
        "status": "ok",
        "ngrok_url": getattr(app.state, "ngrok_url", "starting…"),
        "webhook": f"{getattr(app.state, 'ngrok_url', '')}/webhook",
    }


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    """
    รับ webhook จาก LINE
    route แยกตามว่าผู้ส่งเป็นแพทย์หรือคนไข้
    ตอบ 200 ทันทีก่อน LINE timeout
    """
    body = await request.body()
    signature = request.headers.get("X-Line-Signature", "")

    if not signature or not _verify_signature(body, signature):
        raise HTTPException(status_code=400, detail="Invalid X-Line-Signature")

    payload = json.loads(body)

    for event in payload.get("events", []):
        if event.get("type") != "message":
            continue
        if event["message"].get("type") != "text":
            continue

        reply_token  = event["replyToken"]
        user_id      = event["source"]["userId"]
        user_message = event["message"]["text"]

        # route ตามรูปแบบข้อความ — RPT-... = doctor flow, อื่น = patient flow
        if RPT_PATTERN.match(user_message.strip().upper()):
            background_tasks.add_task(_handle_doctor_message, reply_token, user_id, user_message)
        else:
            background_tasks.add_task(_handle_message, reply_token, user_id, user_message)

    return JSONResponse({"status": "ok"})


# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)
