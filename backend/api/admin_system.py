"""Admin system health endpoint — powers the /system-health page.

Probes each service the bridge depends on and returns a structured snapshot.
Designed to be polled every ~5 seconds from the frontend.
"""
import time
from datetime import datetime, timezone
from typing import Any

import httpx
from fastapi import APIRouter, Depends

from core.config import (
    CRO_CHANNEL_ENABLED,
    LINE_CHANNEL_ID,
)
from core.mysql import mysql_db
from core.security import require_user


router = APIRouter(prefix="/api/admin/system", tags=["admin-system"])

_admin_only = require_user(["admin"])

# Track bridge process start so the response can report uptime.
_PROCESS_START = time.time()


# ---------------------------------------------------------------------------
# Probes
# ---------------------------------------------------------------------------

def _probe_mysql() -> dict[str, Any]:
    """ping ฐานข้อมูล MySQL (bot ops) ด้วย SELECT 1 แล้วคืนสถานะ ok/error พร้อม latency
    — ใช้ประกอบ snapshot ของ /health"""
    start = time.perf_counter()
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1 AS ok")
                cur.fetchone()
        return {
            "name": "mysql_bot_ops",
            "status": "ok",
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "detail": "ping ok",
        }
    except Exception as exc:
        return {
            "name": "mysql_bot_ops",
            "status": "error",
            "detail": f"{type(exc).__name__}: {exc}",
        }


def _probe_n8n() -> dict[str, Any]:
    """เรียก /healthz ของ n8n เพื่อเช็คว่ายังตอบอยู่ไหม แล้วคืนสถานะ ok/warn พร้อม
    latency — เข้าไม่ได้ = warn (ไม่ใช่ error)"""
    start = time.perf_counter()
    try:
        r = httpx.get("http://hospital-n8n:5678/healthz", timeout=3)
        latency = round((time.perf_counter() - start) * 1000)
        return {
            "name": "n8n",
            "status": "ok" if r.status_code == 200 else "warn",
            "latency_ms": latency,
            "detail": f"HTTP {r.status_code}",
        }
    except Exception as exc:
        return {
            "name": "n8n",
            "status": "warn",
            "detail": f"unreachable: {type(exc).__name__}",
        }


# ---------------------------------------------------------------------------
# DB stats + recent activity (single connection)
# ---------------------------------------------------------------------------

def _collect_db_stats() -> dict[str, Any]:
    """รวมตัวเลขสถิติจาก MySQL ในการเชื่อมต่อเดียว (จำนวนคนไข้/ผู้ใช้ active/หมอ/
    booking pending+วันนี้/report วันนี้/alert เปิด/สุขภาพ webhook queue) — ป้อนหน้า
    dashboard system health"""
    stats: dict[str, Any] = {}
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) AS n FROM patients")
                stats["patients"] = int(cur.fetchone()["n"])

                cur.execute(
                    "SELECT COUNT(*) AS n FROM users "
                    "WHERE role IN ('doctor','nurse','cro','lab_staff','admin') "
                    "AND is_active = 1"
                )
                stats["active_users"] = int(cur.fetchone()["n"])

                cur.execute("SELECT COUNT(*) AS n FROM users WHERE role='doctor' AND is_active=1")
                stats["active_doctors"] = int(cur.fetchone()["n"])

                cur.execute(
                    "SELECT COUNT(*) AS n FROM booking_requests "
                    "WHERE status='pending_approval'"
                )
                stats["pending_bookings"] = int(cur.fetchone()["n"])

                cur.execute(
                    "SELECT COUNT(*) AS n FROM booking_requests "
                    "WHERE DATE(created_at) = CURDATE()"
                )
                stats["today_bookings"] = int(cur.fetchone()["n"])

                cur.execute(
                    "SELECT COUNT(*) AS n FROM patient_reports "
                    "WHERE DATE(uploaded_at) = CURDATE()"
                )
                stats["today_reports"] = int(cur.fetchone()["n"])

                cur.execute(
                    "SELECT COUNT(*) AS n FROM admin_alerts "
                    "WHERE status IN ('open','acknowledged')"
                )
                stats["open_alerts"] = int(cur.fetchone()["n"])

                # Webhook queue health
                cur.execute(
                    "SELECT status, COUNT(*) AS n FROM webhook_event_queue "
                    "WHERE created_at >= NOW() - INTERVAL 24 HOUR GROUP BY status"
                )
                by_status = {r["status"]: int(r["n"]) for r in cur.fetchall()}
                stats["webhook_pending"] = by_status.get("pending", 0)
                stats["webhook_failed_24h"] = by_status.get("failed", 0)
    except Exception as exc:
        stats["error"] = f"{type(exc).__name__}: {exc}"
    return stats


