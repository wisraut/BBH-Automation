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


def ask_with_meta(user_id: str, message: str, role: str = "public_inquiry") -> tuple:
    """
    เรียก Dify + return raw answer + conv_id + metadata
    (สำหรับ flow ที่ต้อง parse prefix หรือ inspect metadata)
    """
    r = httpx.post(
        f"{DIFY_API_URL}/chat-messages",
        headers={"Authorization": f"Bearer {DIFY_API_KEY}"},
        json={
            "inputs":          {"role": role},
            "query":           message,
            "response_mode":   "blocking",
            "conversation_id": "",
            "user":            f"{role}:{user_id}",
        },
        timeout=300,
    )
    r.raise_for_status()
    j = r.json()
    return (j.get("answer", ""), j.get("conversation_id", ""), j.get("metadata", {}))


_PREFIX_RE = re.compile(r"^\s*(AUTO|ESCALATE)\s*:\s*(?:(\w+)\s*:\s*)?(.*)$", re.DOTALL)


def parse_decision(answer: str) -> tuple:
    """
    Parse LLM output:
      - "AUTO: <text>"
      - "ESCALATE:<class>: <reason>"
    Returns: (should_escalate: bool, classifier: str|None, body: str)
    Fallback (no prefix): treat as AUTO
    """
    m = _PREFIX_RE.match(answer or "")
    if not m:
        return (False, None, answer or "")
    prefix, classifier, body = m.group(1), m.group(2), (m.group(3) or "").strip()
    if prefix.upper() == "AUTO":
        return (False, None, body)
    return (True, classifier or "unknown", body)
