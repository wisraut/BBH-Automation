"""
CRO Monitoring + Override flow (Phase 1A v2)

- LINE #1 (public): customer ส่ง message → AI ตอบ (role=public_inquiry) → AUTO/ESCALATE
- LINE #2 (cro):    CRO commands — active/list/queue/view/take/end + forward ตอน take-over

Customer↔CRO chat relay ระหว่าง 2 channels:
- LINE #1 → bridge → forward → LINE #2 (CRO เห็น)
- LINE #2 → bridge → forward → LINE #1 (customer ได้รับ)
"""
import re

from psycopg2.extras import RealDictCursor

import dify_client
import line_client
from config import log
from db import get_db


# ─── DB ops ────────────────────────────────────────────────────────────────────

def is_cro_team(line_uid: str) -> bool:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM cro_users WHERE line_uid = %s AND active = true",
                (line_uid,),
            )
            return cur.fetchone() is not None


def try_register(line_uid: str, cro_code: str) -> tuple:
    """Returns ('registered', cro) | ('already_me', cro) | ('already_taken', None) | ('not_found', None)"""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT cro_id, cro_code, name, line_uid FROM cro_users WHERE cro_code = %s",
                (cro_code.upper(),),
            )
            cro = cur.fetchone()

        if not cro:
            return ("not_found", None)
        if cro["line_uid"] == line_uid:
            return ("already_me", cro)
        if cro["line_uid"] is not None:
            return ("already_taken", None)

        with conn.cursor() as cur:
            cur.execute(
                "UPDATE cro_users SET line_uid = %s WHERE cro_code = %s AND line_uid IS NULL",
                (line_uid, cro_code.upper()),
            )
            updated = cur.rowcount == 1
            conn.commit()
        if not updated:
            return ("already_taken", None)
        return ("registered", cro)


def _get_or_create_conversation(patient_uid: str) -> dict:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT conv_id, status, taken_by FROM conversations
                   WHERE patient_uid = %s AND status IN ('active', 'taken_over')
                   ORDER BY last_activity DESC LIMIT 1""",
                (patient_uid,),
            )
            row = cur.fetchone()
            if row:
                cur.execute(
                    "UPDATE conversations SET last_activity = now() WHERE conv_id = %s",
                    (row["conv_id"],),
                )
                conn.commit()
                return dict(row)
            cur.execute(
                "INSERT INTO conversations (patient_uid) VALUES (%s) "
                "RETURNING conv_id, status, taken_by",
                (patient_uid,),
            )
            new = cur.fetchone()
            conn.commit()
            return dict(new)


def _save_message(conv_id: int, sender: str, text: str,
                  classifier: str = None, confidence: int = None,
                  cro_id: int = None) -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO conversation_messages
                   (conv_id, sender, cro_id, text, classifier, confidence)
                   VALUES (%s, %s, %s, %s, %s, %s)""",
                (conv_id, sender, cro_id, text, classifier, confidence),
            )
            conn.commit()


def _take_over(cro_line_uid: str, conv_id: int) -> tuple:
    """Atomic take-over. Returns ('taken'|'already_yours', patient_uid) | ('taken_by_other', name) | ('not_found', None)"""
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT cro_id, name FROM cro_users WHERE line_uid = %s",
                (cro_line_uid,),
            )
            cro = cur.fetchone()
            if not cro:
                return ("not_cro", None)
            cur.execute(
                """UPDATE conversations
                   SET status = 'taken_over', taken_by = %s, taken_at = now(),
                       last_activity = now()
                   WHERE conv_id = %s
                     AND (status = 'active' OR (status = 'taken_over' AND taken_by = %s))
                   RETURNING patient_uid, (taken_by = %s) AS was_already_mine""",
                (cro["cro_id"], conv_id, cro["cro_id"], cro["cro_id"]),
            )
            row = cur.fetchone()
            if row:
                conn.commit()
                return ("already_yours" if row["was_already_mine"] else "taken", row["patient_uid"])
            cur.execute(
                """SELECT cu.name FROM conversations c
                   LEFT JOIN cro_users cu ON cu.cro_id = c.taken_by
                   WHERE c.conv_id = %s""",
                (conv_id,),
            )
            row = cur.fetchone()
            if not row:
                return ("not_found", None)
            return ("taken_by_other", row.get("name"))


