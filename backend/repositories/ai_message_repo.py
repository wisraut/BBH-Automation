"""Web dashboard AI chat history — ai_conversations + ai_messages.

Reuses the Phase-2 schema (migrations 0018/0019). The staff assistant now calls
our own LLM (rag/llm.py) which is stateless per request, so we persist turns
here to give a conversation short-term memory.

A conversation is addressed by an opaque string token (stored in
ai_conversations.dify_conversation_id, repurposed as a provider-agnostic id) so
the frontend contract — send/receive a `conversation_id` string — is unchanged.
"""
import json
import logging
import uuid

from core.mysql import mysql_db

log = logging.getLogger("ai_message_repo")


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
    """Recent turns for the LLM, oldest-first: [{'role','content'}]. Content is the
    ORIGINAL (unredacted) text as the staff typed it — the caller PDPA-masks it
    before it leaves for the external model (redact-on-send, not on-store)."""
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


def load_messages(conversation_pk: int) -> list[dict]:
    """All turns of a conversation for DISPLAY (oldest-first), including the image
    thumbnail and any textbook citations. Shape matches the frontend ChatMessage:
    {id, role, text, imageThumb, bookSources, ts}."""
    if not conversation_pk:
        return []
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, role, content, image_thumb, book_sources, created_at "
                "FROM ai_messages WHERE conversation_id = %s ORDER BY id ASC",
                (conversation_pk,),
            )
            rows = list(cur.fetchall())
    return [
        {
            "id": str(r["id"]),
            "role": r["role"],
            "text": r["content"] or "",
            "imageThumb": r["image_thumb"],
            "bookSources": _decode_book_sources(r["book_sources"]),
            "ts": r["created_at"].isoformat() if r["created_at"] else None,
        }
        for r in rows
    ]


def _decode_book_sources(value) -> list[dict]:
    """book_sources is stored as JSON. Depending on the MySQL driver/config it may
    come back as a decoded list, a str, or bytes — normalize to a list (same
    concern as alert_repo._decode_json_field). Never let a malformed value break
    history loading, and drop any element that isn't a citation object with a
    title so the frontend never renders a blank source line."""
    if not value:
        return []
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return []
    if not isinstance(value, list):
        return []
    return [s for s in value if isinstance(s, dict) and s.get("title")]


def save_exchange(
    *,
    conversation_pk: int,
    user_content: str,
    assistant_content: str,
    image_thumb: str | None = None,
    book_sources: list[dict] | None = None,
    title: str | None = None,
) -> None:
    """Persist a full turn (user + assistant) ATOMICALLY in one transaction, plus
    the updated_at bump and first-message title, so a mid-write failure can't leave
    a half-saved conversation (user question with no answer). Best-effort at the
    call site, but a failure is LOGGED (not silently swallowed) so lost writes are
    observable — important for a hospital's audit posture. book_sources (textbook
    citations) ride on the assistant row so the footnote survives reload."""
    sources_json = json.dumps(book_sources, ensure_ascii=False) if book_sources else None
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                if user_content or image_thumb:
                    cur.execute(
                        "INSERT INTO ai_messages (conversation_id, role, content, image_thumb) "
                        "VALUES (%s, 'user', %s, %s)",
                        (conversation_pk, user_content or "", image_thumb),
                    )
                if assistant_content:
                    cur.execute(
                        "INSERT INTO ai_messages (conversation_id, role, content, book_sources) "
                        "VALUES (%s, 'assistant', %s, %s)",
                        (conversation_pk, assistant_content, sources_json),
                    )
                # Bump recency (sidebar order) + seed the title from the first
                # message, all in the same transaction.
                cur.execute(
                    "UPDATE ai_conversations SET updated_at = NOW() WHERE id = %s",
                    (conversation_pk,),
                )
                if title:
                    cur.execute(
                        "UPDATE ai_conversations SET title = %s "
                        "WHERE id = %s AND (title IS NULL OR title = '')",
                        (title[:255], conversation_pk),
                    )
            conn.commit()
    except Exception:
        log.exception("save_exchange failed for conversation_pk=%s", conversation_pk)


def list_conversations(user_id: int) -> list[dict]:
    """A user's conversations for the sidebar, most-recent first. Joins the pinned
    patient (context_patient_id) so the UI can show the HN/name chip."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            # Fall back to the first user message when title is empty so older
            # conversations (created before titles were stored) still get a label.
            cur.execute(
                "SELECT c.dify_conversation_id AS token, "
                "       COALESCE(NULLIF(c.title, ''), "
                "         (SELECT LEFT(m.content, 80) FROM ai_messages m "
                "          WHERE m.conversation_id = c.id AND m.role = 'user' AND m.content <> '' "
                "          ORDER BY m.id ASC LIMIT 1), '') AS title, "
                "       c.updated_at, c.context_patient_id AS pid, p.hn, p.display_name "
                "FROM ai_conversations c "
                "LEFT JOIN patients p ON p.id = c.context_patient_id "
                "WHERE c.user_id = %s "
                "ORDER BY c.updated_at DESC, c.id DESC",
                (user_id,),
            )
            rows = list(cur.fetchall())
    return [
        {
            "id": r["token"],
            "title": r["title"] or "",
            "updatedAt": r["updated_at"].isoformat() if r["updated_at"] else None,
            "pinnedPatient": (
                {"id": r["pid"], "hn": r["hn"], "display_name": r["display_name"]}
                if r["pid"]
                else None
            ),
        }
        for r in rows
    ]


def resolve_pk(token: str, user_id: int) -> int | None:
    """Integer PK for a conversation token owned by user_id, or None (IDOR guard)."""
    if not token:
        return None
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM ai_conversations "
                "WHERE dify_conversation_id = %s AND user_id = %s",
                (token, user_id),
            )
            row = cur.fetchone()
    return row["id"] if row else None


def delete_conversation(token: str, user_id: int) -> bool:
    """Delete a conversation (messages cascade). Scoped by user_id. Returns True if
    a row was removed."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM ai_conversations "
                "WHERE dify_conversation_id = %s AND user_id = %s",
                (token, user_id),
            )
            affected = cur.rowcount
        conn.commit()
    return affected > 0


def set_pinned_patient(token: str, user_id: int, patient_id: int | None) -> bool:
    """Update the conversation's pinned patient (context_patient_id). patient_id via
    subquery so an unknown id stores NULL instead of raising. Scoped by user_id.
    Returns True when the conversation EXISTS and is owned (via resolve_pk), not by
    rowcount — MySQL reports 0 affected rows when re-pinning the same patient, which
    must not be mistaken for 'not found'."""
    pk = resolve_pk(token, user_id)
    if pk is None:
        return False
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE ai_conversations "
                "SET context_patient_id = (SELECT id FROM patients WHERE id = %s) "
                "WHERE id = %s",
                (patient_id, pk),
            )
        conn.commit()
    return True
