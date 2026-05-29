import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import re
import time
from contextlib import asynccontextmanager, contextmanager
from datetime import datetime

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor
import uvicorn
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pyngrok import ngrok
from dotenv import load_dotenv

import email_poller

load_dotenv()

_REQUIRED_VARS = ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ID", "DIFY_API_KEY", "DB_PASSWORD"]
_missing = [v for v in _REQUIRED_VARS if not os.getenv(v)]
if _missing:
    raise RuntimeError(f"Missing required env vars: {', '.join(_missing)}")

# ─── Config ────────────────────────────────────────────────────────────────────
LINE_CHANNEL_ID     = os.getenv("LINE_CHANNEL_ID")
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET")
DIFY_API_URL        = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_API_KEY        = os.getenv("DIFY_API_KEY")
SERVER_PORT         = int(os.getenv("SERVER_PORT", 8000))

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}

# RPT-YYYYMMDD-XXXX ที่อยู่ในข้อความ (ไม่จำเป็นต้องขึ้นต้น)
RPT_PATTERN = re.compile(r"RPT-\d{8}-\d{4}", re.IGNORECASE)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

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
    """ตรวจสอบว่า webhook มาจาก LINE จริงด้วย HMAC-SHA256"""
    digest = hmac.new(
        LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256
    ).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _line_reply(reply_token: str, text: str) -> None:
    """ตอบกลับด้วย reply token (ใช้ได้ครั้งเดียว หมดอายุใน 60 วิ)"""
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
    """ส่งข้อความหา user โดยตรง"""
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


def _line_push_with_quick_reply(user_id: str, text: str, report_id: str) -> None:
    """ส่ง notification พร้อม Quick Reply button [🔍 วิเคราะห์] ให้แพทย์กดได้เลย"""
    if len(text) > 5000:
        text = text[:4997] + "…"
    token = _get_line_token()
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json={
            "to": user_id,
            "messages": [{
                "type": "text",
                "text": text,
                "quickReply": {
                    "items": [{
                        "type": "action",
                        "action": {
                            "type":  "message",
                            "label": "🔍 วิเคราะห์",
                            "text":  f"วิเคราะห์ {report_id}",
                        },
                    }],
                },
            }],
        },
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE push (quick reply) failed %s: %s", resp.status_code, resp.text)


# ─── DB helpers ────────────────────────────────────────────────────────────────

@contextmanager
def _get_db():
    conn = psycopg2.connect(**DB_CONFIG)
    try:
        yield conn
    finally:
        conn.close()


