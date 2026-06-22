"""AI assistant request/response schemas."""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str
    conversation_id: str = ""
    # When provided, backend pulls patient/bookings/reports and prepends
    # a context block to the message before sending to Dify.
    patient_id: int | None = Field(default=None, ge=1)


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
