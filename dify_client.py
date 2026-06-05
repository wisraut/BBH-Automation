"""Dify chat-messages API client."""
import re
import httpx
from config import DIFY_API_URL, DIFY_API_KEY


def ask(user_id: str, message: str, role: str = "doctor", conv_id: str = "") -> tuple:
    """
    เรียก Dify /chat-messages — returns (answer, conversation_id)
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
