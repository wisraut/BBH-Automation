"""Business logic for admin alerts.

Layer rules:
- API → calls this module only (no direct repo access)
- This module → calls repositories.alert_repo only (no SQL here)
- Decisions about ack_policy, ack expiry timing, status transitions live here
"""
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from repositories import alert_repo


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def list_alerts(
    *,
    status: str | None,
    severity: str | None,
    category: str | None,
    rule_key: str | None,
    page: int,
    limit: int,
) -> dict[str, Any]:
    offset = (page - 1) * limit
    rows, total = alert_repo.list_open_alerts(
        status=status,
        severity=severity,
        category=category,
        rule_key=rule_key,
        limit=limit,
        offset=offset,
    )
    pages = (total + limit - 1) // limit if limit else 1
    return {
        "data": rows,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": pages,
        },
    }


def get_alert_with_events(alert_id: int) -> dict[str, Any]:
    alert = alert_repo.get_alert(alert_id)
    if not alert:
        raise HTTPException(
            status_code=404,
            detail={"code": "ALERT_NOT_FOUND", "message": "Alert not found"},
        )
    events = alert_repo.list_events_for_alert(alert_id)
    return {**alert, "events": events}


def get_summary() -> dict[str, Any]:
    by_rule = alert_repo.count_open_alerts_by_rule()
    by_severity = alert_repo.count_open_alerts_by_severity()
    return {
        "by_rule": by_rule,
        "by_severity": by_severity,
        "total_active": sum(by_rule.values()),
    }


def list_rules() -> list[dict[str, Any]]:
    return alert_repo.list_rules()


def list_recent_events(limit: int = 8) -> list[dict[str, Any]]:
    return alert_repo.list_recent_events_for_admin(limit=limit)


# ---------------------------------------------------------------------------
# Mutations
# ---------------------------------------------------------------------------

def acknowledge(
    alert_id: int,
    *,
    user_id: int,
    note: str | None,
    snooze_hours: int | None,
) -> dict[str, Any]:
    alert = alert_repo.get_alert(alert_id)
    if not alert:
        raise HTTPException(404, {"code": "ALERT_NOT_FOUND", "message": "Alert not found"})
    if alert["status"] != "open":
        raise HTTPException(
            409,
            {
                "code": "ALERT_NOT_OPEN",
                "message": f"Cannot ack alert in status '{alert['status']}'",
            },
        )

    expires_at_str: str | None = None
    if snooze_hours:
        expires_at = datetime.now(timezone.utc) + timedelta(hours=snooze_hours)
        expires_at_str = expires_at.strftime("%Y-%m-%d %H:%M:%S")

    rows = alert_repo.acknowledge_alert(
        alert_id, ack_by=user_id, note=note, expires_at=expires_at_str
    )
    if rows == 0:
        # Lost race — another admin acked first
        raise HTTPException(
            409,
            {"code": "ALERT_RACE_LOST", "message": "Alert state changed; refresh and retry"},
        )

    alert_repo.insert_event(
        alert_id=alert_id,
        event_type="acknowledged",
        actor_type="admin",
        actor_id=user_id,
        from_status="open",
        to_status="acknowledged",
        note=note,
        detail={"snooze_hours": snooze_hours} if snooze_hours else None,
    )
    return alert_repo.get_alert(alert_id) or {}


def resolve(
    alert_id: int,
    *,
    user_id: int,
    reason: str,
    note: str | None,
) -> dict[str, Any]:
    alert = alert_repo.get_alert(alert_id)
    if not alert:
        raise HTTPException(404, {"code": "ALERT_NOT_FOUND", "message": "Alert not found"})
    if alert["status"] == "resolved":
        raise HTTPException(
            409, {"code": "ALERT_ALREADY_RESOLVED", "message": "Alert already resolved"}
        )

    rows = alert_repo.resolve_alert(alert_id, reason=reason)
    if rows == 0:
        raise HTTPException(
            409,
            {"code": "ALERT_RACE_LOST", "message": "Alert state changed; refresh and retry"},
        )

    alert_repo.insert_event(
        alert_id=alert_id,
        event_type="resolved",
        actor_type="admin",
        actor_id=user_id,
        from_status=alert["status"],
        to_status="resolved",
        note=note,
        detail={"reason": reason},
    )
    return alert_repo.get_alert(alert_id) or {}


def set_rule_enabled(rule_key: str, enabled: bool) -> dict[str, Any]:
    rule = alert_repo.get_rule(rule_key)
    if not rule:
        raise HTTPException(404, {"code": "RULE_NOT_FOUND", "message": "Rule not found"})
    alert_repo.update_rule_enabled(rule_key, enabled)
    return alert_repo.get_rule(rule_key) or {}


def set_rule_threshold(rule_key: str, threshold: dict[str, Any]) -> dict[str, Any]:
    rule = alert_repo.get_rule(rule_key)
    if not rule:
        raise HTTPException(404, {"code": "RULE_NOT_FOUND", "message": "Rule not found"})
    alert_repo.update_rule_threshold(rule_key, threshold)
    return alert_repo.get_rule(rule_key) or {}
