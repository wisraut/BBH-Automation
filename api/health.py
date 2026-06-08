"""Health and service metadata endpoints."""
from fastapi import APIRouter, Request

from core.config import CRO_CHANNEL_ENABLED

router = APIRouter()


@router.get("/")
def health(request: Request):
    base = getattr(request.app.state, "ngrok_url", "")
    return {
        "status": "ok",
        "ngrok_url": base or "starting...",
        "webhook": f"{base}/webhook",
        "webhook_cro": f"{base}/webhook/cro" if CRO_CHANNEL_ENABLED else None,
    }
