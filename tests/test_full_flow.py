#!/usr/bin/env python3
"""
test_full_flow.py — Full Doctor Flow Test (ครบวงจรทั้งระบบ)
ไม่ส่ง LINE จริง — แสดง message content ที่จะส่ง

Components tested:
  PostgreSQL hospital_db  → REAL
  Dify AI (Gemini Flash)  → REAL
  Bridge HTTP webhook      → REAL (FastAPI / signature verify / routing)
  LINE API calls           → CAPTURED (intercepted ใน direct test; fail gracefully ใน HTTP test)
  Gmail email poller       → SIMULATED (insert report ตรงๆ ใน DB)

Flow:
  Phase 1  — Services health (DB, Dify, Bridge server)
  Phase 2  — Simulate patient email → insert 2 reports to DB
  Phase 3  — Build patient context (JOIN 4 tables)
  Phase 4  — Doctor notification (capture LINE message)
  Phase 5A — HTTP Webhook trigger (POST to Bridge server, background task → Dify)
  Phase 5B — Direct function trigger (LINE mocked, Dify+DB real) — รันคู่กับ 5A
  Phase 6  — Verify DB records ทั้ง 2 reports
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

# ─── Config ──────────────────────────────────────────────────────────────────
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
DIFY_API_URL = os.getenv("DIFY_API_URL", "http://localhost/v1")
DIFY_API_KEY = os.getenv("DIFY_API_KEY")

PASS = "✅ PASS"
FAIL = "❌ FAIL"
SKIP = "⏭  SKIP"

results: list[bool] = []
captured_msgs: list[tuple] = []   # (msg_type, to, content)


# ─── Helpers ──────────────────────────────────────────────────────────────────

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


def gen_report_id() -> str:
    d = datetime.now().strftime("%Y%m%d")
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM reports WHERE report_id LIKE %s", (f"RPT-{d}-%",))
            n = cur.fetchone()[0]
    return f"RPT-{d}-{n + 1:04d}"


def make_line_sig(body: bytes) -> str:
    digest = hmac.new(LINE_CHANNEL_SECRET.encode(), body, hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def check_service_up(url: str, headers: dict = None, timeout: float = 5.0) -> bool:
    try:
        r = httpx.get(url, headers=headers or {}, timeout=timeout)
        return r.status_code == 200
    except Exception:
        return False


# ─── LINE capture stubs ───────────────────────────────────────────────────────

def _stub_reply(reply_token: str, text: str) -> None:
    captured_msgs.append(("LINE reply", reply_token[:8] + "...", text))


def _stub_push(user_id: str, text: str) -> None:
    captured_msgs.append(("LINE push", user_id, text))


def _stub_push_qr(user_id: str, text: str, report_id: str) -> None:
    captured_msgs.append(("LINE push+QR", user_id, f"{text}\n\n[Quick Reply button: วิเคราะห์ {report_id}]"))


# ─── Test report content ──────────────────────────────────────────────────────

def _make_report_text() -> str:
    ts = datetime.now().strftime("%d/%m/%Y %H:%M")
    return (
        f"ผลการตรวจเลือด (Full Flow Test {ts})\n"
        "========================================\n"
        "CBC:\n"
        "  Hb         : 11.9 g/dL   [L]\n"
        "  WBC        : 8,400 /μL\n"
        "  Platelet   : 198,000 /μL\n\n"
        "Blood Glucose:\n"
        "  FBS        : 210 mg/dL    [H]\n"
        "  HbA1c      : 8.6%         [H]   (เป้าหมาย <7.0%)\n\n"
        "Renal Function:\n"
        "  Creatinine : 1.4 mg/dL    [H]\n"
        "  eGFR       : 54 mL/min          (CKD G3a)\n\n"
        "Vital Signs:\n"
        "  BP         : 162/96 mmHg  [H]\n"
        "  น้ำหนัก   : 85 kg\n\n"
        "อาการที่คนไข้รายงาน:\n"
        "  เวียนหัวตอนเช้า ปัสสาวะบ่อยกลางคืน 3 ครั้ง อ่อนเพลียกว่าเดิม"
    )


def insert_report(patient_id: str = "HN-2019-001", label: str = "") -> str:
    """Insert test report with status=NULL (matches email_poller atomic flow)"""
    rid = gen_report_id()
    src = f"student@example.com (FullFlowTest {label})"
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO reports
                   (report_id, patient_id, report_source, chief_complaint, report_text, status)
                   VALUES (%s, %s, %s, %s, %s, NULL)""",
                (rid, patient_id, src, "ติดตามผล DM+HT ประจำเดือน", _make_report_text()),
            )
            cur.execute(
                "INSERT INTO audit_logs (actor_id, actor_type, action, report_id) VALUES (%s, 'patient', 'report_submitted', %s)",
                (patient_id, rid),
            )
            conn.commit()
    return rid


