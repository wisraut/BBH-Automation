"""AI assistant service logic."""
from typing import Any

from fastapi import HTTPException

import integrations.dify_client as dify


def _dify_role(dashboard_role: str) -> str:
    return "doctor" if dashboard_role == "doctor" else "public_inquiry"


def chat(*, message: str, conversation_id: str, user: dict[str, Any]) -> dict[str, str]:
    role = _dify_role(user["role"])
    try:
        answer, conv_id = dify.ask(
            user_id=str(user["id"]),
            message=message,
            role=role,
            conv_id=conversation_id,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "DIFY_ERROR", "message": "AI ?????????? ????????????"},
        ) from exc

    if role != "doctor":
        _, _, clean = dify.parse_decision(answer)
        answer = clean

    return {"answer": answer, "conversation_id": conv_id}
