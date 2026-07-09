"""AI assistant request/response schemas."""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    # Bounded like the customer RAG path (AnswerRequest.text). Staff paste longer
    # context than patients, so cap is higher (4000) — but never unbounded, else a
    # stolen/compromised staff token could drive arbitrary LLM cost. Empty -> 422.
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str = Field(default="", max_length=64)
    # When provided, backend pulls patient/bookings/reports and prepends
    # a context block to the message before sending to Dify.
    patient_id: int | None = Field(default=None, ge=1)


class ChatResponse(BaseModel):
    answer: str
    conversation_id: str
