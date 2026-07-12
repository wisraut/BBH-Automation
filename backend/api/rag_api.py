"""Internal endpoint n8n calls to get an answer from our own RAG.

Same shape as the Dify call it replaces: send the patient's message,
get back {answer, route_prefix}. `channel` lets us support LINE now and
WhatsApp/Facebook later without changing the pipeline.
"""
from fastapi import APIRouter, Header
from pydantic import BaseModel, Field

from api.health import _require_internal_token
from rag import service

router = APIRouter(prefix="/internal/rag")


class AnswerRequest(BaseModel):
    channel: str = "line_main"
    external_user_id: str = ""
    # LINE text messages can be up to 5000 chars; cap here matches that so a
    # long-but-legitimate patient message isn't 422-rejected (which the n8n node
    # would surface as the generic "ระบบไม่พร้อม" error, indistinguishable from
    # an outage). 5000 still bounds LLM cost per turn.
    text: str = Field(min_length=1, max_length=5000)


@router.post("/answer")
def rag_answer(body: AnswerRequest, x_internal_token: str | None = Header(None)) -> dict:
    _require_internal_token(x_internal_token)
    return service.answer(body.channel, body.external_user_id, body.text)
