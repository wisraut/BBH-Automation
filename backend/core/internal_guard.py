"""Middleware that blocks /internal/* requests coming from the public
internet. Defense-in-depth on top of Cloudflare Tunnel path rules.

Rules
-----
A request to a path starting with /internal/ is allowed only when:
  - the request originates from a Docker internal subnet
    (172.16.0.0/12, 10.0.0.0/8, 192.168.0.0/16) OR
  - the request comes from 127.0.0.1 (rare — manual debugging) OR
  - the request carries a valid X-Internal-Token header (existing check
    handled inside the endpoint itself)

Public traffic to /internal/* gets 404 — we leak no information about
whether the endpoint exists.

This pairs with a Cloudflare Tunnel rule in production that drops the
path before it reaches the bridge; the middleware is the belt to the
tunnel's suspenders.
"""
import ipaddress
import logging

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


log = logging.getLogger("internal_guard")

_INTERNAL_NETS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),  # IPv6 ULA
]


def _is_internal(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return any(addr in net for net in _INTERNAL_NETS)


class InternalPathGuard(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path.startswith("/internal/"):
            client = request.client
            ip = client.host if client else ""
            if not _is_internal(ip):
                log.warning("Blocked public access to %s from %s", path, ip)
                return Response(status_code=404)
        return await call_next(request)
