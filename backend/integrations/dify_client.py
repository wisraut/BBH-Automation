"""Dify chat-messages API client."""
import json
import re
from collections.abc import Iterator

import httpx

from core.config import DIFY_API_URL, DIFY_API_KEY


def ask(
    user_id: str,
    message: str,
    role: str = "doctor",
    conv_id: str = "",
    api_key: str | None = None,
    inputs: dict | None = None,
) -> tuple:
    """
    เรียก Dify /chat-messages — returns (answer, conversation_id)
    api_key: override ถ้าใช้ app อื่น (เช่น DIFY_STAFF_API_KEY)
    inputs: override inputs dict ทั้งหมด (ถ้า None ใช้ {"role": role})
    """
    key = api_key or DIFY_API_KEY
    r = httpx.post(
        f"{DIFY_API_URL}/chat-messages",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "inputs":          inputs if inputs is not None else {"role": role},
            "query":           message,
            "response_mode":   "blocking",
            "conversation_id": conv_id,
            "user":            f"{role}:{user_id}",
        },
        timeout=300,
    )
    r.raise_for_status()
    j = r.json()
    return (j.get("answer", ""), j.get("conversation_id", ""))


def ask_with_meta(user_id: str, message: str, role: str = "public_inquiry",
                   conv_id: str = "") -> tuple:
    """
    เรียก Dify + return raw answer + conv_id + metadata
    `conv_id` ใช้ resume session (multi-turn booking flow)
    """
    r = httpx.post(
        f"{DIFY_API_URL}/chat-messages",
        headers={"Authorization": f"Bearer {DIFY_API_KEY}"},
        json={
            "inputs":          {"role": role},
            "query":           message,
            "response_mode":   "blocking",
            "conversation_id": conv_id,
            "user":            f"{role}:{user_id}",
        },
        timeout=300,
    )
    r.raise_for_status()
    j = r.json()
    return (j.get("answer", ""), j.get("conversation_id", ""), j.get("metadata", {}))


def stream(
    user_id: str,
    message: str,
    role: str = "doctor",
    conv_id: str = "",
    api_key: str | None = None,
    inputs: dict | None = None,
) -> Iterator[tuple[str, str]]:
    """
    Stream Dify /chat-messages — yields (event_type, payload) tuples.

    event_type:
      - "delta"      → payload is incremental text chunk
      - "conv_id"    → payload is final conversation_id
      - "done"       → payload is "" (stream finished cleanly)
    """
    key = api_key or DIFY_API_KEY
    with httpx.stream(
        "POST",
        f"{DIFY_API_URL}/chat-messages",
        headers={"Authorization": f"Bearer {key}"},
        json={
            "inputs":          inputs if inputs is not None else {"role": role},
            "query":           message,
            "response_mode":   "streaming",
            "conversation_id": conv_id,
            "user":            f"{role}:{user_id}",
        },
        timeout=300,
    ) as r:
        r.raise_for_status()
        seen_conv = ""
        for line in r.iter_lines():
            if not line or not line.startswith("data:"):
                continue
            raw = line[5:].strip()
            if not raw:
                continue
            try:
                event = json.loads(raw)
            except json.JSONDecodeError:
                continue
            etype = event.get("event")
            if etype in ("message", "agent_message"):
                answer_part = event.get("answer", "")
                if answer_part:
                    yield ("delta", answer_part)
                # conversation_id ปรากฏใน event แรกๆ
                conv = event.get("conversation_id", "")
                if conv and conv != seen_conv:
                    seen_conv = conv
                    yield ("conv_id", conv)
            elif etype == "message_end":
                conv = event.get("conversation_id", "")
                if conv and conv != seen_conv:
                    yield ("conv_id", conv)
        yield ("done", "")


_PREFIX_RE = re.compile(r"^\s*(AUTO|ESCALATE|BOOKING_ASK|BOOKING_DONE)\s*:\s*(?:(\w+)\s*:\s*)?(.*)$", re.DOTALL)


def parse_decision(answer: str) -> tuple:
    """
    Parse LLM output — 4 formats:
      - "AUTO: <text>"                       → ('auto', None, text)
      - "ESCALATE:<class>: <reason>"          → ('escalate', class, reason)
      - "BOOKING_ASK: <ข้อความถามต่อ>"        → ('booking_ask', None, question)
      - "BOOKING_DONE: {json}"                → ('booking_done', None, json_str)
    Fallback (no prefix): treat as AUTO
    """
    m = _PREFIX_RE.match(answer or "")
    if not m:
        return ("auto", None, answer or "")
    prefix = m.group(1).upper()
    second = m.group(2)
    body = (m.group(3) or "").strip()

    if prefix == "AUTO":
        return ("auto", None, body)
    if prefix == "BOOKING_ASK":
        return ("booking_ask", None, body)
    if prefix == "BOOKING_DONE":
        return ("booking_done", None, body)
    # ESCALATE — but second group might be the class
    # Re-parse: "ESCALATE:class: rest" — group(2)=class, group(3)=reason
    return ("escalate", second or "unknown", body)