def _end_take_over(cro_line_uid: str, conv_id: int = None) -> tuple:
    with get_db() as conn:
        with conn.cursor() as cur:
            if conv_id is None:
                cur.execute(
                    """UPDATE conversations SET status = 'active', taken_by = NULL,
                          taken_at = NULL, last_activity = now()
                       WHERE status = 'taken_over'
                         AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                       RETURNING patient_uid""",
                    (cro_line_uid,),
                )
            else:
                cur.execute(
                    """UPDATE conversations SET status = 'active', taken_by = NULL,
                          taken_at = NULL, last_activity = now()
                       WHERE conv_id = %s AND status = 'taken_over'
                         AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                       RETURNING patient_uid""",
                    (conv_id, cro_line_uid),
                )
            rows = cur.fetchall()
            conn.commit()
            return (len(rows), [r[0] for r in rows])


def _list_active(limit: int = 10) -> list:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT c.conv_id, c.patient_uid, c.status, c.last_activity,
                          cu.name AS taken_by_name,
                          (SELECT text FROM conversation_messages
                           WHERE conv_id = c.conv_id ORDER BY created_at DESC LIMIT 1) AS last_msg
                   FROM conversations c
                   LEFT JOIN cro_users cu ON cu.cro_id = c.taken_by
                   WHERE c.status IN ('active', 'taken_over')
                   ORDER BY c.last_activity DESC LIMIT %s""",
                (limit,),
            )
            return [dict(r) for r in cur.fetchall()]


def _get_history(conv_id: int, limit: int = 10) -> list:
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                """SELECT sender, text, classifier, confidence, created_at,
                          (SELECT name FROM cro_users WHERE cro_id = m.cro_id) AS cro_name
                   FROM conversation_messages m
                   WHERE conv_id = %s ORDER BY created_at DESC LIMIT %s""",
                (conv_id, limit),
            )
            rows = list(cur.fetchall())
            rows.reverse()
            return [dict(r) for r in rows]


def _conv_owned_by(cro_line_uid: str) -> int:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT conv_id FROM conversations
                   WHERE status = 'taken_over'
                     AND taken_by = (SELECT cro_id FROM cro_users WHERE line_uid = %s)
                   ORDER BY taken_at DESC LIMIT 1""",
                (cro_line_uid,),
            )
            row = cur.fetchone()
            return row[0] if row else None


def _patient_uid_for(conv_id: int) -> str:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT patient_uid FROM conversations WHERE conv_id = %s", (conv_id,))
            row = cur.fetchone()
            return row[0] if row else None


def _notify_team(conv_id: int, patient_uid: str, first_msg: str, escalated: bool = False) -> None:
    icon = "🔔 URGENT" if escalated else "📬 New"
    label = "🚨 ตอบไม่ได้" if escalated else "AI ตอบอยู่"
    text = (
        f"{icon} #{conv_id} ({label})\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"{first_msg[:300]}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"พิมพ์ \"view {conv_id}\" เพื่อดูประวัติ\n"
        f"พิมพ์ \"take {conv_id}\" เพื่อรับคุยเอง"
    )
    with get_db() as conn:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            cur.execute(
                "SELECT line_uid FROM cro_users WHERE active = true AND line_uid IS NOT NULL"
            )
            uids = [r["line_uid"] for r in cur.fetchall()]
    for uid in uids:
        try:
            line_client.push(uid, text, ch=line_client.CRO)
        except Exception:
            log.exception("Failed to push convo notification to CRO %s", uid)


# ─── Handlers ──────────────────────────────────────────────────────────────────

