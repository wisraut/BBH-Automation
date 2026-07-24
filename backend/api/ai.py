"""AI chat endpoint."""
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from core.security import require_user
from repositories import ai_message_repo
from schemas.ai import ChatRequest, ChatResponse, PinRequest
from services import ai_service

router = APIRouter(prefix="/api/ai", tags=["ai"])

_NOT_FOUND = {"code": "NOT_FOUND", "message": "ไม่พบบทสนทนา"}


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, Any]:
    """Proxy dashboard AI chat to the service layer (blocking — returns full answer)."""
    return ai_service.chat(
        message=body.message,
        conversation_id=body.conversation_id,
        patient_id=body.patient_id,
        user=user,
        image=body.image.model_dump() if body.image else None,
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
            image=body.image.model_dump() if body.image else None,
        ),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/conversations")
def list_conversations(
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, Any]:
    """The current user's chat conversations for the sidebar (server-side history —
    replaces the old localStorage list, so it follows the user across devices)."""
    return {"conversations": ai_message_repo.list_conversations(int(user["id"]))}


@router.get("/conversations/{token}/messages")
def conversation_messages(
    token: str,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, Any]:
    """Full message history of one conversation (owner-scoped). 404 if the token
    isn't this user's — same IDOR guard as resuming a conversation."""
    pk = ai_message_repo.resolve_pk(token, int(user["id"]))
    if pk is None:
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"messages": ai_message_repo.load_messages(pk)}


@router.delete("/conversations/{token}")
def delete_conversation(
    token: str,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, bool]:
    """Delete a conversation and its messages (owner-scoped)."""
    if not ai_message_repo.delete_conversation(token, int(user["id"])):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}


@router.patch("/conversations/{token}/patient")
def pin_patient(
    token: str,
    body: PinRequest,
    user: Annotated[dict[str, Any], Depends(require_user())],
) -> dict[str, bool]:
    """Pin/unpin the patient context for a conversation (owner-scoped)."""
    if not ai_message_repo.set_pinned_patient(token, int(user["id"]), body.patient_id):
        raise HTTPException(status_code=404, detail=_NOT_FOUND)
    return {"ok": True}