def _is_doctor(user_id: str) -> bool:
    """เช็คว่า LINE user_id นี้เป็นแพทย์ที่ผูก LINE แล้วหรือไม่"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1 FROM doctors WHERE line_uid = %s", (user_id,))
            return cur.fetchone() is not None


def _try_register_doctor(line_uid: str, hospital_id: str) -> str:
    """
    ผูก LINE UID กับรหัสแพทย์โรงพยาบาล
    คืน: 'registered' | 'already_me' | 'already_taken' | 'not_found'
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT doctor_id, name, line_uid FROM doctors WHERE hospital_id = %s",
                (hospital_id.upper(),),
            )
            doc = cur.fetchone()

        if not doc:
            return "not_found", None

        if doc["line_uid"] == line_uid:
            return "already_me", doc

        if doc["line_uid"] is not None:
            return "already_taken", None

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE doctors SET line_uid = %s WHERE hospital_id = %s AND line_uid IS NULL",
                (line_uid, hospital_id.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return "already_taken", None
        return "registered", doc


def _build_patient_context(report_id: str) -> tuple[dict | None, str]:
    """
    JOIN ข้อมูลผู้ป่วยครบชุดจาก DB แล้วสร้าง context string สำหรับส่งไป Dify
    คืน (report_row, context_string) — report_row=None ถ้าไม่พบ
    """
    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT r.report_id, r.report_text, r.chief_complaint,
                          r.report_source, r.report_date, r.status,
                          p.patient_id, p.name, p.dob, p.sex, p.blood_type
                   FROM reports r
                   JOIN patients p ON r.patient_id = p.patient_id
                   WHERE r.report_id = %s""",
                (report_id,),
            )
            row = cur.fetchone()
            if not row:
                return None, ""

            patient_id = row["patient_id"]

            cur.execute(
                """SELECT condition_name, status, diagnosed_year, diagnosed_at, notes
                   FROM medical_conditions WHERE patient_id = %s ORDER BY status""",
                (patient_id,),
            )
            conditions = cur.fetchall()

            cur.execute(
                "SELECT allergen, reaction, severity FROM allergies WHERE patient_id = %s",
                (patient_id,),
            )
            allergies = cur.fetchall()

            cur.execute(
                """SELECT drug_name, dose, frequency, indication
                   FROM current_medications WHERE patient_id = %s AND is_active = true""",
                (patient_id,),
            )
            meds = cur.fetchall()

    # คำนวณอายุ
    age_str = "-"
    if row["dob"]:
        age_str = f"{(datetime.now().date() - row['dob']).days // 365} ปี"

    lines = [
        f"=== ข้อมูลผู้ป่วย | {row['report_id']} ===",
        f"ชื่อ: {row['name']}  |  เพศ: {row['sex']}  |  อายุ: {age_str}  |  กรุ๊ปเลือด: {row['blood_type'] or '-'}",
        "",
    ]

    if allergies:
        lines.append("⚠️ ยาแพ้ / สิ่งที่แพ้ (ห้ามสั่งยาเหล่านี้):")
        for a in allergies:
            lines.append(f"  - {a['allergen']} → {a['reaction']} ({a['severity']})")
    else:
        lines.append("⚠️ ยาแพ้: ไม่มีประวัติแพ้ยา")

    lines.append("")
    if conditions:
        lines.append("โรคประจำตัว:")
        for c in conditions:
            note = f" — {c['notes']}" if c["notes"] else ""
            year = c["diagnosed_year"] or "-"
            lines.append(f"  - {c['condition_name']} ({c['status']}, {year}){note}")

    lines.append("")
    if meds:
        lines.append("ยาที่ใช้อยู่ปัจจุบัน:")
        for m in meds:
            lines.append(f"  - {m['drug_name']} {m['dose']} {m['frequency']}  [{m['indication']}]")

    lines += [
        "",
        f"=== ผลการตรวจ ({'เรื่อง: ' + row['chief_complaint'] if row['chief_complaint'] else 'ไม่ระบุ'}) ===",
        f"แหล่งตรวจ: {row['report_source'] or 'ไม่ระบุ'}",
        "",
        row["report_text"] or "ไม่มีข้อมูล",
    ]

    return dict(row), "\n".join(lines)


def _save_analysis(report_id: str, doctor_id: str, conv_id: str, summary_text: str) -> None:
    """บันทึกผลวิเคราะห์ คืน lock analyzing → NULL และ log audit"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO analyses (report_id, dify_conversation_id, summary_text)
                   VALUES (%s, %s, %s)""",
                (report_id, conv_id, summary_text),
            )
            cur.execute(
                "UPDATE reports SET status = NULL WHERE report_id = %s",
                (report_id,),
            )
            cur.execute(
                """INSERT INTO audit_logs (actor_id, actor_type, action, report_id)
                   VALUES (%s, 'doctor', 'analysis_triggered', %s)""",
                (doctor_id, report_id),
            )
            conn.commit()


# ─── Dify helper ───────────────────────────────────────────────────────────────

def _ask_dify(user_id: str, message: str, conv_id: str = "") -> tuple[str, str]:
    """ส่ง context ไป Dify → คืน (answer, conversation_id)"""
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
    except Exception:
        log.exception("Dify request failed")
        return "ขออภัย เกิดข้อผิดพลาดในการเชื่อมต่อกับระบบ กรุณาลองใหม่", conv_id


# ─── Doctor flow ───────────────────────────────────────────────────────────────

def _notify_new_report(doctor_id: str, patient_name: str, report_id: str) -> None:
    """
    Email poller เรียก callback นี้เมื่อบันทึก report เสร็จ
    ค้นหา line_uid จาก doctor_id → ส่ง LINE notification พร้อม Quick Reply
    """
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT line_uid, name FROM doctors WHERE doctor_id = %s", (doctor_id,))
            row = cur.fetchone()

    if not row or not row[0]:
        log.warning("แพทย์ %s ยังไม่ได้ผูก LINE — ไม่สามารถแจ้งเตือนได้", doctor_id)
        return

    line_uid, doctor_name = row
    text = (
        f"📋 มี Report ใหม่\n"
        f"ผู้ป่วย: {patient_name}\n"
        f"Report: {report_id}\n"
        f"เวลา: {datetime.now().strftime('%d/%m/%Y %H:%M')}\n\n"
        f"กด [🔍 วิเคราะห์] เพื่อเริ่มวิเคราะห์ทันที"
    )
    _line_push_with_quick_reply(line_uid, text, report_id)
    log.info("แจ้งแพทย์ %s (%s) สำหรับ %s", doctor_name, line_uid[:12], report_id)


def _get_doctor_id_from_line_uid(line_uid: str) -> str:
    """คืน doctor_id (PK โรงพยาบาล) จาก LINE UID — fallback คืน line_uid"""
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id FROM doctors WHERE line_uid = %s", (line_uid,))
            row = cur.fetchone()
    return row[0] if row else line_uid


def _analyze_report(reply_token: str, doctor_line_uid: str, report_id: str) -> None:
    """
    Pipeline วิเคราะห์: build context → Dify → save → push ผลกลับ
    status='analyzing' ใช้เป็น atomic lock ป้องกัน concurrent call (TOCTOU-safe)
    วิเคราะห์ซ้ำได้เสมอ — ทุกครั้งสร้าง row ใหม่ใน analyses
    """
    # Atomic lock — ถ้า rowcount == 0 แสดงว่ามีคนล็อคไปก่อนหรือ report ไม่มีอยู่
    with _get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE reports SET status = 'analyzing' WHERE report_id = %s AND status IS NULL",
                (report_id,),
            )
            locked = cur.rowcount == 1
            conn.commit()

    if not locked:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT status FROM reports WHERE report_id = %s", (report_id,))
                row = cur.fetchone()
        if not row:
            _line_reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        else:
            _line_reply(reply_token, f"⏳ Report #{report_id} กำลังวิเคราะห์อยู่แล้ว\nกรุณารอสักครู่")
        return

    report_row, context = _build_patient_context(report_id)
    if not report_row:
        _line_reply(reply_token, f"❌ ไม่พบ Report #{report_id}")
        return

    try:
        _line_reply(reply_token, f"🔍 กำลังวิเคราะห์ #{report_id}…\nกรุณารอสักครู่")
    except Exception:
        log.warning("LINE reply failed for %s — วิเคราะห์ต่อ", report_id)

    summary, conv_id = _ask_dify(doctor_line_uid, context)

    doctor_id = _get_doctor_id_from_line_uid(doctor_line_uid)
    try:
        _save_analysis(report_id, doctor_id, conv_id, summary)
    except Exception:
        log.exception("_save_analysis failed — resetting lock for %s", report_id)
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE reports SET status = NULL WHERE report_id = %s", (report_id,))
                conn.commit()
        return

    try:
        _line_push(doctor_line_uid, f"📊 ผลวิเคราะห์ #{report_id}\n\n{summary}")
    except Exception:
        log.error("LINE push failed for %s", report_id)
    log.info("Analysis done — %s by %s", report_id, doctor_id)


def _handle_doctor_message(reply_token: str, doctor_line_uid: str, text: str) -> None:
    """
    Router แพทย์:
    - logout → ยกเลิกการผูก LINE (ออกจากระบบ)
    - มี RPT-XXXXXXXX-XXXX → วิเคราะห์ report นั้นโดยตรง
    - ข้อความอื่น → ค้นหาคนไข้ด้วยชื่อ → latest pending report
    """
    # ─── Logout ───────────────────────────────────────────────────────────────
    if text.strip().lower() == "logout":
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE doctors SET line_uid = NULL WHERE line_uid = %s RETURNING name",
                    (doctor_line_uid,),
                )
                row = cur.fetchone()
                conn.commit()
        name = row[0] if row else "แพทย์"
        _line_reply(reply_token, f"👋 ออกจากระบบแล้ว ({name})\nส่งรหัสแพทย์เพื่อเข้าใช้งานอีกครั้ง")
        log.info("Doctor logged out: %s (%s)", name, doctor_line_uid[:12])
        return

    # ─── RPT pattern ──────────────────────────────────────────────────────────
    match = RPT_PATTERN.search(text.upper())
    if match:
        report_id = match.group(0).upper()
        log.info("Doctor trigger (report_id): %s", report_id)
        _analyze_report(reply_token, doctor_line_uid, report_id)
        return

    # ─── ค้นหาด้วยชื่อคนไข้ ───────────────────────────────────────────────────
    name_query = text.strip()
    if not name_query:
        _line_reply(
            reply_token,
            "รอรับแจ้งเตือน Report ใหม่จากระบบ\n"
            "หรือพิมพ์ชื่อคนไข้ / Report ID เพื่อวิเคราะห์",
        )
        return

    log.info("Doctor searching patient name: %r", name_query)

    with _get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT p.patient_id, p.name,
                          (SELECT report_id FROM reports
                           WHERE patient_id = p.patient_id
                           ORDER BY submitted_at DESC LIMIT 1) AS latest_report_id,
                          (SELECT status FROM reports
                           WHERE patient_id = p.patient_id
                           ORDER BY submitted_at DESC LIMIT 1) AS latest_status
                   FROM patients p
                   WHERE p.name ILIKE %s
                   ORDER BY p.name""",
                (f"%{name_query}%",),
            )
            patients = cur.fetchall()

    if not patients:
        _line_reply(
            reply_token,
            f"❌ ไม่พบคนไข้ชื่อ \"{name_query}\"\n"
            "ลองพิมพ์ชื่อสั้นลง หรือระบุ Report ID",
        )
        return

    if len(patients) == 1:
        p = patients[0]
        if not p["latest_report_id"]:
            _line_reply(reply_token, f"ℹ️ {p['name']} ยังไม่มี Report ในระบบ")
            return
        if p["latest_status"] == "analyzing":
            _line_reply(reply_token, f"⏳ {p['name']} — กำลังวิเคราะห์อยู่แล้ว กรุณารอสักครู่")
            return
        log.info("Doctor trigger (patient name %r): %s", p["name"], p["latest_report_id"])
        _analyze_report(reply_token, doctor_line_uid, p["latest_report_id"])
        return

    # หลายคนที่ชื่อคล้ายกัน — แสดงรายชื่อ
    lines = [f"🔍 พบคนไข้ {len(patients)} คนที่ชื่อคล้ายกัน:\n"]
    for p in patients:
        if p["latest_status"] == "analyzing":
            tag = "⏳ กำลังวิเคราะห์"
        elif p["latest_report_id"]:
            tag = "มี Report"
        else:
            tag = "ยังไม่มี Report"
        lines.append(f"• {p['name']} ({p['patient_id']}) — {tag}")
    lines.append("\nพิมพ์ชื่อให้ครบขึ้น หรือระบุ Report ID (RPT-XXXXXXXX-XXXX)")
    _line_reply(reply_token, "\n".join(lines))


