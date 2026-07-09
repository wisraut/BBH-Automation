"""PII masking layer for outbound LLM calls (PDPA compliance).

Anything that crosses out of the bridge to the LLM (OpenRouter -> Gemini,
outside Thailand) must pass through `redact_text` first. Strip identifiers the
model does not need, while preserving medical content (lab values, symptoms,
drug names).

Hardened against the ways real Thai messages evade a naive regex (same class of
bypass as the emergency safety gate):
  - `_prep` removes zero-width chars and folds Thai digits ๐-๙ -> 0-9 so a phone
    typed in Thai numerals still matches. (1:1 / length-preserving, so the
    redacted output stays readable.)
  - phone / citizen-id / HN patterns tolerate ANY separator (space, dot, dash)
    between digits, but are pinned to the real digit counts (10 / 13) so short
    lab values are NOT over-redacted.
  - name matching allows flexible whitespace between tokens.
Errs toward over-redaction on ambiguous digit runs (a wrongly-masked number is
safe; a leaked ID is not) — but the digit-count anchors keep lab values intact.
"""
import re
import unicodedata

_ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"), None)
_THAI_DIGITS = str.maketrans("๐๑๒๓๔๕๖๗๘๙", "0123456789")


def _prep(text: str) -> str:
    t = unicodedata.normalize("NFC", text or "")
    t = t.translate(_ZERO_WIDTH)
    t = t.translate(_THAI_DIGITS)
    return t


_SEP = r"[\s.\-]?"  # optional separator between digits

# Thai citizen ID: 13 digits, any/no separators.
_THAI_ID = re.compile(rf"(?<!\d)\d(?:{_SEP}\d){{12}}(?!\d)")

# Thai phone: 0 or +66 then 8-9 more digits (9-10 total), any/no separators.
_PHONE = re.compile(rf"(?<!\d)(?:\+66|0)(?:{_SEP}\d){{8,9}}(?!\d)")

_EMAIL = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# HN: HN-2024-001 / HN 2024 001, or the 26-0001 counter (also 260001 / 26 0001).
_HN = re.compile(rf"\bHN{_SEP}\d{{4}}{_SEP}\d+\b|(?<!\d)\d{{2}}{_SEP}\d{{4,}}(?!\d)")

_PT_CODE = re.compile(r"\bPT\d{3,}\b")
_LINE_UID = re.compile(r"\bU[a-fA-F0-9]{32}\b")


def redact_text(text: str, *, known_names: list[str] | None = None) -> str:
    """Mask universal PII patterns plus caller-supplied exact names."""
    if not text:
        return text

    out = _prep(text)
    out = _THAI_ID.sub("[CITIZEN_ID]", out)
    out = _PHONE.sub("[PHONE]", out)
    out = _EMAIL.sub("[EMAIL]", out)
    out = _HN.sub("[HN]", out)
    out = _PT_CODE.sub("[PT_CODE]", out)
    out = _LINE_UID.sub("[LINE_UID]", out)

    if known_names:
        seen: set[str] = set()
        for name in sorted(known_names, key=len, reverse=True):
            n = (name or "").strip()
            if len(n) < 2 or n in seen:
                continue
            seen.add(n)
            # Flexible whitespace between name tokens defeats space/zero-width
            # tricks ("สมชาย​ใจดี" == "สมชาย ใจดี").
            pat = re.compile(r"\s*".join(re.escape(tok) for tok in n.split()))
            out = pat.sub("[PATIENT_NAME]", out)
    return out


__all__ = ["redact_text"]
