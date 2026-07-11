"""Health and service metadata endpoints."""
import hmac
import time

from fastapi import APIRouter, Header, HTTPException, Request, status

from core.config import (
    BRIDGE_INTERNAL_TOKEN,
    CRO_CHANNEL_ENABLED,
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
    # Constant-time compare — avoid leaking the token via response timing.
    if not x_internal_token or not hmac.compare_digest(x_internal_token, BRIDGE_INTERNAL_TOKEN):
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
