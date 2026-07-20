"""AI assistant request/response schemas."""
import base64
import re

from pydantic import BaseModel, Field, field_validator, model_validator

# A persisted thumbnail must be a base64 raster image data URL, nothing else.
_THUMB_PREFIX = re.compile(r"^data:image/(png|jpe?g|webp|gif);base64,", re.IGNORECASE)

# Vision: staff can attach ONE image the model "sees" (Gemini via OpenRouter is
# multimodal). Only raster images the model supports; size capped so a
# stolen/compromised staff token can't push huge payloads to the paid LLM. PDFs
# and other docs are intentionally NOT accepted here (would need text extraction,
# a separate path).
_ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB decoded


# The downscaled preview (data URL) is what we persist for display; cap its length
# so a client can't smuggle a huge string past the 5MB image cap via the thumb.
_MAX_THUMB_CHARS = 3_000_000  # ~2MB decoded, generous for a 1024px JPEG


class ChatImage(BaseModel):
    """รูปแนบในแชท staff — base64 (ไม่รวม `data:` prefix) + mime; validate ชนิด+ขนาด
    ฝั่ง server เสมอ (ห้ามเชื่อ client). `data` (รูปเต็ม) ส่งให้ LLM แล้วทิ้งไม่เก็บ;
    `thumb` (data URL ย่อ) คือสิ่งที่เก็บลง DB เพื่อโชว์ประวัติ"""
    mime_type: str
    data: str  # base64, no "data:...;base64," prefix
    thumb: str | None = None  # small preview data URL, persisted for display

    @field_validator("mime_type")
    @classmethod
    def _check_mime(cls, v: str) -> str:
        if v not in _ALLOWED_IMAGE_MIMES:
            raise ValueError("unsupported image type")
        return v

    @field_validator("data")
    @classmethod
    def _check_size(cls, v: str) -> str:
        try:
            raw = base64.b64decode(v, validate=True)
        except Exception as exc:  # noqa: BLE001
            raise ValueError("invalid base64 image data") from exc
        if not raw:
            raise ValueError("empty image")
        if len(raw) > _MAX_IMAGE_BYTES:
            raise ValueError("image too large (max 5MB)")
        return v

    @field_validator("thumb")
    @classmethod
    def _check_thumb(cls, v: str | None) -> str | None:
        if not v:
            return v
        if len(v) > _MAX_THUMB_CHARS:
            raise ValueError("thumbnail too large")
        # Must be a real image data URL — it is persisted and rendered as <img src>,
        # so reject anything that isn't a base64 raster data URI (defense in depth
        # against a client stuffing an arbitrary/hostile string into stored content).
        if not _THUMB_PREFIX.match(v):
            raise ValueError("thumbnail must be an image data URL")
        return v


class PinRequest(BaseModel):
    """ตั้ง/ยกเลิกคนไข้ที่ pin กับ conversation — patient_id=None คือยกเลิก pin"""
    patient_id: int | None = Field(default=None, ge=1)


class ChatRequest(BaseModel):
    """request body ของ staff AI chat (/ai) — ข้อความ + conversation_id (ต่อบทสนทนา)
    + patient_id ที่ pin ไว้ (ถ้ามี backend จะ prepend context คนไข้) + image (ถ้าแนบรูป)"""
    # Bounded like the customer RAG path (AnswerRequest.text). Staff paste longer
    # context than patients, so cap is higher (4000) — but never unbounded, else a
    # stolen/compromised staff token could drive arbitrary LLM cost. May be empty
    # when an image is attached (validated below).
    message: str = Field(default="", max_length=4000)
    conversation_id: str = Field(default="", max_length=64)
    # When provided, backend pulls patient/bookings/reports and prepends
    # a context block to the message before sending to the LLM.
    patient_id: int | None = Field(default=None, ge=1)
    # Optional single attached image the model reads (vision).
    image: ChatImage | None = None

    @model_validator(mode="after")
    def _need_text_or_image(self) -> "ChatRequest":
        if not self.message.strip() and self.image is None:
            raise ValueError("message or image is required")
        return self


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
