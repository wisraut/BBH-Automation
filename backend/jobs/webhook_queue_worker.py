"""Background worker that drains the webhook_event_queue.

Two duties:
1. Drain leftover 'pending' rows on startup (in case bridge restarted while
   events were still queued — no add_task fired for them).
2. Periodically requeue rows stuck in 'processing' (server died mid-handler).

Designed to run as one asyncio.create_task() in lifespan. Cancellable.
"""
import asyncio
import logging

from api.line_webhook import _process_queued_event
from repositories import webhook_queue_repo


log = logging.getLogger("webhook_queue_worker")


async def _process_one(queue_id: int) -> None:
    try:
        await _process_queued_event(queue_id)
    except Exception:
        log.exception("queue worker crashed on id=%s", queue_id)


async def _drain_pending() -> int:
    rows = webhook_queue_repo.list_pending(limit=50)
    for r in rows:
        await _process_one(int(r["id"]))
    return len(rows)


async def _requeue_stuck() -> int:
    stuck = webhook_queue_repo.list_stuck(older_than_minutes=5)
    for r in stuck:
        webhook_queue_repo.reset_for_retry(int(r["id"]))
        await _process_one(int(r["id"]))
    return len(stuck)


async def start_worker(interval_seconds: int = 30) -> None:
    log.info("Webhook queue worker started (interval=%ds)", interval_seconds)
    # On startup drain whatever was left behind by the previous process.
    try:
        n = await _drain_pending()
        if n:
            log.info("Drained %d pending webhook events on startup", n)
    except Exception:
        log.exception("startup drain failed")

    while True:
        try:
            await asyncio.sleep(interval_seconds)
            n_stuck = await _requeue_stuck()
            if n_stuck:
                log.warning("Requeued %d stuck webhook events", n_stuck)
            # Also drain any 'pending' rows that somehow lost their add_task
            # (shouldn't happen in steady state but cheap to check).
            await _drain_pending()
        except asyncio.CancelledError:
            log.info("Webhook queue worker stopped")
            raise
        except Exception:
            log.exception("queue worker iteration failed")