# ─── FastAPI app ───────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """เปิด ngrok + email poller ตอน startup"""
    # reset session state — clear doctor logins + stuck analyzing locks
    try:
        with _get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE doctors SET line_uid = NULL")
                cur.execute("UPDATE reports SET status = NULL WHERE status = 'analyzing'")
                conn.commit()
        log.info("Startup reset: doctor sessions cleared, stuck reports unlocked")
    except Exception:
        log.exception("Startup reset failed")

    public_url = None
    try:
        tunnel = ngrok.connect(SERVER_PORT, domain="ineffectual-marian-nonnattily.ngrok-free.dev")
        public_url = tunnel.public_url
        app.state.ngrok_url = public_url
        log.info("=" * 60)
        log.info("ngrok tunnel:     %s", public_url)
        log.info("LINE Webhook URL: %s/webhook", public_url)
        log.info("=" * 60)
    except Exception as e:
        log.warning("ngrok ไม่พร้อม (%s) — server รันต่อโดยไม่มี tunnel", e)
        app.state.ngrok_url = f"http://localhost:{SERVER_PORT}"

    # เริ่ม email poller เป็น background task
    poller_task = asyncio.create_task(
        email_poller.start_poller(DB_CONFIG, _notify_new_report)
    )

    yield

    poller_task.cancel()
    if public_url:
        ngrok.disconnect(public_url)


