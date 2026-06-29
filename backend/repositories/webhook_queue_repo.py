"""Persistent queue for inbound LINE webhook events.

Workflow:
    1. enqueue(event)            -- on /webhook receipt, before LINE gets 200
    2. claim_pending(...) → rows -- picked by background processor
    3. mark_done(id) | mark_failed(id, err, retryable)
    4. requeue_stuck(...)        -- run periodically; rescues 'processing' rows
                                    that locked > N minutes ago (crash recovery)
"""
import json
from typing import Any

from core.mysql import mysql_db


MAX_ATTEMPTS = 5


def enqueue(
    *,
    channel: str,
    webhook_event_id: str | None,
    event: dict[str, Any],
) -> int | None:
    """Insert one row. Returns id or None if duplicate webhook_event_id.

    Duplicate dedup happens via UNIQUE KEY on webhook_event_id — LINE may
    retry the same event if it didn't get 200 fast enough.
    """
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO webhook_event_queue (channel, webhook_event_id, event_json)
                    VALUES (%s, %s, %s)
                    """,
                    (channel, webhook_event_id, json.dumps(event)),
                )
                rowid = cur.lastrowid
            conn.commit()
        return int(rowid) if rowid else None
    except Exception:
        # Most common cause: duplicate webhook_event_id (LINE retried).
        # Other errors mean DB is broken; caller should fall back to
        # in-process handling so the user is not left in silence.
        return None


def claim(queue_id: int) -> dict[str, Any] | None:
    """Atomically move a single row to status='processing' if it is still
    'pending'. Returns the claimed row (with event_json decoded) or None
    if the row was already claimed by another worker / not in pending.
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE webhook_event_queue
                SET status = 'processing',
                    locked_at = NOW(),
                    attempts = attempts + 1
                WHERE id = %s AND status = 'pending'
                """,
                (queue_id,),
            )
            if rows == 0:
                conn.commit()
                return None
            cur.execute(
                "SELECT id, channel, webhook_event_id, event_json, attempts "
                "FROM webhook_event_queue WHERE id = %s",
                (queue_id,),
            )
            row = cur.fetchone()
        conn.commit()
    if row:
        v = row.get("event_json")
        if isinstance(v, (bytes, bytearray)):
            v = v.decode("utf-8")
        if isinstance(v, str):
            try:
                row["event_json"] = json.loads(v)
            except Exception:
                row["event_json"] = None
    return row


def mark_done(queue_id: int) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE webhook_event_queue SET status='done', processed_at=NOW() "
                "WHERE id=%s",
                (queue_id,),
            )
        conn.commit()


def mark_failed(queue_id: int, error: str, *, retryable: bool = True) -> None:
    """If retryable and attempts < MAX_ATTEMPTS, set back to pending so the
    requeue loop picks it up. Otherwise mark 'failed' so admin can inspect.
    """
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT attempts FROM webhook_event_queue WHERE id=%s", (queue_id,))
            row = cur.fetchone()
            attempts = int(row["attempts"]) if row else 0
            if retryable and attempts < MAX_ATTEMPTS:
                cur.execute(
                    "UPDATE webhook_event_queue SET status='pending', locked_at=NULL, "
                    "last_error=%s WHERE id=%s",
                    (error[:1000], queue_id),
                )
            else:
                cur.execute(
                    "UPDATE webhook_event_queue SET status='failed', last_error=%s, "
                    "processed_at=NOW() WHERE id=%s",
                    (error[:1000], queue_id),
                )
        conn.commit()


def list_stuck(*, older_than_minutes: int = 5, limit: int = 50) -> list[dict[str, Any]]:
    """Find 'processing' rows that probably belong to a dead server."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, channel, webhook_event_id, attempts
                FROM webhook_event_queue
                WHERE status='processing'
                  AND locked_at < NOW() - INTERVAL %s MINUTE
                ORDER BY id ASC
                LIMIT %s
                """,
                (older_than_minutes, limit),
            )
            return cur.fetchall()


def reset_for_retry(queue_id: int) -> None:
    """Drop a stuck/orphaned row back to pending so it can be re-claimed."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE webhook_event_queue SET status='pending', locked_at=NULL "
                "WHERE id=%s AND status='processing'",
                (queue_id,),
            )
        conn.commit()


def list_pending(*, limit: int = 50) -> list[dict[str, Any]]:
    """Pending rows (e.g. after server restart). Bridge background worker
    uses this to drain rows that were enqueued but never had a task fired."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM webhook_event_queue WHERE status='pending' "
                "ORDER BY id ASC LIMIT %s",
                (limit,),
            )
            return cur.fetchall()