def handle_public_inquiry(reply_token: str, patient_uid: str, text: str) -> None:
    """
    คนทั่วไป (ไม่ login DR/PT) ส่งคำถามใน LINE #1:
    - ถ้าอยู่ใน take-over → forward → CRO (LINE #2)
    - ไม่งั้น → AI ตอบ + log (escalate ถ้า LLM บอก)
    """
    convo = _get_or_create_conversation(patient_uid)
    conv_id = convo["conv_id"]
    is_first_msg = (convo["status"] == "active" and not convo["taken_by"])
    _save_message(conv_id, "customer", text)

    if convo["status"] == "taken_over" and convo["taken_by"]:
        with get_db() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(
                    "SELECT line_uid FROM cro_users WHERE cro_id = %s",
                    (convo["taken_by"],),
                )
                cro = cur.fetchone()
        if cro and cro["line_uid"]:
            try:
                line_client.push(cro["line_uid"], f"💬 #{conv_id}:\n{text}", ch=line_client.CRO)
            except Exception:
                log.exception("Failed forward customer→CRO conv %s", conv_id)
        return

    line_client.reply(reply_token, "🤔 กำลังตรวจสอบให้ครับ/ค่ะ…")
    answer, _conv_id, _meta = dify_client.ask_with_meta(
        user_id=patient_uid, message=text, role="public_inquiry"
    )
    should_escalate, classifier, body = dify_client.parse_decision(answer)

    if should_escalate:
        _save_message(conv_id, "bot", body or text, classifier=classifier, confidence=0)
        try:
            line_client.push(patient_uid, "📝 รับเรื่องแล้วครับ/ค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด")
        except Exception:
            log.exception("Failed escalate notice to customer %s", patient_uid)
        _notify_team(conv_id, patient_uid, text, escalated=True)
        log.info("Public inquiry escalated — conv #%s (%s)", conv_id, classifier)
        return

    _save_message(conv_id, "bot", body or answer, classifier=classifier, confidence=100)
    try:
        line_client.push(patient_uid, body or answer)
    except Exception:
        log.exception("Failed bot answer push to %s", patient_uid)
    if is_first_msg:
        _notify_team(conv_id, patient_uid, text, escalated=False)
    log.info("Public inquiry auto-answered — conv #%s", conv_id)


