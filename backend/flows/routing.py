"""Route-prefix parser for LINE bot answers.

The LLM (own RAG or, historically, Dify) prefixes its reply with a routing
tag: AUTO / ESCALATE:<class> / BOOKING_ASK / BOOKING_DONE. This parser turns
that raw string into a (decision, classifier, body) tuple the flow handlers
branch on. Moved out of the old dify_client so it survives Dify removal.
"""
import re

_PREFIX_RE = re.compile(
    r"^\s*(AUTO|CONSULT|ESCALATE|BOOKING_ASK|BOOKING_DONE)\s*:\s*(?:(\w+)\s*:\s*)?(.*)$",
    re.DOTALL,
)


def parse_decision(answer: str) -> tuple:
    """
    Parse LLM output — 5 formats:
      - "AUTO: <text>"                → ('auto', None, text)
      - "CONSULT: <text>"             → ('auto', None, text)  # shown to patient like AUTO
      - "ESCALATE:<class>: <reason>"  → ('escalate', class, reason)
      - "BOOKING_ASK: <question>"     → ('booking_ask', None, question)
      - "BOOKING_DONE: {json}"        → ('booking_done', None, json_str)
    Fallback (no prefix): treat as AUTO.
    """
    m = _PREFIX_RE.match(answer or "")
    if not m:
        return ("auto", None, answer or "")
    prefix = m.group(1).upper()
    second = m.group(2)
    body = (m.group(3) or "").strip()

    # CONSULT is a medical answer meant for the patient (disclaimer already in the
    # body) — treat like AUTO so the raw "CONSULT:" tag is stripped, never pushed
    # verbatim. Without this, CONSULT fell through to the escalate branch's sibling
    # no-match path and leaked the prefix to the patient.
    if prefix in ("AUTO", "CONSULT"):
        return ("auto", None, body)
    if prefix == "BOOKING_ASK":
        return ("booking_ask", None, body)
    if prefix == "BOOKING_DONE":
        return ("booking_done", None, body)
    return ("escalate", second or "unknown", body)
