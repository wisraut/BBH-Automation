"""AI assistant request/response schemas."""
from pydantic import BaseModel


class ChatRequest(BaseModel):
    message: str
    conversation_id: str = ""


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
