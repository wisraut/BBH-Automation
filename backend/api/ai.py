"""AI chat endpoint — proxies to Dify with dashboard user context."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import integrations.dify_client as dify
from core.security import require_user

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str = ""


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str


def _dify_role(dashboard_role: str) -> str:
    return "doctor" if dashboard_role == "doctor" else "public_inquiry"


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> ChatResponse:
    role = _dify_role(user["role"])
    try:
        answer, conv_id = dify.ask(
            user_id=str(user["id"]),
            message=body.message,
            role=role,
            conv_id=body.conversation_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "DIFY_ERROR", "message": "AI ไม่ตอบสนอง กรุณาลองใหม่"},
        ) from exc

    # CRO / admin ได้ตอบแบบ routing prefix (AUTO: / ESCALATE: ฯลฯ) — strip ออก
    if role != "doctor":
        _, _, clean = dify.parse_decision(answer)
        answer = clean

    return ChatResponse(answer=answer, conversation_id=conv_id)
