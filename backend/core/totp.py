"""Minimal RFC 6238 TOTP — no external dependency.

Default parameters match Google Authenticator / Authy: 30-second step,
6-digit code, HMAC-SHA1. Window=1 forgives 30 s clock skew on either side.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from urllib.parse import quote


_STEP = 30
_DIGITS = 6
_WINDOW = 1


def generate_secret() -> str:
    """20-byte random base32 (160 bits) — Google Authenticator's expected size."""
    return base64.b32encode(secrets.token_bytes(20)).decode("ascii").rstrip("=")


def _hotp(secret_b32: str, counter: int) -> str:
    key = base64.b32decode(secret_b32 + "=" * ((-len(secret_b32)) % 8))
    msg = struct.pack(">Q", counter)
    h = hmac.new(key, msg, hashlib.sha1).digest()
    offset = h[-1] & 0x0F
    code_int = (
        ((h[offset] & 0x7F) << 24)
        | (h[offset + 1] << 16)
        | (h[offset + 2] << 8)
        | h[offset + 3]
    ) % (10**_DIGITS)
    return str(code_int).zfill(_DIGITS)


def current_code(secret_b32: str, *, t: float | None = None) -> str:
    if t is None:
        t = time.time()
    return _hotp(secret_b32, int(t // _STEP))


def verify(secret_b32: str, code: str) -> bool:
    if not code or not code.isdigit() or len(code) != _DIGITS:
        return False
    now = time.time()
    for w in range(-_WINDOW, _WINDOW + 1):
        if _hotp(secret_b32, int((now + w * _STEP) // _STEP)) == code:
            return True
    return False


def otpauth_url(secret_b32: str, *, label: str, issuer: str = "BBH Hospital") -> str:
    """otpauth://totp/<issuer>:<label>?secret=...&issuer=...&digits=6&period=30"""
    label_safe = quote(label, safe="")
    issuer_safe = quote(issuer, safe="")
    return (
        f"otpauth://totp/{issuer_safe}:{label_safe}"
        f"?secret={secret_b32}&issuer={issuer_safe}&digits={_DIGITS}&period={_STEP}"
    )
