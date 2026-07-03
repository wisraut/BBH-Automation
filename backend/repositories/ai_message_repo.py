"""Web dashboard AI chat history — ai_conversations + ai_messages.

Reuses the Phase-2 schema (migrations 0018/0019). The staff assistant now calls
our own LLM (rag/llm.py) which is stateless per request, so we persist turns
here to give a conversation short-term memory.

A conversation is addressed by an opaque string token (stored in
ai_conversations.dify_conversation_id, repurposed as a provider-agnostic id) so
the frontend contract — send/receive a `conversation_id` string — is unchanged.
"""
import uuid

from core.mysql import mysql_db


def get_or_create(
    external_token: str, *, user_id: int, patient_id: int | None
) -> tuple[int, str]:
    """Resolve an external conversation token to its integer PK, creating a new
    conversation when the token is empty or unknown. Returns (pk, token)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            if external_token:
                # Scope by user_id so one staff member cannot resume another's
                # conversation by supplying their token (IDOR). A token that
                # doesn't belong to this user simply falls through to create a
                # fresh conversation.
                cur.execute(
                    "SELECT id FROM ai_conversations "
                    "WHERE dify_conversation_id = %s AND user_id = %s",
                    (external_token, user_id),
                )
                row = cur.fetchone()
                if row:
                    return row["id"], external_token
            token = external_token or uuid.uuid4().hex
            # context_patient_id is best-effort metadata guarded by a FK; resolve
            # it via subquery so an unknown patient_id stores NULL instead of
            # raising an IntegrityError that would 500 the chat request.
            cur.execute(
                "INSERT INTO ai_conversations "
                "(user_id, dify_conversation_id, context_patient_id) "
                "VALUES (%s, %s, (SELECT id FROM patients WHERE id = %s))",
                (user_id, token, patient_id),
            )
            new_id = cur.lastrowid
        conn.commit()
    return new_id, token


def load_history(conversation_pk: int, *, limit: int = 10) -> list[dict[str, str]]:
    """Recent turns for a conversation, oldest-first: [{'role','content'}]."""
    if not conversation_pk:
        return []
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role, content FROM ai_messages "
                "WHERE conversation_id = %s ORDER BY id DESC LIMIT %s",
                (conversation_pk, limit),
            )
            rows = list(cur.fetchall())
    rows.reverse()
    return [{"role": r["role"], "content": r["content"]} for r in rows if r["content"]]


def save_turn(*, conversation_pk: int, role: str, content: str) -> None:
    """Persist one turn. Best-effort — never raise into the request path."""
    if not content:
        return
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO ai_messages (conversation_id, role, content) "
                    "VALUES (%s, %s, %s)",
                    (conversation_pk, role, content),
                )
            conn.commit()
    except Exception:
        pass
