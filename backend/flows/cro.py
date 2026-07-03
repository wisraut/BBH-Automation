"""
CRO Monitoring + Override flow (Phase 1A v2 + Booking 1A.5)

- LINE #1 (public): customer ส่ง message → AI ตอบ (role=public_inquiry)
                    → AUTO / ESCALATE / BOOKING_ASK / BOOKING_DONE
- LINE #2 (cro):    CRO commands — active/list/queue/view/take/end + forward ตอน take-over

Customer↔CRO chat relay ระหว่าง 2 channels:
- LINE #1 → bridge → forward → LINE #2 (CRO เห็น)
- LINE #2 → bridge → forward → LINE #1 (customer ได้รับ)
"""
import json
import re

from psycopg2.extras import RealDictCursor

from core.config import log
from core.db import get_db
from integrations import calendar_client, line_client
from flows import routing
from rag import service as rag_service


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
                """SELECT conv_id, status, taken_by, dify_conversation_id
                   FROM conversations
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
                "RETURNING conv_id, status, taken_by, dify_conversation_id",
                (patient_uid,),
            )
            new = cur.fetchone()
            conn.commit()
            return dict(new)


def _save_booking(conv_id: int, patient_uid: str, data: dict,
                  start_at=None, end_at=None, google_event_id: str = None,
                  calendar_link: str = None, status: str = "pending") -> int:
    """บันทึก booking ลง DB + return booking_id"""
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO bookings
                   (conv_id, patient_uid, name, phone, preferred_date, preferred_time,
                    symptom, raw_data, start_at, end_at, google_event_id, calendar_link, status)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   RETURNING booking_id""",
                (
                    conv_id, patient_uid,
                    data.get("name"), data.get("phone"),
                    data.get("date"), data.get("time"),
                    data.get("symptom"),
                    json.dumps(data, ensure_ascii=False),
                    start_at, end_at, google_event_id, calendar_link, status,
                ),
            )
            booking_id = cur.fetchone()[0]
            cur.execute(
                """INSERT INTO audit_log (event, actor, target, meta)
                   VALUES ('booking_created', %s, %s, %s)""",
                (patient_uid, str(booking_id), json.dumps({**data, "status": status},
                                                          ensure_ascii=False)),
            )
            conn.commit()
            return booking_id


