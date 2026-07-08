"""PII masking layer for outbound LLM calls (PDPA compliance).

Anything that crosses out of the bridge to Dify (which proxies to OpenRouter →
Gemini outside Thailand) must pass through `redact_for_llm` first. The goal
is to strip identifiers the model does not need to give useful medical advice
while preserving medical content (lab values, symptoms, drug names).

Strategy:
- Universal regex patterns (citizen ID, phone, email, HN codes, PT codes,
  LINE user IDs)
- Caller-supplied exact strings (patient display_name, nickname) — longest
  first to avoid partial overlap

What we *don't* try to do here:
- Detect arbitrary Thai person names in free text (too many false positives
  on common Thai words). The known-name list from DB is the safety net.
- Round-trip mapping for un-redaction. The staff assistant replies in
  general terms and references "คนไข้รายนี้" — not patient names.
"""
import re


# Thai citizen ID: 13 digits, with or without dashes (1-2345-67890-12-3)
_THAI_ID = re.compile(r"\b\d-?\d{4}-?\d{5}-?\d{2}-?\d\b")

# Thai phone: 0x-xxx-xxxx, 02-xxx-xxxx, +66x-xxx-xxxx (mobile + landline)
_PHONE = re.compile(
    r"(?<!\d)(?:\+66\s?|0)[2-9]\d{1,2}[-\s]?\d{3,4}[-\s]?\d{3,4}(?!\d)"
)

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# Hospital number formats:
#   HN-2024-001, HN-2024-1234
#   26-0001 (HN counter format)
_HN = re.compile(r"\bHN-\d{4}-\d+\b|(?<!\d)\d{2}-\d{4,}(?!\d)")

# Patient code PT001-PT999 used during LINE registration
_PT_CODE = re.compile(r"\bPT\d{3,}\b")

# LINE user id (32-char hex prefixed with U)
_LINE_UID = re.compile(r"\bU[a-fA-F0-9]{32}\b")


def redact_text(text: str, *, known_names: list[str] | None = None) -> str:
    """Mask universal PII patterns plus caller-supplied exact names.

    Designed to run on the FINAL prompt string just before it leaves
    ai_service for Dify. Cheap regex work; safe to run on long bodies.
    """
    if not text:
        return text

    out = text
    out = _THAI_ID.sub("[CITIZEN_ID]", out)
    out = _PHONE.sub("[PHONE]", out)
    out = _EMAIL.sub("[EMAIL]", out)
    out = _HN.sub("[HN]", out)
    out = _PT_CODE.sub("[PT_CODE]", out)
    out = _LINE_UID.sub("[LINE_UID]", out)

    if known_names:
        # Longest-first prevents masking "สมชาย" inside "สมชาย สมหญิง" twice.
        seen: set[str] = set()
        for name in sorted(known_names, key=len, reverse=True):
            n = (name or "").strip()
            if len(n) < 2 or n in seen:
                continue
            seen.add(n)
            out = out.replace(n, "[PATIENT_NAME]")
    return out


__all__ = ["redact_text"]
