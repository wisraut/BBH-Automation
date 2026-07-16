"""FastAPI lifespan startup/shutdown hooks."""
import asyncio
from contextlib import asynccontextmanager

from core.config import CRO_CHANNEL_ENABLED, DB_CONFIG, PUBLIC_URL, SERVER_PORT, log
from core.db import get_db
from flows import doctor
from jobs import admin_alert_evaluator, appointment_reminder, no_show_flagger, webhook_queue_worker


# Health probe (Cloudflare + Docker healthcheck) reads this. When True, the
# bridge is shutting down and the probe returns 503 so load balancers stop
# routing new traffic while in-flight requests finish.
_DRAINING = False


def is_draining() -> bool:
    """คืนสถานะว่ากำลัง shutdown อยู่ไหม — health probe อ่านค่านี้เพื่อตอบ 503
    ให้ load balancer หยุดส่ง traffic ใหม่ระหว่างที่ request ค้างทำงานให้จบ"""
    return _DRAINING


async def _cancel_and_wait(task: asyncio.Task, name: str, timeout: float = 10.0) -> None:
    """ยกเลิก background task แล้วรอให้จบภายใน timeout — ใช้ตอน shutdown
    กลืน exception ทุกแบบ (log ไว้) เพื่อไม่ให้ worker ตัวเดียวพังทำ shutdown ค้าง"""
    task.cancel()
    try:
        await asyncio.wait_for(task, timeout=timeout)
    except asyncio.CancelledError:
        log.info("worker %s cancelled cleanly", name)
    except asyncio.TimeoutError:
        log.warning("worker %s did not finish within %.1fs", name, timeout)
    except Exception:
        log.exception("worker %s raised on shutdown", name)


def _startup_reset() -> None:
    """ล้าง session/lock ค้างตอนบูต — เคลียร์ line_uid ทุก role, ปลด conversation
    ที่ค้าง taken_over, ปลด report ที่ค้าง 'analyzing' เพราะ process ก่อนหน้าตายกลางคัน
    (ระบบ single-instance รีสตาร์ท = ไม่มีใครถือ session พวกนี้อยู่จริง)"""
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
    """FastAPI lifespan — startup: reset session ค้าง + spin background workers
    (alert evaluator / webhook queue / reminder / no-show); shutdown: flip draining flag
    ให้ probe ตอบ 503 แล้วค่อย cancel workers + ปิด httpx client อย่างนุ่มนวล"""
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

    # email_poller disabled 2026-07-01 — Gmail App Password revoked; Reports page in
    # Web Dashboard covers report intake. Re-enable by restoring the import + task
    # after regenerating GMAIL_APP_PASSWORD.
    evaluator_task = asyncio.create_task(
        admin_alert_evaluator.start_evaluator(interval_seconds=60)
    )
    webhook_worker_task = asyncio.create_task(
        webhook_queue_worker.start_worker(interval_seconds=30)
    )
    reminder_task = asyncio.create_task(
        appointment_reminder.start_worker(interval_seconds=60)
    )
    no_show_task = asyncio.create_task(
        no_show_flagger.start_worker(interval_seconds=300)
    )
    try:
        yield
    finally:
        # Graceful shutdown sequence:
        # 1. Flip draining flag so health probes return 503 → LB stops new traffic
        # 2. Cancel background workers in parallel with a per-task timeout
        # 3. Drain shared httpx client (reused connection keepalives)
        global _DRAINING
        _DRAINING = True
        log.info("Shutdown: draining started — health endpoint will return 503")

        await asyncio.sleep(2)  # short window so in-flight reqs see drain

        await asyncio.gather(
            _cancel_and_wait(evaluator_task, "alert_evaluator"),
            _cancel_and_wait(webhook_worker_task, "webhook_queue"),
            _cancel_and_wait(reminder_task, "appointment_reminder"),
            _cancel_and_wait(no_show_task, "no_show_flagger"),
            return_exceptions=True,
        )
        log.info("Shutdown: workers stopped")

        # Drain reused httpx client to close keep-alive connections cleanly.
        from api.line_webhook import close_n8n_client
        try:
            await asyncio.wait_for(close_n8n_client(), timeout=5)
        except (asyncio.TimeoutError, Exception):  # noqa: BLE001
            log.exception("close_n8n_client did not finish cleanly")

        log.info("Shutdown: complete")