def _try_auto_book(data: dict) -> tuple:
    """
    Parse date/time + book Google Calendar.
    Returns: (status, start_at, end_at, event_id, link)
      status: 'booked' | 'slot_busy' | 'parse_failed' | 'not_configured' | 'api_error'
    """
    if not calendar_client.is_configured():
        return ("not_configured", None, None, None, None)

    start = calendar_client.parse_thai_datetime(data.get("date", ""), data.get("time", ""))
    if not start:
        return ("parse_failed", None, None, None, None)

    if not calendar_client.check_availability(start):
        end = start + __import__("datetime").timedelta(minutes=calendar_client.DEFAULT_DURATION_MIN)
        return ("slot_busy", start, end, None, None)

    summary = f"นัด — {data.get('name','คนไข้')}"
    description = (
        f"จองผ่าน LINE bot\n"
        f"ชื่อ: {data.get('name','-')}\n"
        f"เบอร์: {data.get('phone','-')}\n"
        f"อาการ: {data.get('symptom','-')}"
    )
    try:
        result = calendar_client.book_event(summary, description, start)
        return ("booked", result["start"], result["end"], result["event_id"], result["html_link"])
    except Exception as e:
        log.exception("Auto-book failed: %s", e)
        return ("api_error", start, None, None, None)


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
    icon = "URGENT" if escalated else "New"
    label = "ตอบไม่ได้" if escalated else "AI ตอบอยู่"
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
    - ไม่งั้น → AI ตอบ (multi-turn ผ่าน dify_conversation_id)
      decision: auto / escalate / booking_ask / booking_done
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
                line_client.push(cro["line_uid"], f"#{conv_id}:\n{text}", ch=line_client.CRO)
            except Exception:
                log.exception("Failed forward customer→CRO conv %s", conv_id)
            return
        # CRO logged out → release conversation, fall through to AI
        log.warning("CRO #%s offline for conv %s — releasing back to AI", convo["taken_by"], conv_id)
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE conversations SET status='active', taken_by=NULL, taken_at=NULL "
                    "WHERE conv_id = %s",
                    (conv_id,),
                )
                conn.commit()

    line_client.reply(reply_token, "กำลังตรวจสอบให้ครับ/ค่ะ…")
    # Own RAG replaces Dify here. It keeps its own short-term memory keyed by
    # external_user_id (rag.memory), so no conversation_id round-trip is needed.
    result = rag_service.answer("line_main", patient_uid, text)
    answer = result.get("raw") or result.get("answer") or ""

    decision, classifier, body = routing.parse_decision(answer)

    if decision == "escalate":
        _save_message(conv_id, "bot", body or text, classifier=classifier, confidence=0)
        try:
            line_client.push(patient_uid, "รับเรื่องแล้วครับ/ค่ะ เจ้าหน้าที่จะติดต่อกลับโดยเร็วที่สุด")
        except Exception:
            log.exception("Failed escalate notice to customer %s", patient_uid)
        _notify_team(conv_id, patient_uid, text, escalated=True)
        log.info("Public inquiry escalated — conv #%s (%s)", conv_id, classifier)
        return

    if decision == "booking_ask":
        _save_message(conv_id, "bot", body, classifier="booking", confidence=100)
        try:
            line_client.push(patient_uid, body)
        except Exception:
            log.exception("Failed booking_ask push to %s", patient_uid)
        log.info("Booking ask — conv #%s: %s", conv_id, body[:60])
        return

    if decision == "booking_done":
        try:
            data = json.loads(body)
        except Exception:
            log.exception("Failed parse booking_done JSON: %s", body[:200])
            _save_message(conv_id, "bot", "ขออภัย ระบบประมวลผลข้อมูลไม่สำเร็จ จะให้เจ้าหน้าที่ติดต่อกลับนะคะ",
                          classifier="booking_error", confidence=0)
            line_client.push(patient_uid, "รับเรื่องแล้วครับ/ค่ะ เจ้าหน้าที่จะติดต่อกลับ")
            _notify_team(conv_id, patient_uid, text, escalated=True)
            return

        book_status, start_at, end_at, event_id, cal_link = _try_auto_book(data)

        if book_status == "booked":
            booking_id = _save_booking(conv_id, patient_uid, data,
                                        start_at=start_at, end_at=end_at,
                                        google_event_id=event_id, calendar_link=cal_link,
                                        status="booked")
            confirm_msg = (
                f"จองคิวสำเร็จ #{booking_id}\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"ชื่อ: {data.get('name','-')}\n"
                f"เบอร์: {data.get('phone','-')}\n"
                f"วัน: {start_at.strftime('%d/%m/%Y (%a)')}\n"
                f"เวลา: {start_at.strftime('%H:%M')}-{end_at.strftime('%H:%M')}\n"
                f"อาการ: {data.get('symptom','-')}\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"เจ้าหน้าที่จะติดต่อยืนยันก่อนวันนัด"
            )
            _save_message(conv_id, "bot", confirm_msg, classifier="booking", confidence=100)
            line_client.push(patient_uid, confirm_msg)
            _notify_booking(booking_id, data, conv_id, patient_uid, status="booked",
                             start_at=start_at, cal_link=cal_link)
            log.info("Booking auto-booked — #%s (conv %s) %s", booking_id, conv_id, start_at)
            return

        if book_status == "slot_busy":
            busy_msg = (
                f"ขออภัย เวลา {data.get('date','-')} {data.get('time','-')} ไม่ว่างค่ะ\n"
                f"กรุณาเลือกวัน-เวลาอื่น หรือพิมพ์ \"จองคิว\" เพื่อเริ่มใหม่"
            )
            _save_message(conv_id, "bot", busy_msg, classifier="booking_busy", confidence=100)
            line_client.push(patient_uid, busy_msg)
            log.info("Booking slot busy — conv %s at %s", conv_id, start_at)
            return

        # parse_failed / not_configured / api_error → save as pending + notify CRO
        booking_id = _save_booking(conv_id, patient_uid, data, status="pending")
        confirm_msg = (
            f"รับเรื่องจองคิว #{booking_id} แล้วค่ะ\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"ชื่อ: {data.get('name','-')}\n"
            f"เบอร์: {data.get('phone','-')}\n"
            f"วัน: {data.get('date','-')}\n"
            f"เวลา: {data.get('time','-')}\n"
            f"อาการ: {data.get('symptom','-')}\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"เจ้าหน้าที่จะติดต่อยืนยันโดยเร็วที่สุด"
        )
        _save_message(conv_id, "bot", confirm_msg, classifier="booking", confidence=100)
        line_client.push(patient_uid, confirm_msg)
        _notify_booking(booking_id, data, conv_id, patient_uid, status=book_status)
        log.warning("Booking saved but not auto-booked — #%s status=%s", booking_id, book_status)
        return

    # decision == "auto"
    _save_message(conv_id, "bot", body or answer, classifier=classifier, confidence=100)
    try:
        line_client.push(patient_uid, body or answer)
    except Exception:
        log.exception("Failed bot answer push to %s", patient_uid)
    if is_first_msg:
        _notify_team(conv_id, patient_uid, text, escalated=False)
    log.info("Public inquiry auto-answered — conv #%s", conv_id)


