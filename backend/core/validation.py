"""Small shared input validators."""
import re

# Practical email check — blocks obvious garbage (spaces, missing @/domain) without
# chasing RFC 5322 perfection. Used to validate destination addresses before we
# send patient data out by email, and the doctor's saved summary address.
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def is_valid_email(value: str) -> bool:
    return bool(EMAIL_RE.match(value.strip()))
