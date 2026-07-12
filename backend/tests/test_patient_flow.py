#!/usr/bin/env python3
"""
test_patient_flow.py — Patient Advisor Flow Test (ครบวงจร)
ไม่ส่ง LINE จริง — แสดง message content ที่จะส่ง

Components tested:
  PostgreSQL hospital_db  → REAL
  Own LLM (Gemini Flash)  → REAL (patient-advisor routing + emergency gate)
  Bridge HTTP webhook     → REAL (FastAPI / signature verify / routing)
  LINE API calls          → CAPTURED (intercepted ใน direct test, fail gracefully ใน HTTP test)

Flow:
  Phase 1 — Services health (DB, Bridge server)
  Phase 2 — _is_patient + _try_register_patient (4 cases: registered/already_me/already_taken/not_found)
  Phase 3 — _handle_patient_message direct: ปกติ → own LLM (patient advisor) → ได้ disclaimer
  Phase 4 — _handle_patient_message direct: emergency keyword → ได้ "โทร 1669"
  Phase 5 — _handle_patient_message direct: logout → line_uid=NULL
  Phase 6 — HTTP Webhook → POST signed event → background task → AI (สำหรับ PT001)
  Phase 7 — Verify dify_conversation_id persisted + audit_logs 'advice_requested'
"""
import sys
import os
import json
import time
import hashlib
import hmac
import base64
from datetime import datetime
from unittest.mock import patch

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from dotenv import load_dotenv
load_dotenv()

import httpx
import psycopg2
from psycopg2.extras import RealDictCursor

# ─── Config ────────────────────────────────────────────────────────────────────
DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}
LINE_CHANNEL_SECRET = os.getenv("LINE_CHANNEL_SECRET", "")
SERVER_PORT  = int(os.getenv("SERVER_PORT", 8000))
SERVER_URL   = f"http://localhost:{SERVER_PORT}"
INTERNAL_TOKEN = os.getenv("BRIDGE_INTERNAL_TOKEN", "")

PASS = "✅ PASS"
FAIL = "❌ FAIL"
SKIP = "⏭  SKIP"

results: list[bool] = []
captured_msgs: list[tuple] = []   # (msg_type, to, content)

# Test patient UIDs (fake LINE UIDs สำหรับ test)
TEST_UID_PT001     = "U_test_patient_001"
TEST_UID_PT001_ALT = "U_test_patient_001_alt"


# ─── Helpers ───────────────────────────────────────────────────────────────────

def check(label: str, cond: bool, detail: str = "") -> bool:
    status = PASS if cond else FAIL
    print(f"  {status}  {label}" + (f"  →  {detail}" if detail else ""))
    results.append(cond)
    return cond


def skip_item(label: str, reason: str = "") -> None:
    print(f"  {SKIP}  {label}" + (f"  →  {reason}" if reason else ""))


def banner(title: str) -> None:
    print(f"\n{'─'*65}")
    print(f"  {title}")
    print(f"{'─'*65}")


def get_db():
    return psycopg2.connect(**DB_CONFIG)


