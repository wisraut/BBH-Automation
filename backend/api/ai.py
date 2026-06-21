"""AI chat endpoint."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends

from core.security import require_user
from schemas.ai import ChatRequest, ChatResponse
from services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, str]:
    """Proxy dashboard AI chat to the service layer."""
    return ai_service.chat(
        message=body.message,
        conversation_id=body.conversation_id,
        user=user,
    )