def _collect_recent_activity(limit: int = 8) -> list[dict[str, Any]]:
    """Union of recent bookings + reports + alert events."""
    items: list[dict[str, Any]] = []
    try:
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT 'booking' AS kind, request_uid AS subject,
                           CONCAT('Booking ', request_uid, ' — ', COALESCE(patient_name,'?'), ' (', status, ')') AS summary,
                           created_at AS ts
                    FROM booking_requests
                    ORDER BY created_at DESC LIMIT %s
                    """,
                    (limit,),
                )
                items += list(cur.fetchall())

                cur.execute(
                    """
                    SELECT 'report' AS kind, CAST(id AS CHAR) AS subject,
                           CONCAT('Report #', id, ' — ', LEFT(title, 50)) AS summary,
                           uploaded_at AS ts
                    FROM patient_reports
                    ORDER BY uploaded_at DESC LIMIT %s
                    """,
                    (limit,),
                )
                items += list(cur.fetchall())

                cur.execute(
                    """
                    SELECT 'alert' AS kind, CAST(e.alert_id AS CHAR) AS subject,
                           CONCAT('[', e.event_type, '] ', LEFT(a.title, 50)) AS summary,
                           e.created_at AS ts
                    FROM admin_alert_events e
                    JOIN admin_alerts a ON a.alert_id = e.alert_id
                    ORDER BY e.created_at DESC LIMIT %s
                    """,
                    (limit,),
                )
                items += list(cur.fetchall())
    except Exception:
        pass

    items.sort(key=lambda r: r["ts"], reverse=True)
    out = []
    for r in items[:limit]:
        ts = r["ts"]
        out.append({
            "kind": r["kind"],
            "subject": r["subject"],
            "summary": r["summary"],
            "ts": ts.isoformat() if hasattr(ts, "isoformat") else str(ts),
        })
    return out


# ---------------------------------------------------------------------------
# Route
# ---------------------------------------------------------------------------

@router.get("/health")
def system_health(_user=Depends(_admin_only)):
    """Snapshot of every dependency. Frontend polls every ~5 seconds."""
    services = [
        {
            "name": "bridge",
            "status": "ok",
            "detail": f"uptime {_format_uptime(time.time() - _PROCESS_START)}",
        },
        _probe_mysql(),
        _probe_n8n(),
        {
            "name": "line_main_webhook",
            "status": "ok" if LINE_CHANNEL_ID else "warn",
            "detail": f"channel {LINE_CHANNEL_ID}" if LINE_CHANNEL_ID else "not configured",
        },
        {
            "name": "line_cro_webhook",
            "status": "ok" if CRO_CHANNEL_ENABLED else "warn",
            "detail": "enabled" if CRO_CHANNEL_ENABLED else "disabled",
        },
    ]

    overall = "ok"
    if any(s["status"] == "error" for s in services):
        overall = "error"
    elif any(s["status"] == "warn" for s in services):
        overall = "warn"

    return {
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "overall": overall,
        "services": services,
        "db_stats": _collect_db_stats(),
        "recent_activity": _collect_recent_activity(limit=10),
    }


def _format_uptime(seconds: float) -> str:
    """แปลงจำนวนวินาที uptime เป็นข้อความสั้นอ่านง่าย เช่น '2d 3h 10m' / '5h 2m' / '10m'"""
    seconds = int(seconds)
    days, rem = divmod(seconds, 86400)
    hours, rem = divmod(rem, 3600)
    mins, _ = divmod(rem, 60)
    if days:
        return f"{days}d {hours}h {mins}m"
    if hours:
        return f"{hours}h {mins}m"
    return f"{mins}m"
