"""
LINE Messaging API client — รองรับ 2 channels (primary + CRO).

แต่ละ channel มี: channel_id, channel_secret, cached access token.
"""
import base64
import hashlib
import hmac
import time
from dataclasses import dataclass, field

import httpx

from core.config import (
    LINE_CHANNEL_ID, LINE_CHANNEL_SECRET,
    LINE_CRO_CHANNEL_ID, LINE_CRO_CHANNEL_SECRET,
    log,
)


@dataclass
class LineChannel:
    name: str
    channel_id: str
    channel_secret: str
    token: str = ""
    token_expiry: float = 0.0

    def enabled(self) -> bool:
        return bool(self.channel_id and self.channel_secret)


PRIMARY = LineChannel(name="primary", channel_id=LINE_CHANNEL_ID, channel_secret=LINE_CHANNEL_SECRET)
CRO     = LineChannel(name="cro",     channel_id=LINE_CRO_CHANNEL_ID, channel_secret=LINE_CRO_CHANNEL_SECRET)


def _get_token(ch: LineChannel) -> str:
    """Cache token จนหมดอายุ"""
    if ch.token and time.time() < ch.token_expiry:
        return ch.token
    resp = httpx.post(
        "https://api.line.me/v2/oauth/accessToken",
        data={
            "grant_type":    "client_credentials",
            "client_id":     ch.channel_id,
            "client_secret": ch.channel_secret,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()
    ch.token = data["access_token"]
    ch.token_expiry = time.time() + data.get("expires_in", 2_592_000) - 120
    return ch.token


def verify_signature(body: bytes, signature: str, ch: LineChannel) -> bool:
    """HMAC-SHA256 verify ของ webhook"""
    digest = hmac.new(ch.channel_secret.encode(), body, hashlib.sha256).digest()
    return hmac.compare_digest(base64.b64encode(digest).decode(), signature)


def _truncate(text: str) -> str:
    return text[:4997] + "…" if len(text) > 5000 else text


def _channel_label(ch: "LineChannel") -> str:
    """Map LineChannel.name to the line_push_log.channel ENUM ('main','cro')."""
    return "main" if ch.name == "primary" else ch.name


def _log_push(
    ch: "LineChannel",
    user_id: str,
    message_type: str,
    payload_preview: str,
    resp: httpx.Response | None,
    exc: Exception | None,
    triggered_by: str | None,
    reference_id: str | None,
) -> None:
    """Best-effort write to line_push_log. Never raises."""
    try:
        from repositories.line_push_repo import log_push, _truncate_preview
        if exc is not None:
            log_push(
                channel=_channel_label(ch),
                to_user_id=user_id,
                message_type=message_type,
                payload_preview=_truncate_preview(payload_preview),
                status="failed",
                error_code=type(exc).__name__,
                error_message=str(exc)[:500],
                triggered_by=triggered_by,
                reference_id=reference_id,
            )
            return
        ok = resp is not None and resp.status_code == 200
        log_push(
            channel=_channel_label(ch),
            to_user_id=user_id,
            message_type=message_type,
            payload_preview=_truncate_preview(payload_preview),
            status="success" if ok else "failed",
            http_status=(resp.status_code if resp is not None else None),
            error_message=(None if ok else (resp.text[:500] if resp is not None else None)),
            triggered_by=triggered_by,
            reference_id=reference_id,
        )
    except Exception:
        # never let logging break LINE flow
        pass


def reply(reply_token: str, text: str, ch: LineChannel = PRIMARY) -> None:
    """ตอบกลับด้วย reply token (อายุ 60 วิ, ใช้ครั้งเดียว)"""
    resp = httpx.post(
        "https://api.line.me/v2/bot/message/reply",
        headers={"Authorization": f"Bearer {_get_token(ch)}", "Content-Type": "application/json"},
        json={"replyToken": reply_token, "messages": [{"type": "text", "text": _truncate(text)}]},
        timeout=10,
    )
    if resp.status_code != 200:
        log.error("LINE[%s] reply failed %s: %s", ch.name, resp.status_code, resp.text)


def push(
    user_id: str,
    text: str,
    ch: LineChannel = PRIMARY,
    *,
    triggered_by: str | None = None,
    reference_id: str | None = None,
) -> None:
    """ส่ง push ไป user โดยตรง"""
    try:
        resp = httpx.post(
            "https://api.line.me/v2/bot/message/push",
            headers={"Authorization": f"Bearer {_get_token(ch)}", "Content-Type": "application/json"},
            json={"to": user_id, "messages": [{"type": "text", "text": _truncate(text)}]},
            timeout=10,
        )
    except Exception as exc:
        log.error("LINE[%s] push exception: %s", ch.name, exc)
        _log_push(ch, user_id, "text", text, None, exc, triggered_by, reference_id)
        raise
    if resp.status_code != 200:
        log.error("LINE[%s] push failed %s: %s", ch.name, resp.status_code, resp.text)
    _log_push(ch, user_id, "text", text, resp, None, triggered_by, reference_id)


def push_with_quick_reply(
    user_id: str,
    text: str,
    report_id: str,
    ch: LineChannel = PRIMARY,
    *,
    triggered_by: str | None = None,
) -> None:
    """แจ้งเตือนพร้อมปุ่ม [วิเคราะห์]"""
    try:
        resp = httpx.post(
            "https://api.line.me/v2/bot/message/push",
            headers={"Authorization": f"Bearer {_get_token(ch)}", "Content-Type": "application/json"},
            json={
                "to": user_id,
                "messages": [{
                    "type": "text",
                    "text": _truncate(text),
                    "quickReply": {
                        "items": [{
                            "type": "action",
                            "action": {
                                "type":  "message",
                                "label": "วิเคราะห์",
                                "text":  f"วิเคราะห์ {report_id}",
                            },
                        }],
                    },
                }],
            },
            timeout=10,
        )
    except Exception as exc:
        log.error("LINE[%s] push (quick) exception: %s", ch.name, exc)
        _log_push(ch, user_id, "quick_reply", text, None, exc, triggered_by, report_id)
        raise
    if resp.status_code != 200:
        log.error("LINE[%s] push (quick) failed %s: %s", ch.name, resp.status_code, resp.text)
    _log_push(ch, user_id, "quick_reply", text, resp, None, triggered_by, report_id)
