"""AI assistant request/response schemas."""
from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    """request body ของ staff AI chat (/ai) — ข้อความ + conversation_id (ต่อบทสนทนา)
    + patient_id ที่ pin ไว้ (ถ้ามี backend จะ prepend context คนไข้)"""
    # Bounded like the customer RAG path (AnswerRequest.text). Staff paste longer
    # context than patients, so cap is higher (4000) — but never unbounded, else a
    # stolen/compromised staff token could drive arbitrary LLM cost. Empty -> 422.
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str = Field(default="", max_length=64)
    # When provided, backend pulls patient/bookings/reports and prepends
    # a context block to the message before sending to the LLM.
    patient_id: int | None = Field(default=None, ge=1)


class BookSource(BaseModel):
    """แหล่งอ้างอิงตำราแพทย์ที่ถูกดึงมา ground คำตอบ — โชว์เป็น footnote ใต้คำตอบ AI"""
    title: str
    page: int | None = None
    score: float | None = None


class ChatResponse(BaseModel):
    """response ของ staff AI chat — คำตอบ + conversation_id ให้ client ใช้ต่อเทิร์นถัดไป
    + book_sources (ถ้าคำตอบ ground ด้วยตำราแพทย์)"""
    answer: str
    conversation_id: str
    book_sources: list[BookSource] = []