def make_line_sig(body: bytes) -> str:
    digest = hmac.new(LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def cleanup_test_state() -> None:
    """รีเซ็ต line_uid + dify_conversation_id ของ PT001 เพื่อ test สะอาด"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL "
                "WHERE patient_code = 'PT001'"
            )
            cur.execute(
                "DELETE FROM audit_logs WHERE actor_id = 'HN-2019-001' AND action = 'advice_requested'"
            )
            conn.commit()


def fake_line_reply(reply_token: str, text: str) -> None:
    captured_msgs.append(("reply", reply_token, text))


def fake_line_push(user_id: str, text: str) -> None:
    captured_msgs.append(("push", user_id, text))


# ─── Phase 1: Services Health ──────────────────────────────────────────────────

def phase_1_health() -> None:
    banner("PHASE 1: Services Health")

    # DB
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        check("PostgreSQL hospital_db", True)
    except Exception as e:
        check("PostgreSQL hospital_db", False, str(e)[:60])

    # Bridge — optional (จะรันใน Phase 6)
    bridge_up = False
    try:
        r = httpx.get(f"{SERVER_URL}/", timeout=3)
        bridge_up = r.status_code == 200
        check("Bridge server /", bridge_up, "online")
    except Exception:
        check("Bridge server /", False, "offline (Phase 6 จะข้าม)")

    # Own-LLM readiness (OpenRouter/Gemini) — Phase 3/6 depend on it. Non-fatal,
    # but flags an LLM outage up front instead of a confusing hang later.
    if bridge_up:
        try:
            r = httpx.post(
                f"{SERVER_URL}/internal/rag/answer",
                headers={"X-Internal-Token": INTERNAL_TOKEN, "Content-Type": "application/json"},
                json={"text": "สวัสดี"}, timeout=60,
            )
            llm_ok = r.status_code == 200 and bool(r.json().get("route_prefix"))
            check("Own LLM backend (/internal/rag/answer)", llm_ok, f"HTTP {r.status_code}")
        except Exception as e:
            check("Own LLM backend (/internal/rag/answer)", False, str(e)[:60])

    # PT001 exists
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT patient_id, name FROM patients WHERE patient_code = 'PT001'")
            row = cur.fetchone()
    check("PT001 มีในระบบ", row is not None, f"{row[0]} ({row[1]})" if row else "ไม่พบ")


# ─── Phase 2: Register Patient ─────────────────────────────────────────────────

def phase_2_register() -> None:
    banner("PHASE 2: _is_patient + _try_register_patient")
    from flows import patient as patient_flow

    cleanup_test_state()

    # 2a: _is_patient False ก่อน register
    check(
        "_is_patient(fake_uid) → False (ยังไม่ register)",
        patient_flow.is_patient(TEST_UID_PT001) is False,
    )

    # 2b: not_found
    status, _ = patient_flow.try_register(TEST_UID_PT001, "PT999")
    check("PT999 → not_found", status == "not_found", status)

    # 2c: registered
    status, pat = patient_flow.try_register(TEST_UID_PT001, "PT001")
    check("PT001 register สำเร็จ", status == "registered", f"{pat['name'] if pat else '?'}")

    # 2d: _is_patient True หลัง register
    check("_is_patient(fake_uid) → True หลัง register", patient_flow.is_patient(TEST_UID_PT001) is True)

    # 2e: already_me — UID เดิม register ซ้ำ
    status, _ = patient_flow.try_register(TEST_UID_PT001, "PT001")
    check("PT001 register ซ้ำ UID เดิม → already_me", status == "already_me", status)

    # 2f: already_taken — UID ใหม่ ลอง register PT001 ที่ผูกอยู่แล้ว
    status, _ = patient_flow.try_register(TEST_UID_PT001_ALT, "PT001")
    check("PT001 จาก UID ใหม่ → already_taken", status == "already_taken", status)


# ─── Phase 3: Patient Normal Advice ────────────────────────────────────────────

def phase_3_advice_normal() -> None:
    banner("PHASE 3: _handle_patient_message — Normal (own LLM patient advisor)")
    from flows import patient as patient_flow

    captured_msgs.clear()
    query = "ผมปวดท้องด้านขวาล่างมา 2 วันแล้ว ไม่แน่ใจว่าเป็นอะไร"

    with patch.object(patient_flow.line_client, "reply", side_effect=fake_line_reply), \
         patch.object(patient_flow.line_client, "push",  side_effect=fake_line_push):
        t0 = time.time()
        patient_flow.handle_message("fake_reply_token", TEST_UID_PT001, query)
        dt = time.time() - t0

    check(f"_handle_patient_message รัน ({dt:.1f}s)", dt < 180, f"{dt:.1f}s")
    check("captured ≥ 2 messages (loading + answer)", len(captured_msgs) >= 2,
          f"{len(captured_msgs)} msgs")

    if len(captured_msgs) >= 2:
        loading = captured_msgs[0]
        answer  = captured_msgs[1]
        check("msg[0] = reply 'กำลังค้น...'", loading[0] == "reply" and "กำลังค้น" in loading[2],
              loading[2][:50])
        check("msg[1] = push (answer)", answer[0] == "push", f"to={answer[1][:20]}")
        ans_text = answer[2]
        disclaimer_terms = ["ไม่ใช่การวินิจฉัย", "ปรึกษาแพทย์", "ข้อมูลทั่วไป"]
        check("answer มี disclaimer ⚠️", "⚠️" in ans_text and any(k in ans_text for k in disclaimer_terms),
              f"{len(ans_text)} chars")
        check("answer มีหัวข้อ 1️⃣2️⃣3️⃣", all(k in ans_text for k in ["1️⃣", "2️⃣", "3️⃣"]),
              "patient template")


# ─── Phase 4: Emergency Branch ─────────────────────────────────────────────────

def phase_4_advice_emergency() -> None:
    banner("PHASE 4: _handle_patient_message — Emergency keyword")
    from flows import patient as patient_flow

    captured_msgs.clear()
    query = "ผมเจ็บหน้าอกมาก หายใจไม่ออก"

    with patch.object(patient_flow.line_client, "reply", side_effect=fake_line_reply), \
         patch.object(patient_flow.line_client, "push",  side_effect=fake_line_push):
        patient_flow.handle_message("fake_reply_token", TEST_UID_PT001, query)

    push_msgs = [m for m in captured_msgs if m[0] == "push"]
    check("มี push 1 message (answer)", len(push_msgs) == 1, f"{len(push_msgs)}")

    if push_msgs:
        ans = push_msgs[0][2]
        check("answer มี '🚨'", "🚨" in ans, ans[:50])
        check("answer มี 'โทร 1669'", "1669" in ans, "emergency response")
        check("answer สั้น (< 300 chars — hardcoded ไม่ผ่าน LLM)", len(ans) < 300, f"{len(ans)} chars")


# ─── Phase 5: Logout ───────────────────────────────────────────────────────────

def phase_5_logout() -> None:
    banner("PHASE 5: _handle_patient_message — logout")
    from flows import patient as patient_flow

    captured_msgs.clear()

    with patch.object(patient_flow.line_client, "reply", side_effect=fake_line_reply), \
         patch.object(patient_flow.line_client, "push",  side_effect=fake_line_push):
        patient_flow.handle_message("fake_reply_token", TEST_UID_PT001, "logout")

    check("captured = 1 reply", len(captured_msgs) == 1 and captured_msgs[0][0] == "reply")
    if captured_msgs:
        check("reply มี 'ออกจากระบบ'", "ออกจากระบบ" in captured_msgs[0][2])

    # ตรวจใน DB
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT line_uid, dify_conversation_id FROM patients WHERE patient_code='PT001'")
            row = cur.fetchone()
    check("DB line_uid = NULL หลัง logout", row[0] is None)
    check("DB dify_conversation_id = NULL หลัง logout", row[1] is None)
    check("_is_patient(fake_uid) → False หลัง logout", patient_flow.is_patient(TEST_UID_PT001) is False)


# ─── Phase 6: HTTP Webhook routing ─────────────────────────────────────────────

def phase_6_http_webhook() -> None:
    banner("PHASE 6: HTTP Webhook routing (FastAPI signature + background task)")
    from flows import patient as patient_flow

    # ต้องมี bridge รัน
    try:
        r = httpx.get(f"{SERVER_URL}/", timeout=3)
        if r.status_code != 200:
            skip_item("Bridge offline", "ข้าม Phase 6")
            return
    except Exception:
        skip_item("Bridge offline", "ข้าม Phase 6")
        return

    cleanup_test_state()
    # Register PT001 → fake UID ก่อน (เพราะ webhook จะตัดสินใจจาก _is_patient)
    status, _ = patient_flow.try_register(TEST_UID_PT001, "PT001")
    if status != "registered":
        check("Setup PT001 register", False, status)
        return
    check("Setup: PT001 registered → fake UID", True)

    # ส่ง webhook พิมพ์อาการปกติ
    event = {
        "events": [
            {
                "type": "message",
                "replyToken": "fake-reply-token-test",
                "source": {"userId": TEST_UID_PT001},
                "message": {"type": "text", "text": "ปวดหัวมา 1 สัปดาห์"},
            }
        ]
    }
    body = json.dumps(event).encode("utf-8")
    sig = make_line_sig(body)

    r = httpx.post(
        f"{SERVER_URL}/webhook",
        content=body,
        headers={"X-Line-Signature": sig, "Content-Type": "application/json"},
        timeout=30,
    )
    check("POST /webhook คืน 200 ทันที", r.status_code == 200, f"HTTP {r.status_code}")

    # รอ background task ทำ AI call + update DB
    deadline = time.time() + 180
    matched = False
    while time.time() < deadline:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT dify_conversation_id FROM patients WHERE patient_code='PT001'"
                )
                row = cur.fetchone()
        if row and row[0]:
            matched = True
            break
        time.sleep(2)
    check("background task อัพเดต dify_conversation_id ใน DB",
          matched, f"conv_id={row[0][:20] if row and row[0] else '(none)'}...")


# ─── Phase 7: Audit log + DB state ─────────────────────────────────────────────

def phase_7_verify_db() -> None:
    banner("PHASE 7: Verify dify_conversation_id + audit_logs")

    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT line_uid, dify_conversation_id FROM patients WHERE patient_code='PT001'"
            )
            pat = cur.fetchone()
            cur.execute(
                """SELECT COUNT(*) AS n FROM audit_logs
                   WHERE actor_id='HN-2019-001' AND action='advice_requested'"""
            )
            audit = cur.fetchone()

    check("DB patient.line_uid set (จาก Phase 6 webhook)",
          pat["line_uid"] == TEST_UID_PT001, pat["line_uid"])
    check("DB patient.dify_conversation_id set",
          pat["dify_conversation_id"] is not None,
          (pat["dify_conversation_id"] or "")[:20])
    check("audit_logs มี 'advice_requested' ≥ 1", audit["n"] >= 1, f"n={audit['n']}")


# ─── Cleanup ───────────────────────────────────────────────────────────────────

def cleanup() -> None:
    banner("CLEANUP")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL "
                "WHERE patient_code = 'PT001'"
            )
            cur.execute(
                "DELETE FROM audit_logs WHERE actor_id='HN-2019-001' AND action='advice_requested'"
            )
            conn.commit()
    print("  ✓ PT001 cleanup: line_uid=NULL, conv_id=NULL, audit_logs cleared")


# ─── Main ──────────────────────────────────────────────────────────────────────

def main_run():
    print("=" * 67)
    print("  test_patient_flow.py — Patient Advisor Flow Test")
    print("=" * 67)

    try:
        phase_1_health()
        phase_2_register()
        phase_3_advice_normal()
        phase_4_advice_emergency()
        phase_5_logout()
        phase_6_http_webhook()
        phase_7_verify_db()
    finally:
        cleanup()

    total  = len(results)
    passed = sum(1 for r in results if r)
    print("\n" + "=" * 67)
    print(f"  RESULT: {passed}/{total} passed")
    print("=" * 67)
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main_run()
