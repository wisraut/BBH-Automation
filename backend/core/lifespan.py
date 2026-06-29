"""FastAPI lifespan startup/shutdown hooks."""
import asyncio
from contextlib import asynccontextmanager

from core.config import CRO_CHANNEL_ENABLED, DB_CONFIG, PUBLIC_URL, SERVER_PORT, log
from core.db import get_db
from flows import doctor
from jobs import admin_alert_evaluator, email_poller, webhook_queue_worker


def _startup_reset() -> None:
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE doctors SET line_uid = NULL")
            cur.execute("UPDATE patients SET line_uid = NULL, dify_conversation_id = NULL")
            cur.execute("UPDATE cro_users SET line_uid = NULL")
            cur.execute(
                "UPDATE conversations SET status='active', taken_by=NULL, taken_at=NULL "
                "WHERE status='taken_over'"
            )
            cur.execute("UPDATE reports SET status = NULL WHERE status = 'analyzing'")
            conn.commit()


@asynccontextmanager
async def lifespan(app):
    try:
        _startup_reset()
        log.info(
            "Startup reset: sessions cleared (doctor + patient + CRO), "
            "conversations released, stuck reports unlocked"
        )
    except Exception:
        log.exception("Startup reset failed")

    app.state.public_url = PUBLIC_URL or f"http://localhost:{SERVER_PORT}"
    log.info("=" * 60)
    log.info("Bridge public URL: %s", app.state.public_url)
    log.info("LINE Webhook URL:  %s/webhook", app.state.public_url)
    if CRO_CHANNEL_ENABLED:
        log.info("CRO Webhook URL:   %s/webhook/cro", app.state.public_url)
    log.info("=" * 60)

    poller_task = asyncio.create_task(
        email_poller.start_poller(DB_CONFIG, doctor.notify_new_report)
    )
    evaluator_task = asyncio.create_task(
        admin_alert_evaluator.start_evaluator(interval_seconds=60)
    )
    webhook_worker_task = asyncio.create_task(
        webhook_queue_worker.start_worker(interval_seconds=30)
    )
    try:
        yield
    finally:
        poller_task.cancel()
        evaluator_task.cancel()
        webhook_worker_task.cancel()
        # Drain reused httpx client to close keep-alive connections cleanly.
        from api.line_webhook import close_n8n_client
        await close_n8n_client()
