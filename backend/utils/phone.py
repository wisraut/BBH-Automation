"""Phone number normalization for patient identity matching.

Thai phone numbers reach us in many shapes: "081-234-5678", "081 234 5678",
"+66812345678", "0812345678". For matching we collapse them to one canonical
digit string so format differences don't cause a false split (same person,
two records) — and so a real collision (same number) is detectable.

Canonical form = national Thai format (leading 0), separators stripped:
  +66812345678 / 66812345678  ->  0812345678
  081-234-5678                ->  0812345678
"""
import re

_NON_DIGIT = re.compile(r"\D+")


def normalize_phone(raw: str | None) -> str:
    """Return the canonical digit string, or "" when there is nothing usable.

    Folds the Thai country code (66 / +66) to the national 0-prefixed form.
    Inputs that aren't Thai-shaped are returned as their bare digits, so at
    least exact collisions still match — they just don't get prefix folding.
    """
    if not raw:
        return ""
    digits = _NON_DIGIT.sub("", raw)
    if not digits:
        return ""
    # Thai national numbers start with 0; a 66-prefixed 10/11-digit string is a
    # country-coded form of that same number -> fold back to the 0 prefix.
    if digits.startswith("66") and len(digits) >= 10:
        digits = "0" + digits[2:]
    return digits
