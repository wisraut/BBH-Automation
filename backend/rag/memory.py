"""Conversation memory — last N turns for a LINE user, from booking_messages.

Gives the LLM short-term context so multi-turn chats (e.g. a booking in
progress) make sense. We look up the user's most recent bot_session and
read its recent messages.
"""
from core.mysql import mysql_db


def load_history(external_user_id: str, limit: int = 6) -> list[dict]:
    """Return recent turns oldest-first: [{'role': 'user'|'assistant', 'text': ...}]."""
    if not external_user_id:
        return []
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM bot_sessions WHERE external_user_id = %s "
                "ORDER BY updated_at DESC LIMIT 1",
                (external_user_id,),
            )
            row = cur.fetchone()
            if not row:
                return []
            cur.execute(
                """
                SELECT direction, COALESCE(message_text, dify_answer) AS text
                FROM booking_messages
                WHERE session_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (row["id"], limit),
            )
            rows = list(cur.fetchall())
    rows.reverse()
    return [
        {"role": "user" if r["direction"] == "in" else "assistant", "text": r["text"]}
        for r in rows
        if r["text"]
    ]
