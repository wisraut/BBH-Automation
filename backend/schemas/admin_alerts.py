"""Pydantic v2 schemas for admin dashboard alerts."""
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


AlertStatus = Literal["open", "acknowledged", "resolved"]
AlertSeverity = Literal["info", "warning", "critical"]
RuleCategory = Literal["operations", "security", "integration", "data_quality"]
AckPolicy = Literal["auto_close", "manual", "sticky"]


class RuleOut(BaseModel):
    rule_key: str
    display_name: str
    description: str | None = None
    category: RuleCategory
    severity: AlertSeverity
    enabled: bool
    threshold_json: dict[str, Any] = Field(default_factory=dict)
    evaluator: str
    ack_policy: AckPolicy
    recheck_seconds: int
    notify_channels: list[str] | None = None
    created_at: datetime
    updated_at: datetime


class AlertOut(BaseModel):
    alert_id: int
    rule_key: str
    rule_display_name: str
    rule_category: RuleCategory
    rule_ack_policy: AckPolicy
    subject_type: str
    subject_id: str
    status: AlertStatus
    severity: AlertSeverity
    title: str
    detail_json: dict[str, Any] | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    ack_by: int | None = None
    ack_at: datetime | None = None
    ack_note: str | None = None
    ack_expires_at: datetime | None = None
    resolved_at: datetime | None = None
    resolved_reason: str | None = None


class AlertListResponse(BaseModel):
    data: list[AlertOut]
    pagination: dict[str, int]


class AlertSummary(BaseModel):
    """Dashboard widget payload — totals by rule + severity."""
    by_rule: dict[str, int] = Field(default_factory=dict)
    by_severity: dict[str, int] = Field(default_factory=dict)
    total_active: int = 0


class AlertEventOut(BaseModel):
    event_id: int
    alert_id: int
    event_type: str
    actor_type: Literal["system", "admin"]
    actor_id: int | None = None
    from_status: str | None = None
    to_status: str | None = None
    note: str | None = None
    detail_json: dict[str, Any] | None = None
    created_at: datetime


class AckRequest(BaseModel):
    note: str | None = Field(default=None, max_length=1000)
    snooze_hours: int | None = Field(default=None, ge=1, le=24 * 30)


class ResolveRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=1000)


class RuleEnableRequest(BaseModel):
    enabled: bool


class RuleThresholdRequest(BaseModel):
    threshold: dict[str, Any]


class SimpleOk(BaseModel):
    ok: bool = True
