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
    """ปรับข้อความก่อน redact ให้ regex จับไม่พลาด: normalize NFC, ลบ zero-width
    char, และแปลงเลขไทย ๐-๙ เป็น 0-9 (1:1 คงความยาว) กันเทคนิคเลี่ยง PII regex
    ด้วยการพิมพ์เบอร์/เลขบัตรเป็นเลขไทยหรือแทรกอักขระซ่อน"""
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

# A single Thai/Latin word token (a name part). Thai digits were already folded to
# ASCII by _prep, so this class won't swallow numbers — a name token stops at the
# first space, digit, or punctuation.
_NAME_TOK = r"[ก-๛A-Za-z]{1,20}"

# Honorific + given name — catches people the patient-name dictionary can't: a
# relative, a referring doctor, or a name inside a Google Calendar summary that
# isn't a registered patient. Thai has no reliable NER (models are English-trained
# and collapse on Thai), so a rule over honorifics is the pragmatic PDPA net.
# Dotted abbreviations always precede a name; นาย/นาง/นางสาว can begin compounds
# (นายแพทย์ = physician, นางพยาบาล = nurse), so those two words are excluded via
# lookahead to avoid masking clinical role words.
_HONORIFIC_NAME = re.compile(
    r"(?:น\.ส\.|ด\.ช\.|ด\.ญ\.|นพ\.|พญ\.|ทพ\.|ทพญ\.|ภก\.|ภญ\.|เด็กชาย|เด็กหญิง"
    r"|(?:นางสาว|นาง|นาย)(?!แพทย์|พยาบาล))"
    # One token only: the given name is the primary Thai identifier, and grabbing a
    # second token would eat the following word (a symptom/diagnosis) — losing
    # clinical content the model needs. A registered patient's full name is still
    # masked completely by the known_names dictionary below; this rule is the net
    # for un-registered names (relatives, referring doctors, calendar entries).
    rf"\s*{_NAME_TOK}"
)

# Thai street-address components. Each keyword is address-specific, so masking the
# token after it strips the identifying part (house no / street / sub-district /
# district / province) without touching clinical text. Postal codes are left alone
# (a bare 5-digit run collides with lab values / amounts).
_ADDRESS = re.compile(
    r"(?:บ้านเลขที่\s*\S+"
    r"|เลขที่\s*\d[\d/\-]*"
    # NB: 'เขต' is intentionally omitted — it means both a Bangkok district AND a
    # body region ("เขตหน้าอก" = chest area), so masking it would eat symptom
    # location the triage AI needs. 'แขวง' still masks the sub-district name.
    rf"|(?:หมู่ที่|หมู่|ซอย|ซ\.|ถนน|ถ\.|ตำบล|แขวง|อำเภอ|จังหวัด)\s*{_NAME_TOK}"
    r")"
)


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
    out = _ADDRESS.sub("[ADDRESS]", out)
    out = _HONORIFIC_NAME.sub("[NAME]", out)

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