def set_doctor_line_uid(doctor_id: str, line_uid: str | None) -> None:
    """ตั้ง/ลบ line_uid สำหรับ test doctor (จำลอง login ผ่าน LINE)"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE doctors SET line_uid = %s WHERE doctor_id = %s", (line_uid, doctor_id))
            conn.commit()


# ─── MAIN TEST ────────────────────────────────────────────────────────────────

def main():
    print("=" * 65)
    print(" Full Doctor Flow Test — LINE–Dify Hospital Bridge")
    print(f" {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    test_report_ids: list[str] = []

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 1]  Services Health Check")
    # ══════════════════════════════════════════════════════════════════

    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM doctors")
                n_doc = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM patients")
                n_pat = cur.fetchone()[0]
        check("PostgreSQL hospital_db", True, f"{n_doc} doctors, {n_pat} patients")
    except Exception as e:
        check("PostgreSQL hospital_db", False, str(e))
        print("หยุด — DB ไม่พร้อม")
        return

    dify_ok = check_service_up(
        f"{DIFY_API_URL}/info",
        headers={"Authorization": f"Bearer {DIFY_API_KEY}"},
    )
    check("Dify API", dify_ok, DIFY_API_URL)
    if not dify_ok:
        print("หยุด — Dify API ไม่พร้อม")
        return

    server_ok = check_service_up(SERVER_URL + "/")
    if server_ok:
        check("Bridge server (port 8000)", True, "HTTP webhook test จะรันด้วย")
    else:
        skip_item("Bridge server (port 8000)", "ไม่รัน — Phase 5A จะข้าม")

    # ดึง doctor สำหรับ test + ตั้ง line_uid = doctor_id เพื่อให้ _is_doctor() match
    # (ทำให้ HTTP webhook ใช้ doctor_id เป็น userId ได้ตรงๆ)
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT doctor_id, name FROM doctors LIMIT 1")
            doctor_id, doctor_name = cur.fetchone()
    set_doctor_line_uid(doctor_id, doctor_id)
    print(f"\n  ℹ️  Test doctor : {doctor_name}  ({doctor_id})")
    print(f"  ℹ️  Test patient: สมชาย มีสุข  (HN-2019-001)")
    print(f"  ℹ️  ตั้ง line_uid = {doctor_id} ชั่วคราว (จะ reset ตอน cleanup)")

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 2]  Simulate Patient Email → Insert Reports to DB")
    # ══════════════════════════════════════════════════════════════════

    try:
        rpt_direct = insert_report(label="Direct")
        test_report_ids.append(rpt_direct)
        check("Insert report (direct test)", True, rpt_direct)
    except Exception as e:
        check("Insert report (direct test)", False, str(e))
        return

    rpt_http = None
    if server_ok:
        try:
            rpt_http = insert_report(label="HTTP")
            test_report_ids.append(rpt_http)
            check("Insert report (HTTP test)", True, rpt_http)
        except Exception as e:
            check("Insert report (HTTP test)", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 3]  Build Patient Context (JOIN 4 tables)")
    # ══════════════════════════════════════════════════════════════════

    # Import doctor flow module (safe — does not start server/ngrok/poller)
    from flows import doctor as doctor_flow  # noqa: PLC0415

    try:
        row, context = doctor_flow._build_patient_context(rpt_direct)
        check("Build context สำเร็จ",     row is not None,              f"{len(context)} chars")
        check("มีข้อมูลยาแพ้",            "⚠️" in context)
        check("มีโรคประจำตัว",            "โรคประจำตัว" in context)
        check("มียาปัจจุบัน",             "ยาที่ใช้อยู่" in context)
        check("มีผล lab ใน context",       "Hb" in context and "FBS" in context)
        print(f"\n  Context preview (200 chars):")
        print("  " + context[:200].replace("\n", "\n  "))
        print("  ...")
    except Exception as e:
        check("Build context สำเร็จ", False, str(e))
        return

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 4]  Doctor Notification (LINE intercepted — ไม่ส่งจริง)")
    # ══════════════════════════════════════════════════════════════════

    with patch.object(doctor_flow.line_client, "push_with_quick_reply", side_effect=_stub_push_qr), \
         patch.object(doctor_flow.line_client, "push",                  side_effect=_stub_push), \
         patch.object(doctor_flow.line_client, "reply",                 side_effect=_stub_reply):
        try:
            doctor_flow.notify_new_report(doctor_id, "สมชาย มีสุข", rpt_direct)
            notif = next((m for m in captured_msgs if m[0] == "LINE push+QR"), None)
            check("_notify_new_report ทำงาน",  notif is not None)
            check("ข้อความมี report_id",       rpt_direct in (notif[2] if notif else ""))
            check("มี Quick Reply วิเคราะห์",  "วิเคราะห์" in (notif[2] if notif else ""))
            if notif:
                print(f"\n  📱 Notification ที่แพทย์จะได้รับ:")
                print("  ┌─────────────────────────────────────────")
                for ln in notif[2].splitlines():
                    print(f"  │ {ln}")
                print("  └─────────────────────────────────────────")
        except Exception as e:
            check("_notify_new_report ทำงาน", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 5B]  Direct Doctor Trigger (LINE intercepted, Dify+DB real)")
    # ══════════════════════════════════════════════════════════════════
    # รันก่อน Phase 5A เพื่อป้องกัน Dify call พร้อมกัน (อาจช้าลง)
    #
    print(f"  ℹ️  Report: {rpt_direct}  |  Doctor: {doctor_id}")
    print(f"  กำลังส่งไป Dify... (อาจใช้เวลา 60-90 วิ)")

    direct_ok = False
    with patch.object(doctor_flow.line_client, "reply",                 side_effect=_stub_reply), \
         patch.object(doctor_flow.line_client, "push",                  side_effect=_stub_push), \
         patch.object(doctor_flow.line_client, "push_with_quick_reply", side_effect=_stub_push_qr):
        try:
            t0 = time.time()
            doctor_flow.handle_message(
                "fake_reply_token_for_test_12345",
                doctor_id,
                f"วิเคราะห์ {rpt_direct}",
            )
            elapsed = time.time() - t0

            reply_msgs = [m for m in captured_msgs if m[0] == "LINE reply"]
            push_msgs  = [m for m in captured_msgs if m[0] == "LINE push"]

            check("_handle_doctor_message รัน", True,                f"{elapsed:.1f}s")
            check("LINE reply 'กำลังวิเคราะห์'", any("กำลังวิเคราะห์" in m[2] for m in reply_msgs))
            check("LINE push ส่งผล AI",           len(push_msgs) > 0)

            if push_msgs:
                summary = push_msgs[-1][2]
                check("Summary ยาวพอ",              len(summary) > 200,  f"{len(summary)} chars")
                check("มีหัวข้อสรุปผล",             "สรุปผลการตรวจ" in summary or "ข้อมูลทั่วไป" in summary)
                check("มีค่าผิดปกติใน summary",     "ผิดปกติ" in summary or "[H]" in summary or "[L]" in summary)

                print(f"\n  📊 AI Summary ที่แพทย์จะได้รับ (600 chars):")
                print("  ┌─────────────────────────────────────────")
                for ln in summary[:600].splitlines():
                    print(f"  │ {ln}")
                if len(summary) > 600:
                    print("  │ ...")
                print("  └─────────────────────────────────────────")

            direct_ok = True
        except Exception as e:
            check("_handle_doctor_message รัน", False, str(e))

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 5A]  HTTP Webhook Trigger  (Bridge server → FastAPI → background task)")
    # ══════════════════════════════════════════════════════════════════
    # รันหลัง Phase 5B เสร็จแล้ว → Dify ไม่ถูก call พร้อมกัน
    # LINE reply/push fail gracefully (fake token + doctor_id ไม่ใช่ LINE user จริง)
    # แต่ main.py ตอนนี้ wrap _line_reply/_line_push ด้วย try/except แล้ว → DB ยังบันทึก
    #
    http_webhook_fired = False
    if server_ok and rpt_http:
        payload = {
            "destination": "test",
            "events": [{
                "type":        "message",
                "timestamp":   int(time.time() * 1000),
                "source":      {"type": "user", "userId": doctor_id},
                "replyToken":  "ffffffffffffffffffffffffffffffff",
                "message":     {
                    "type": "text",
                    "id":   "111222333",
                    "text": f"วิเคราะห์ {rpt_http}",
                },
            }],
        }
        body = json.dumps(payload, ensure_ascii=False).encode()
        sig  = make_line_sig(body)

        try:
            t0 = time.time()
            resp = httpx.post(
                f"{SERVER_URL}/webhook",
                content=body,
                headers={
                    "Content-Type":     "application/json",
                    "X-Line-Signature": sig,
                },
                timeout=10,
            )
            elapsed = time.time() - t0
            check("POST /webhook ตอบ 200 OK",  resp.status_code == 200, f"{elapsed*1000:.0f}ms")
            check("Signature ผ่านการตรวจสอบ",  resp.status_code != 400, resp.text[:60])
            http_webhook_fired = resp.status_code == 200
            if http_webhook_fired:
                print(f"  ℹ️  Background task เริ่มแล้ว (report: {rpt_http})")
                print(f"  ℹ️  จะ poll DB ใน Phase 6 (max 180s)")
        except Exception as e:
            check("POST /webhook ตอบ 200 OK", False, str(e))
    else:
        skip_item("HTTP Webhook", "server ไม่รัน" if not server_ok else "ไม่มี report_http")

    # ══════════════════════════════════════════════════════════════════
    banner("[Phase 6]  Verify DB Records")
    # ══════════════════════════════════════════════════════════════════

    # Direct test
    print(f"\n  [Direct] report: {rpt_direct}")
    try:
        with get_db() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute("SELECT summary_text, dify_conversation_id FROM analyses WHERE report_id=%s", (rpt_direct,))
                an = cur.fetchone()
                cur.execute("SELECT status FROM reports WHERE report_id=%s", (rpt_direct,))
                st = cur.fetchone()["status"]
            # ใช้ cursor ปกติสำหรับ COUNT(*) เพราะ RealDictCursor ไม่ support index [0]
            with conn.cursor() as cur2:
                cur2.execute(
                    "SELECT COUNT(*) FROM audit_logs WHERE report_id=%s AND action='analysis_triggered'",
                    (rpt_direct,),
                )
                n_log = cur2.fetchone()[0]

        check("  analyses บันทึกแล้ว",            an is not None)
        check("  conversation_id บันทึกแล้ว",     bool(an["dify_conversation_id"]) if an else False)
        check("  status reset NULL หลังวิเคราะห์", st is None,         f"got {st!r}")
        check("  audit_log analysis_triggered",   n_log > 0,         f"{n_log} records")
    except Exception as e:
        check("  Direct DB verify", False, repr(e))

    # HTTP webhook test — poll DB (Dify อาจยังทำงานอยู่)
    if http_webhook_fired and rpt_http:
        print(f"\n  [HTTP] report: {rpt_http}")
        print(f"  ⏳ รอ background task เสร็จ... (max 240s — Dify call อาจกิน ~3 นาที)")
        deadline = time.time() + 240
        http_done = False
        last_print = time.time()
        while time.time() < deadline:
            with get_db() as conn:
                with conn.cursor() as cur:
                    # วิเคราะห์เสร็จ = มี analyses row + status กลับเป็น NULL
                    cur.execute(
                        """SELECT r.status, a.id
                           FROM reports r LEFT JOIN analyses a ON r.report_id = a.report_id
                           WHERE r.report_id = %s
                           ORDER BY a.id DESC NULLS LAST LIMIT 1""",
                        (rpt_http,),
                    )
                    r = cur.fetchone()
            if r and r[1] is not None and r[0] is None:
                http_done = True
                break
            if time.time() - last_print >= 10:
                remaining = int(deadline - time.time())
                print(f"  ... ยังรออยู่ (เหลือ {remaining}s)")
                last_print = time.time()
            time.sleep(3)

        if http_done:
            with get_db() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute("SELECT summary_text, dify_conversation_id FROM analyses WHERE report_id=%s", (rpt_http,))
                    an_h = cur.fetchone()
            check("  analyses บันทึกแล้ว (HTTP path)", an_h is not None)
            check("  conversation_id บันทึก (HTTP)",   bool(an_h["dify_conversation_id"]) if an_h else False)
            check("  status reset NULL (HTTP)",         True)
            print(f"  ℹ️  HTTP path ใช้เวลารวม ~{120-int(deadline-time.time())}s")
        else:
            check("  HTTP background task เสร็จใน 120s", False, "timeout")

    # ══════════════════════════════════════════════════════════════════
    banner("Summary")
    # ══════════════════════════════════════════════════════════════════

    passed = sum(results)
    total  = len(results)
    print(f"\n  Result: {passed}/{total} passed  {'🎉 ทุก test ผ่าน!' if passed == total else '⚠️ บาง test ไม่ผ่าน'}")

    if captured_msgs:
        print(f"\n  {'─'*60}")
        print(f"  LINE Messages Captured ({len(captured_msgs)} messages — ไม่ส่งจริง)")
        print(f"  {'─'*60}")
        for i, (mtype, to, text) in enumerate(captured_msgs, 1):
            print(f"\n  [{i}] {mtype}  to={to}")
            preview = text[:400].replace("\n", "\n      ")
            print(f"      {preview}")
            if len(text) > 400:
                print("      ...")

    print("\n" + "=" * 65)

    # Cleanup — reset line_uid เสมอ (เลียนแบบ lifespan startup reset)
    set_doctor_line_uid(doctor_id, None)
    print(f"\n  🧹 Reset line_uid ของ {doctor_id} = NULL แล้ว")

    try:
        ans = input("\nลบ test reports ออกจาก DB? (y/n): ").strip().lower()
    except EOFError:
        ans = "n"

    if ans == "y":
        with get_db() as conn:
            with conn.cursor() as cur:
                for rid in test_report_ids:
                    cur.execute("DELETE FROM audit_logs WHERE report_id=%s", (rid,))
                    cur.execute("DELETE FROM analyses   WHERE report_id=%s", (rid,))
                    cur.execute("DELETE FROM reports    WHERE report_id=%s", (rid,))
            conn.commit()
        print(f"ลบแล้ว: {test_report_ids}")


if __name__ == "__main__":
    main()