app = FastAPI(title="LINE–Dify Hospital Bridge", lifespan=lifespan)


@app.get("/")
def health():
    return {
        "status":    "ok",
        "ngrok_url": getattr(app.state, "ngrok_url", "starting…"),
        "webhook":   f"{getattr(app.state, 'ngrok_url', '')}/webhook",
    }


@app.post("/webhook")
async def webhook(request: Request, background_tasks: BackgroundTasks):
    """
    รับ webhook จาก LINE
    ระบบนี้สำหรับแพทย์เท่านั้น — ตอบ 200 ทันทีก่อน LINE timeout
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

        user_id     = event.get("source", {}).get("userId")
        reply_token = event["replyToken"]
        text        = event["message"]["text"]

        if not user_id:
            continue

        if _is_doctor(user_id):
            background_tasks.add_task(_handle_doctor_message, reply_token, user_id, text)
        else:
            # ลองใช้ข้อความที่พิมเป็น hospital_id เพื่อ register
            status, doc = _try_register_doctor(user_id, text.strip())
            if status == "registered":
                _line_reply(
                    reply_token,
                    f"✅ ลงทะเบียนสำเร็จ\n"
                    f"ยินดีต้อนรับ {doc['name']}\n\n"
                    f"รอรับแจ้งเตือน Report ใหม่จากระบบ\n"
                    f"หรือพิมพ์ Report ID เพื่อวิเคราะห์ได้ทันที",
                )
                log.info("Doctor registered: %s → %s", doc["name"], user_id)
            elif status == "already_me":
                _line_reply(
                    reply_token,
                    f"✅ คุณลงทะเบียนแล้ว ({doc['name']})\n"
                    f"รอรับแจ้งเตือน Report ใหม่จากระบบ",
                )
            elif status == "already_taken":
                _line_reply(reply_token, "❌ รหัสแพทย์นี้ถูกใช้งานแล้ว กรุณาติดต่อเจ้าหน้าที่")
            else:
                _line_reply(
                    reply_token,
                    "ระบบนี้สำหรับแพทย์เท่านั้น\n\n"
                    "กรุณาส่งรหัสแพทย์ของคุณเพื่อลงทะเบียน\n"
                    "ตัวอย่าง: DR001",
                )

    return JSONResponse({"status": "ok"})


# ─── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=SERVER_PORT, reload=False)