def _notify_booking(booking_id: int, data: dict, conv_id: int, patient_uid: str,
                    status: str = "pending", start_at=None, cal_link: str = None) -> None:
    """แจ้ง CRO team — auto-booked หรือ pending (รอ confirm)"""
    if status == "booked":
        header = f"จองคิวสำเร็จ #BK-{booking_id}"
        when = f"วัน: {start_at.strftime('%d/%m/%Y (%a) %H:%M')}" if start_at else ""
        footer = f"Calendar: {cal_link}\nพิมพ์ \"take {conv_id}\" เพื่อคุยกับลูกค้าต่อ" if cal_link \
                 else f"พิมพ์ \"take {conv_id}\" เพื่อคุยกับลูกค้าต่อ"
    else:
        reason = {
            "parse_failed":   "(parse วัน-เวลาไม่ได้)",
            "not_configured": "(Calendar ยังไม่ตั้ง)",
            "api_error":      "(Calendar API error)",
        }.get(status, "")
        header = f"จองคิวใหม่ #BK-{booking_id} — รอ confirm {reason}"
        when = f"วัน: {data.get('date','-')}  เวลา: {data.get('time','-')}"
        footer = f"กรุณาเปิด Calendar จองเอง\nพิมพ์ \"take {conv_id}\" เพื่อคุยกับลูกค้า"

    text = (
        f"{header}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"ชื่อ: {data.get('name','-')}\n"
        f"เบอร์: {data.get('phone','-')}\n"
        f"{when}\n"
        f"อาการ: {data.get('symptom','-')}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"{footer}"
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
            log.exception("Failed booking notification to CRO %s", uid)


def handle_team_command(reply_token: str, cro_line_uid: str, text: str) -> None:
    """CRO commands ใน LINE #2 — active/list/queue/view/take/end + forward"""
    text_stripped = text.strip()
    text_lower = text_stripped.lower()

    if text_lower in ("/end", "end"):
        count, uids = _end_take_over(cro_line_uid)
        if count == 0:
            line_client.reply(reply_token, "ไม่มี session ที่กำลังคุยอยู่", ch=line_client.CRO)
        else:
            for uid in uids:
                try:
                    line_client.push(uid, "ขอบคุณที่ติดต่อค่ะ AI กำลังดูแลต่อ — มีอะไรถามต่อได้นะคะ")
                except Exception:
                    log.exception("Failed end-of-takeover notice to %s", uid)
            line_client.reply(reply_token, f"จบ take-over {count} session — AI กลับมาดูแลต่อ", ch=line_client.CRO)
        return

    if text_lower in ("active", "list"):
        rows = _list_active(limit=10)
        if not rows:
            line_client.reply(reply_token, "ไม่มี conversation active", ch=line_client.CRO)
            return
        lines = ["Active sessions:"]
        for r in rows:
            tag = "LIVE" if r["status"] == "taken_over" else "AI"
            owner = f" ({r['taken_by_name']})" if r["taken_by_name"] else ""
            last = (r["last_msg"] or "")[:40]
            lines.append(f"{tag}{owner} #{r['conv_id']}: {last}")
        lines.append("\nพิมพ์ \"view N\" ดูประวัติ / \"take N\" รับคุยเอง")
        line_client.reply(reply_token, "\n".join(lines), ch=line_client.CRO)
        return

    if text_lower == "queue":
        rows = [r for r in _list_active(limit=20) if not r["taken_by_name"]]
        if not rows:
            line_client.reply(reply_token, "ไม่มี conversation ที่ AI escalate", ch=line_client.CRO)
            return
        lines = ["Escalated / AI ตอบอยู่:"]
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
            line_client.reply(reply_token, f"ไม่พบ #{conv_id}", ch=line_client.CRO)
            return
        lines = [f"#{conv_id} (10 ข้อความล่าสุด)"]
        for h in hist:
            if h["sender"] == "customer":
                lines.append(f"L: {h['text'][:200]}")
            elif h["sender"] == "bot":
                conf = f" [{h['confidence']}%]" if h["confidence"] is not None else ""
                cls = f" ({h['classifier']})" if h["classifier"] else ""
                lines.append(f"{conf}{cls}: {h['text'][:200]}")
            elif h["sender"] == "cro":
                lines.append(f"{h['cro_name']}: {h['text'][:200]}")
            else:
                lines.append(f"{h['text'][:200]}")
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
                f"LIVE — #{conv_id} \n"
                f"คุณรับคุยกับลูกค้าแล้ว\n"
                f"━━━━━━━━━━━━━━━━\n"
                f"ทุกข้อความที่พิมพ์ → ส่งลูกค้า\n"
                f"พิมพ์ /end เพื่อจบ (AI กลับมาดูแล)\n"
                f"━━━━━━━━━━━━━━━━",
                ch=line_client.CRO,
            )
            try:
                line_client.push(info, "เจ้าหน้าที่เข้ามาดูแลแล้วค่ะ — สอบถามได้เลย")
            except Exception:
                log.exception("Failed take-over notice to %s", info)
        elif status == "already_yours":
            line_client.reply(reply_token, f"คุณรับ #{conv_id} อยู่แล้ว", ch=line_client.CRO)
        elif status == "taken_by_other":
            line_client.reply(reply_token, f"#{conv_id} ถูก {info} รับไปแล้ว", ch=line_client.CRO)
        elif status == "not_found":
            line_client.reply(reply_token, f"ไม่พบ #{conv_id}", ch=line_client.CRO)
        return

    active_conv = _conv_owned_by(cro_line_uid)
    if active_conv:
        patient_uid = _patient_uid_for(active_conv)
        if not patient_uid:
            line_client.reply(reply_token, "session หาย", ch=line_client.CRO)
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
            line_client.reply(reply_token, "ส่งข้อความไม่สำเร็จ", ch=line_client.CRO)
            return
        line_client.reply(reply_token, f"ส่งให้ #{active_conv}: \"{text_stripped[:60]}\"", ch=line_client.CRO)
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