def handle_team_command(reply_token: str, cro_line_uid: str, text: str) -> None:
    """CRO commands ใน LINE #2 — active/list/queue/view/take/end + forward"""
    text_stripped = text.strip()
    text_lower = text_stripped.lower()

    if text_lower in ("/end", "end"):
        count, uids = _end_take_over(cro_line_uid)
        if count == 0:
            line_client.reply(reply_token, "ℹ️ ไม่มี session ที่กำลังคุยอยู่", ch=line_client.CRO)
        else:
            for uid in uids:
                try:
                    line_client.push(uid, "ขอบคุณที่ติดต่อค่ะ AI กำลังดูแลต่อ — มีอะไรถามต่อได้นะคะ")
                except Exception:
                    log.exception("Failed end-of-takeover notice to %s", uid)
            line_client.reply(reply_token, f"✅ จบ take-over {count} session — AI กลับมาดูแลต่อ", ch=line_client.CRO)
        return

    if text_lower in ("active", "list"):
        rows = _list_active(limit=10)
        if not rows:
            line_client.reply(reply_token, "✨ ไม่มี conversation active", ch=line_client.CRO)
            return
        lines = ["📋 Active sessions:"]
        for r in rows:
            tag = "🔴 LIVE" if r["status"] == "taken_over" else "🤖 AI"
            owner = f" ({r['taken_by_name']})" if r["taken_by_name"] else ""
            last = (r["last_msg"] or "")[:40]
            lines.append(f"{tag}{owner} #{r['conv_id']}: {last}")
        lines.append("\nพิมพ์ \"view N\" ดูประวัติ / \"take N\" รับคุยเอง")
        line_client.reply(reply_token, "\n".join(lines), ch=line_client.CRO)
        return

    if text_lower == "queue":
        rows = [r for r in _list_active(limit=20) if not r["taken_by_name"]]
        if not rows:
            line_client.reply(reply_token, "✨ ไม่มี conversation ที่ AI escalate", ch=line_client.CRO)
            return
        lines = ["🔔 Escalated / AI ตอบอยู่:"]
        for r in rows:
            last = (r["last_msg"] or "")[:50]
            lines.append(f"#{r['conv_id']}: {last}")
        line_client.reply(reply_token, "\n".join(lines), ch=line_client.CRO)
        return

    m = re.match(r"^view\s+(\d+)$", text_lower)
    if m:
        conv_id = int(m.group(1))
        hist = _get_history(conv_id, limit=15)
        if not hist:
            line_client.reply(reply_token, f"❌ ไม่พบ #{conv_id}", ch=line_client.CRO)
            return
        lines = [f"💬 #{conv_id} (10 ข้อความล่าสุด)"]
        for h in hist:
            if h["sender"] == "customer":
                lines.append(f"L: {h['text'][:200]}")
            elif h["sender"] == "bot":
                conf = f" [{h['confidence']}%]" if h["confidence"] is not None else ""
                cls = f" ({h['classifier']})" if h["classifier"] else ""
                lines.append(f"🤖{conf}{cls}: {h['text'][:200]}")
            elif h["sender"] == "cro":
                lines.append(f"👤{h['cro_name']}: {h['text'][:200]}")
            else:
                lines.append(f"⚙️ {h['text'][:200]}")
        lines.append(f"\nพิมพ์ \"take {conv_id}\" เพื่อรับคุยเอง")
        line_client.reply(reply_token, "\n".join(lines), ch=line_client.CRO)
        return

    m = re.match(r"^take\s+(\d+)$", text_lower)
    if m:
        conv_id = int(m.group(1))
        status, info = _take_over(cro_line_uid, conv_id)
        if status == "taken":
            line_client.reply(
                reply_token,
                f"🔴🔴🔴 LIVE — #{conv_id} 🔴🔴🔴\n"
                f"คุณรับคุยกับลูกค้าแล้ว\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"📤 ทุกข้อความที่พิมพ์ → ส่งลูกค้า\n"
                f"⛔ พิมพ์ /end เพื่อจบ (AI กลับมาดูแล)\n"
                f"━━━━━━━━━━━━━━━━",
                ch=line_client.CRO,
            )
            try:
                line_client.push(info, "👤 เจ้าหน้าที่เข้ามาดูแลแล้วค่ะ — สอบถามได้เลย")
            except Exception:
                log.exception("Failed take-over notice to %s", info)
        elif status == "already_yours":
            line_client.reply(reply_token, f"ℹ️ คุณรับ #{conv_id} อยู่แล้ว", ch=line_client.CRO)
        elif status == "taken_by_other":
            line_client.reply(reply_token, f"❌ #{conv_id} ถูก {info} รับไปแล้ว", ch=line_client.CRO)
        elif status == "not_found":
            line_client.reply(reply_token, f"❌ ไม่พบ #{conv_id}", ch=line_client.CRO)
        return

    active_conv = _conv_owned_by(cro_line_uid)
    if active_conv:
        patient_uid = _patient_uid_for(active_conv)
        if not patient_uid:
            line_client.reply(reply_token, "❌ session หาย", ch=line_client.CRO)
            return
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT cro_id FROM cro_users WHERE line_uid = %s", (cro_line_uid,))
                cro_id = cur.fetchone()[0]
        _save_message(active_conv, "cro", text_stripped, cro_id=cro_id)
        try:
            line_client.push(patient_uid, text_stripped)
        except Exception:
            log.exception("Failed CRO→customer forward conv %s", active_conv)
            line_client.reply(reply_token, "❌ ส่งข้อความไม่สำเร็จ", ch=line_client.CRO)
            return
        line_client.reply(reply_token, f"📤 ส่งให้ #{active_conv}: \"{text_stripped[:60]}\"", ch=line_client.CRO)
        return

    line_client.reply(
        reply_token,
        "คำสั่งที่ใช้ได้:\n"
        "• active / list     — ดู conversations ทั้งหมด\n"
        "• queue             — เฉพาะที่ AI escalate\n"
        "• view <N>          — ดูประวัติ conversation\n"
        "• take <N>          — รับคุยเอง (override AI)\n"
        "• /end              — จบการ take-over\n\n"
        "เมื่ออยู่ใน take-over: ทุกข้อความที่พิมพ์จะส่งให้ลูกค้า",
        ch=line_client.CRO,
    )
