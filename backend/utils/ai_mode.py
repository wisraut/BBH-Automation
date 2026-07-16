"""Effective AI mode calculation — combines sticky ai_mode + transient
ai_pause_until + business hours override into one deterministic value.

Priority (highest first):
  1. Outside business hours → force 'auto' (no CRO on duty)
  2. ai_pause_until > now → 'silent' (transient auto-pause)
  3. ai_mode (auto | copilot | silent) as stored

Returned as a dict so n8n + frontend can read structured banner state
without re-deriving it in JS.
"""
from datetime import datetime, time
from zoneinfo import ZoneInfo

from core.config import (
    AI_AUTO_PAUSE_MINUTES,
    CRO_BUSINESS_END,
    CRO_BUSINESS_START,
    CRO_TIMEZONE,
)


def _parse_hhmm(s: str) -> time:
    """แปลง string "HH:MM" (จาก config เวลาทำการ CRO) เป็น datetime.time"""
    h, m = s.split(":")
    return time(int(h), int(m))


_TZ = ZoneInfo(CRO_TIMEZONE)


def in_business_hours(now: datetime | None = None) -> bool:
    """True when current local time is within CRO working window."""
    now = now or datetime.now(_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=_TZ)
    local = now.astimezone(_TZ).time()
    start = _parse_hhmm(CRO_BUSINESS_START)
    end = _parse_hhmm(CRO_BUSINESS_END)
    if start <= end:
        return start <= local < end
    # crosses midnight (e.g. 22:00–02:00) — future-proof
    return local >= start or local < end


def compute_effective(
    ai_mode: str | None,
    ai_pause_until: datetime | None,
    now: datetime | None = None,
    db_says_paused: bool = False,
) -> dict:
    """Return the effective mode + banner metadata.

    db_says_paused: when provided, trust the DB-side comparison
    (ai_pause_until > NOW() in MySQL) instead of doing timezone-tricky
    comparison in Python — MySQL and app container may run on different
    clocks.
    """
    now = now or datetime.now(_TZ)
    if now.tzinfo is None:
        now = now.replace(tzinfo=_TZ)

    if not in_business_hours(now):
        return {
            "effective_mode": "auto",
            "reason": "after_hours",
            "banner": "after_hours",
            "sticky_mode": ai_mode or "auto",
            "pause_until": None,
        }

    if db_says_paused and ai_pause_until is not None:
        return {
            "effective_mode": "silent",
            "reason": "auto_pause",
            "banner": "paused",
            "sticky_mode": ai_mode or "auto",
            "pause_until": ai_pause_until.isoformat() if hasattr(ai_pause_until, "isoformat") else str(ai_pause_until),
        }

    mode = ai_mode or "auto"
    banner_map = {"auto": "auto", "copilot": "copilot", "silent": "silent"}
    return {
        "effective_mode": mode,
        "reason": "sticky_mode",
        "banner": banner_map.get(mode, "auto"),
        "sticky_mode": mode,
        "pause_until": None,
    }


AUTO_PAUSE_MINUTES = AI_AUTO_PAUSE_MINUTES
