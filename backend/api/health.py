"""Health and service metadata endpoints."""
import time

import httpx
from fastapi import APIRouter, Header, HTTPException, Request, status

from core.config import (
    BRIDGE_INTERNAL_TOKEN,
    CRO_CHANNEL_ENABLED,
    DIFY_API_KEY,
    DIFY_API_URL,
)
from core.db import get_db
from core.lifespan import is_draining

router = APIRouter()


@router.get("/")
def health(request: Request):
    base = getattr(request.app.state, "public_url", "")
    if is_draining():
        raise HTTPException(
            status_code=503,
            detail={"code": "DRAINING", "message": "Bridge is shutting down"},
        )
    return {
        "status": "ok",
        "public_url": base or "starting...",
        "webhook": f"{base}/webhook",
        "webhook_cro": f"{base}/webhook/cro" if CRO_CHANNEL_ENABLED else None,
    }


def _require_internal_token(x_internal_token: str | None) -> None:
    if not BRIDGE_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="BRIDGE_INTERNAL_TOKEN is not configured",
        )
    if x_internal_token != BRIDGE_INTERNAL_TOKEN:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal token",
        )


@router.get("/internal/health/full")
def internal_health_full(
    request: Request,
    x_internal_token: str | None = Header(default=None),
):
    _require_internal_token(x_internal_token)

    checks = {
        "bridge": {"status": "ok"},
        "db": {"status": "unknown"},
        "dify": {"status": "unknown"},
        "tunnel": {"status": "unknown"},
    }

    start = time.perf_counter()
    try:
        with get_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE status IS NULL) AS ready_reports,
                        COUNT(*) FILTER (WHERE status = 'analyzing') AS analyzing_reports,
                        COUNT(*) FILTER (
                            WHERE status = 'analyzing'
                              AND submitted_at < NOW() - INTERVAL '15 minutes'
                        ) AS stale_analyzing_reports
                    FROM reports
                    """
                )
                ready, analyzing, stale = cur.fetchone()
        checks["db"] = {
            "status": "ok",
            "latency_ms": round((time.perf_counter() - start) * 1000),
            "reports": {
                "ready": ready,
                "analyzing": analyzing,
                "stale_analyzing": stale,
            },
        }
    except Exception as exc:
        checks["db"] = {"status": "error", "error": str(exc)}

    start = time.perf_counter()
    try:
        r = httpx.get(
            f"{DIFY_API_URL}/info",
            headers={"Authorization": f"Bearer {DIFY_API_KEY}"},
            timeout=8,
        )
        checks["dify"] = {
            "status": "ok" if r.status_code == 200 else "error",
            "status_code": r.status_code,
            "latency_ms": round((time.perf_counter() - start) * 1000),
        }
        if r.status_code == 200:
            info = r.json()
            checks["dify"].update(
                {
                    "name": info.get("name"),
                    "mode": info.get("mode"),
                }
            )
    except Exception as exc:
        checks["dify"] = {"status": "error", "error": str(exc)}

    public_url = getattr(request.app.state, "public_url", "") or ""
    checks["tunnel"] = {
        "status": "ok" if public_url.startswith("http") else "starting",
        "url": public_url,
    }

    overall = "ok"
    if any(check.get("status") == "error" for check in checks.values()):
        overall = "error"
    elif any(check.get("status") in {"starting", "unknown"} for check in checks.values()):
        overall = "degraded"

    return {
        "status": overall,
        "checks": checks,
    }
