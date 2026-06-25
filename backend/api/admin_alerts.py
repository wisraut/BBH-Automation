"""Admin alerts API — Action Required panel + summary widgets.

All routes guarded by JWT + admin role.
"""
from fastapi import APIRouter, Depends, Query

from core.security import require_user
from schemas.admin_alerts import (
    AckRequest,
    AlertOut,
    AlertSummary,
    ResolveRequest,
    RuleEnableRequest,
    RuleOut,
    RuleThresholdRequest,
    SimpleOk,
)
from services import alert_service


router = APIRouter(prefix="/api/admin/alerts", tags=["admin-alerts"])

_admin_only = require_user(["admin"])


@router.get("")
def list_alerts(
    status: str | None = Query(default=None, pattern="^(open|acknowledged|resolved)$"),
    severity: str | None = Query(default=None, pattern="^(info|warning|critical)$"),
    category: str | None = Query(
        default=None, pattern="^(operations|security|integration|data_quality)$"
    ),
    rule_key: str | None = Query(default=None, max_length=64),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=200),
    _user=Depends(_admin_only),
):
    """List alerts with filters; default = open + acknowledged (active)."""
    return alert_service.list_alerts(
        status=status,
        severity=severity,
        category=category,
        rule_key=rule_key,
        page=page,
        limit=limit,
    )


@router.get("/summary", response_model=AlertSummary)
def alert_summary(_user=Depends(_admin_only)):
    """Dashboard summary widget — counts by rule + severity."""
    return alert_service.get_summary()


@router.get("/events/recent")
def recent_events(
    limit: int = Query(default=8, ge=1, le=50),
    _user=Depends(_admin_only),
):
    """Recent audit feed for dashboard."""
    return {"data": alert_service.list_recent_events(limit=limit)}


@router.get("/{alert_id}")
def get_alert(alert_id: int, _user=Depends(_admin_only)):
    """Single alert with full event history."""
    return alert_service.get_alert_with_events(alert_id)


@router.post("/{alert_id}/acknowledge", response_model=AlertOut)
def acknowledge_alert(
    alert_id: int,
    body: AckRequest,
    user=Depends(_admin_only),
):
    return alert_service.acknowledge(
        alert_id,
        user_id=user["id"],
        note=body.note,
        snooze_hours=body.snooze_hours,
    )


@router.post("/{alert_id}/resolve", response_model=AlertOut)
def resolve_alert(
    alert_id: int,
    body: ResolveRequest,
    user=Depends(_admin_only),
):
    return alert_service.resolve(
        alert_id,
        user_id=user["id"],
        reason=body.reason,
        note=body.note,
    )


# ---- Rule management -----------------------------------------------------

rules_router = APIRouter(prefix="/api/admin/alert-rules", tags=["admin-alerts"])


@rules_router.get("", response_model=list[RuleOut])
def list_rules(_user=Depends(_admin_only)):
    return alert_service.list_rules()


@rules_router.patch("/{rule_key}/enabled", response_model=RuleOut)
def patch_rule_enabled(
    rule_key: str, body: RuleEnableRequest, _user=Depends(_admin_only)
):
    return alert_service.set_rule_enabled(rule_key, body.enabled)


@rules_router.patch("/{rule_key}/threshold", response_model=RuleOut)
def patch_rule_threshold(
    rule_key: str, body: RuleThresholdRequest, _user=Depends(_admin_only)
):
    return alert_service.set_rule_threshold(rule_key, body.threshold)
