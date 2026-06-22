"""AI chat endpoint."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from core.security import require_user
from schemas.ai import ChatRequest, ChatResponse
from services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, str]:
    """Proxy dashboard AI chat to the service layer (blocking — returns full answer)."""
    return ai_service.chat(
        message=body.message,
        conversation_id=body.conversation_id,
        patient_id=body.patient_id,
        user=user,
    )


@router.post("/chat/stream")
def chat_stream(
    body: ChatRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> StreamingResponse:
    """SSE streaming variant — frontend renders tokens as they arrive."""
    return StreamingResponse(
        ai_service.chat_stream(
            message=body.message,
            conversation_id=body.conversation_id,
            patient_id=body.patient_id,
            user=user,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
