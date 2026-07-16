"""CSRF protection — double-submit cookie pattern.

On any state-changing request (POST / PUT / PATCH / DELETE) we require the
client to echo the readable `bbh_csrf` cookie back in an `X-CSRF-Token`
header. An attacker on another origin cannot read the cookie (same-origin
policy), so they cannot forge the header.

Bypassed for:
  - GET / HEAD / OPTIONS (safe)
  - /webhook* (LINE — signed by HMAC, not session-based)
  - /internal/* (n8n — signed by X-Internal-Token)
  - /auth/login (no session yet — login sets the cookie)
  - Requests carrying Authorization: Bearer ... (legacy CLI / token-based)
"""
import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


log = logging.getLogger("csrf")

_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_BYPASS_PREFIXES = ("/webhook", "/internal/")
_BYPASS_EXACT = {"/auth/login"}


class CsrfMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        """เช็ค CSRF ต่อทุก request ก่อนส่งต่อ — บังคับ header X-CSRF-Token ตรงกับ
        cookie bbh_csrf เฉพาะ request ที่เปลี่ยน state และใช้ session cookie
        (ข้าม safe method / webhook / internal / login / Bearer token ตามที่ระบุด้านบน)"""
        if request.method in _SAFE_METHODS:
            return await call_next(request)
        path = request.url.path
        if path in _BYPASS_EXACT or path.startswith(_BYPASS_PREFIXES):
            return await call_next(request)
        # If client uses Authorization header (CLI / n8n), skip CSRF — JWT
        # bearer is not vulnerable to CSRF because browser cannot send it
        # without explicit JS, which means cross-site forgery cannot include it.
        if request.headers.get("authorization", "").startswith("Bearer "):
            return await call_next(request)
        # If we don't have a session cookie at all, let downstream handle 401.
        cookie_token = request.cookies.get("bbh_csrf")
        if not cookie_token:
            return await call_next(request)
        header_token = request.headers.get("x-csrf-token")
        if not header_token or header_token != cookie_token:
            log.warning("CSRF rejected: path=%s method=%s ip=%s",
                        path, request.method,
                        request.client.host if request.client else "?")
            return Response(
                status_code=403,
                content=b'{"detail":{"code":"CSRF_INVALID","message":"CSRF token missing or mismatched"}}',
                media_type="application/json",
            )
        return await call_next(request)
