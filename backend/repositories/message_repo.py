"""Chat message log — booking_messages table.

Every LINE message (inbound from patient, outbound from AI/CRO/system) is
logged here so the CRO web dashboard can render a chat history. Existing
table schema (from 001_bot_ops_schema.sql) — no migration needed:
    direction ENUM('in','out','system'), message_text, dify_answer,
    route_prefix, session_id FK, booking_request_id FK NULLABLE.
"""
import json
from typing import Any

from core.mysql import mysql_db


def _get_or_create_session(channel: str, external_user_id: str) -> int:
    """หา bot_sessions ของ (channel, external_user_id) ถ้าไม่มีสร้างใหม่ (upsert
    ด้วย ON DUPLICATE KEY) + bump last_message_at คืน session id ไว้ผูก message."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO bot_sessions (channel, external_user_id, current_state, last_message_at)
                VALUES (%s, %s, 'active', NOW())
                ON DUPLICATE KEY UPDATE last_message_at = NOW()
                """,
                (channel, external_user_id),
            )
            cur.execute(
                "SELECT id FROM bot_sessions WHERE channel=%s AND external_user_id=%s",
                (channel, external_user_id),
            )
            row = cur.fetchone()
        conn.commit()
    return row["id"]


def log_inbound(
    *, channel: str, external_user_id: str, text: str,
    raw_payload: dict | None = None,
) -> int | None:
    """Patient → system (LINE webhook)."""
    try:
        sess_id = _get_or_create_session(channel, external_user_id)
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO booking_messages
                        (session_id, direction, message_type, message_text, raw_payload)
                    VALUES (%s, 'in', 'text', %s, %s)
                    """,
                    (sess_id, text, json.dumps(raw_payload) if raw_payload else None),
                )
                mid = cur.lastrowid
            conn.commit()
        return mid
    except Exception:
        return None


def log_outbound_ai(
    *, channel: str, external_user_id: str, text: str,
    route_prefix: str | None = None, raw_payload: dict | None = None,
) -> int | None:
    """System → patient (AI reply via Dify)."""
    try:
        sess_id = _get_or_create_session(channel, external_user_id)
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO booking_messages
                        (session_id, direction, message_type, message_text, dify_answer,
                         route_prefix, raw_payload)
                    VALUES (%s, 'out', 'text', %s, %s, %s, %s)
                    """,
                    (sess_id, text, text, route_prefix,
                     json.dumps(raw_payload) if raw_payload else None),
                )
                mid = cur.lastrowid
            conn.commit()
        return mid
    except Exception:
        return None


def log_outbound_cro(
    *, channel: str, external_user_id: str, text: str,
    actor_user_id: int | None = None,
) -> int | None:
    """System → patient (CRO manual reply)."""
    try:
        sess_id = _get_or_create_session(channel, external_user_id)
        raw = {"cro_user_id": actor_user_id} if actor_user_id is not None else None
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO booking_messages
                        (session_id, direction, message_type, message_text,
                         route_prefix, raw_payload)
                    VALUES (%s, 'out', 'text', %s, 'CRO_MANUAL', %s)
                    """,
                    (sess_id, text, json.dumps(raw) if raw else None),
                )
                mid = cur.lastrowid
            conn.commit()
        return mid
    except Exception:
        return None


def list_by_patient(patient_id: int, limit: int = 100) -> list[dict]:
    """Fetch recent chat history for a patient by joining booking_requests → session."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT bs.id
                FROM bot_sessions bs
                JOIN booking_requests br ON br.session_id = bs.id
                WHERE br.patient_id = %s
                UNION
                SELECT bs.id
                FROM bot_sessions bs
                WHERE bs.external_user_id IN (
                    SELECT DISTINCT external_user_id
                    FROM booking_requests
                    WHERE patient_id = %s
                      AND external_user_id IS NOT NULL AND external_user_id <> ''
                )
                """,
                (patient_id, patient_id),
            )
            sess_ids = [r["id"] for r in cur.fetchall()]
            if not sess_ids:
                return []
            placeholders = ",".join(["%s"] * len(sess_ids))
            cur.execute(
                f"""
                SELECT id, session_id, direction, message_type, message_text,
                       dify_answer, route_prefix, raw_payload, created_at
                FROM booking_messages
                WHERE session_id IN ({placeholders})
                ORDER BY created_at DESC LIMIT %s
                """,
                (*sess_ids, limit),
            )
            rows = list(cur.fetchall())
    return rows[::-1]
