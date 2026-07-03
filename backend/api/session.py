"""Internal session API — read/write Dify conversation_id + AI mode per user."""
from contextlib import contextmanager
from datetime import datetime, timedelta

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from api.health import _require_internal_token
from core.config import BOT_OPS_DB_CONFIG, BOT_SESSION_CONV_TTL_MIN, USE_OWN_RAG, log
from repositories import message_repo
from utils.ai_mode import AUTO_PAUSE_MINUTES, compute_effective

router = APIRouter(prefix="/internal/session")

# --- Message log endpoint (also mounted under /internal/message) ---
message_router = APIRouter(prefix="/internal/message")


class LogMessageRequest(BaseModel):
    channel: str = "line_main"
    external_user_id: str
    text: str
    direction: str = "out"  # 'in' | 'out'
    route_prefix: str | None = None


@message_router.post("")
def log_message(body: LogMessageRequest, x_internal_token: str | None = Header(None)):
    """n8n calls this after Dify replies so we can render chat history."""
    _require_internal_token(x_internal_token)
    if body.direction == "in":
        mid = message_repo.log_inbound(
            channel=body.channel, external_user_id=body.external_user_id, text=body.text,
        )
    else:
        mid = message_repo.log_outbound_ai(
            channel=body.channel, external_user_id=body.external_user_id,
            text=body.text, route_prefix=body.route_prefix,
        )
    return {"ok": True, "id": mid}


@contextmanager
def _db():
    conn = pymysql.connect(**BOT_OPS_DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)
    try:
        yield conn
    finally:
        conn.close()


@router.get("/{channel}/{user_id}")
def get_session(channel: str, user_id: str, x_internal_token: str | None = Header(None)):
    """Return the Dify conversation_id + effective AI mode for this LINE user.
    n8n branches on `effective_mode` before deciding whether to call Dify."""
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id AS session_id,
                       dify_conversation_id,
                       current_state,
                       ai_mode,
                       ai_pause_until,
                       (ai_pause_until IS NOT NULL AND ai_pause_until > NOW()) AS is_paused,
                       last_message_at,
                       TIMESTAMPDIFF(MINUTE, last_message_at, NOW()) AS idle_min
                FROM bot_sessions
                WHERE channel = %s AND external_user_id = %s LIMIT 1
                """,
                (channel, user_id),
            )
            row = cur.fetchone()

    if not row:
        eff = compute_effective(None, None)
        return {
            "session_id": None,
            "dify_conversation_id": None,
            "current_state": "idle",
            "ai_mode": "auto",
            "ai_pause_until": None,
            "use_own_rag": USE_OWN_RAG,
            **eff,
        }

    conv_id = row["dify_conversation_id"]
    idle_min = row.get("idle_min")
    if conv_id and idle_min is not None and idle_min >= BOT_SESSION_CONV_TTL_MIN:
        log.info(
            "Session conv_id expired (idle %s min >= %s): %s/%s — returning None",
            idle_min, BOT_SESSION_CONV_TTL_MIN, channel, user_id,
        )
        conv_id = None

    eff = compute_effective(
        row.get("ai_mode"), row.get("ai_pause_until"),
        db_says_paused=bool(row.get("is_paused")),
    )
    return {
        "session_id": row["session_id"],
        "dify_conversation_id": conv_id,
        "current_state": row["current_state"],
        "ai_mode": row.get("ai_mode") or "auto",
        "ai_pause_until": row["ai_pause_until"].isoformat() if row.get("ai_pause_until") else None,
        "use_own_rag": USE_OWN_RAG,
        **eff,
    }


class PauseRequest(BaseModel):
    minutes: int | None = None  # override default AUTO_PAUSE_MINUTES if given
    trigger_reason: str = "cro_reply"


@router.post("/{channel}/{user_id}/pause")
def pause_session(
    channel: str,
    user_id: str,
    body: PauseRequest,
    x_internal_token: str | None = Header(None),
):
    """Slide the auto-pause window: `ai_pause_until = NOW() + minutes`.
    Called from patient_message_api after CRO sends a message."""
    _require_internal_token(x_internal_token)
    minutes = body.minutes or AUTO_PAUSE_MINUTES
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO bot_sessions (channel, external_user_id, current_state,
                    ai_pause_until, last_message_at)
                VALUES (%s, %s, 'active', DATE_ADD(NOW(), INTERVAL %s MINUTE), NOW())
                ON DUPLICATE KEY UPDATE
                    ai_pause_until  = DATE_ADD(NOW(), INTERVAL %s MINUTE),
                    last_message_at = NOW()
                """,
                (channel, user_id, minutes, minutes),
            )
            cur.execute(
                "SELECT id, ai_pause_until FROM bot_sessions WHERE channel=%s AND external_user_id=%s",
                (channel, user_id),
            )
            sess = cur.fetchone()
            cur.execute(
                """
                INSERT INTO bot_mode_events (session_id, from_mode, to_mode,
                    actor_type, trigger_reason)
                VALUES (%s, NULL, 'paused', 'auto_pause', %s)
                """,
                (sess["id"], body.trigger_reason[:255]),
            )
        conn.commit()
    return {
        "ok": True,
        "pause_until": sess["ai_pause_until"].isoformat() if sess.get("ai_pause_until") else None,
        "minutes": minutes,
    }


class SessionUpdate(BaseModel):
    dify_conversation_id: str = ""
    current_state: str = "active"


@router.post("/{channel}/{user_id}")
def save_session(
    channel: str,
    user_id: str,
    body: SessionUpdate,
    x_internal_token: str | None = Header(None),
):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            if body.dify_conversation_id:
                cur.execute(
                    """
                    INSERT INTO bot_sessions (channel, external_user_id, dify_conversation_id,
                        current_state, last_message_at)
                    VALUES (%s, %s, %s, %s, NOW())
                    ON DUPLICATE KEY UPDATE
                        dify_conversation_id = VALUES(dify_conversation_id),
                        current_state        = VALUES(current_state),
                        last_message_at      = NOW()
                    """,
                    (channel, user_id, body.dify_conversation_id, body.current_state),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO bot_sessions (channel, external_user_id, current_state, last_message_at)
                    VALUES (%s, %s, %s, NOW())
                    ON DUPLICATE KEY UPDATE
                        current_state   = VALUES(current_state),
                        last_message_at = NOW()
                    """,
                    (channel, user_id, body.current_state),
                )
        conn.commit()
    log.info("Session saved: %s/%s", channel, user_id)
    return {"ok": True}
