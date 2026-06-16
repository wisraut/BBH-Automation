"""Internal session API — read/write Dify conversation_id per user."""
from contextlib import contextmanager

import pymysql
from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel

from api.health import _require_internal_token
from core.config import BOT_OPS_DB_CONFIG, log

router = APIRouter(prefix="/internal/session")


@contextmanager
def _db():
    conn = pymysql.connect(**BOT_OPS_DB_CONFIG, cursorclass=pymysql.cursors.DictCursor)
    try:
        yield conn
    finally:
        conn.close()


@router.get("/{channel}/{user_id}")
def get_session(channel: str, user_id: str, x_internal_token: str | None = Header(None)):
    _require_internal_token(x_internal_token)
    with _db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT dify_conversation_id, current_state FROM bot_sessions "
                "WHERE channel = %s AND external_user_id = %s LIMIT 1",
                (channel, user_id),
            )
            row = cur.fetchone()
    return {
        "dify_conversation_id": row["dify_conversation_id"] if row else None,
        "current_state": row["current_state"] if row else "idle",
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
