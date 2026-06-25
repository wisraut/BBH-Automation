"""CRUD helpers for admin_alert_rules / admin_alerts / admin_alert_events.

Schema-only — no business logic, no severity ordering, no ack-expiry
decisions. Those belong in services/alert_service.py and
jobs/admin_alert_evaluator.py.

JSON columns are stored/retrieved as Python objects via json.dumps /
json.loads. Callers pass dict/list; we do not pass raw JSON strings.
"""
import json
from typing import Any

from core.mysql import mysql_db


# ---------------------------------------------------------------------------
# Alert rules
# ---------------------------------------------------------------------------

_RULE_COLUMNS = (
    "rule_key, display_name, description, category, severity, enabled, "
    "threshold_json, evaluator, ack_policy, recheck_seconds, notify_channels, "
    "created_at, updated_at"
)


def list_rules(*, enabled_only: bool = False) -> list[dict[str, Any]]:
    where = "WHERE enabled = 1" if enabled_only else ""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_RULE_COLUMNS} FROM admin_alert_rules {where} "
                "ORDER BY category, rule_key"
            )
            rows = cur.fetchall()
    return [_decode_rule(r) for r in rows]


def get_rule(rule_key: str) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_RULE_COLUMNS} FROM admin_alert_rules "
                "WHERE rule_key = %s LIMIT 1",
                (rule_key,),
            )
            row = cur.fetchone()
    return _decode_rule(row) if row else None


def update_rule_enabled(rule_key: str, enabled: bool) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE admin_alert_rules SET enabled = %s WHERE rule_key = %s",
                (1 if enabled else 0, rule_key),
            )
        conn.commit()
    return rows


def update_rule_threshold(
    rule_key: str, threshold: dict[str, Any]
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE admin_alert_rules SET threshold_json = %s "
                "WHERE rule_key = %s",
                (json.dumps(threshold), rule_key),
            )
        conn.commit()
    return rows


# ---------------------------------------------------------------------------
# Alerts
# ---------------------------------------------------------------------------

_ALERT_COLUMNS = (
    "alert_id, rule_key, subject_type, subject_id, status, severity, title, "
    "detail_json, first_seen_at, last_seen_at, ack_by, ack_at, ack_note, "
    "ack_expires_at, resolved_at, resolved_reason"
)


def list_open_alerts(
    *,
    status: str | None = None,
    severity: str | None = None,
    category: str | None = None,
    rule_key: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[dict[str, Any]], int]:
    """List alerts with optional filters. Joins rules for category filter.

    Returns (rows, total).
    """
    conditions: list[str] = []
    args: list[Any] = []

    if status:
        conditions.append("a.status = %s")
        args.append(status)
    else:
        conditions.append("a.status IN ('open', 'acknowledged')")

    if severity:
        conditions.append("a.severity = %s")
        args.append(severity)
    if rule_key:
        conditions.append("a.rule_key = %s")
        args.append(rule_key)
    if category:
        conditions.append("r.category = %s")
        args.append(category)

    where_sql = "WHERE " + " AND ".join(conditions)

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS n
                FROM admin_alerts a
                JOIN admin_alert_rules r ON r.rule_key = a.rule_key
                {where_sql}
                """,
                tuple(args),
            )
            total = int(cur.fetchone()["n"])

            cur.execute(
                f"""
                SELECT {', '.join('a.' + c for c in _ALERT_COLUMNS.split(', '))},
                       r.category AS rule_category,
                       r.display_name AS rule_display_name,
                       r.ack_policy AS rule_ack_policy
                FROM admin_alerts a
                JOIN admin_alert_rules r ON r.rule_key = a.rule_key
                {where_sql}
                ORDER BY
                    FIELD(a.severity, 'critical', 'warning', 'info'),
                    a.last_seen_at DESC
                LIMIT %s OFFSET %s
                """,
                (*args, limit, offset),
            )
            rows = cur.fetchall()
    return [_decode_alert(r) for r in rows], total


def count_open_alerts_by_rule() -> dict[str, int]:
    """Return {rule_key: count} for dashboard summary widget."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT rule_key, COUNT(*) AS n
                FROM admin_alerts
                WHERE status IN ('open', 'acknowledged')
                GROUP BY rule_key
                """
            )
            rows = cur.fetchall()
    return {r["rule_key"]: int(r["n"]) for r in rows}


def count_open_alerts_by_severity() -> dict[str, int]:
    """Return {severity: count} for KPI badge."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT severity, COUNT(*) AS n
                FROM admin_alerts
                WHERE status IN ('open', 'acknowledged')
                GROUP BY severity
                """
            )
            rows = cur.fetchall()
    return {r["severity"]: int(r["n"]) for r in rows}


def get_alert(alert_id: int) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {', '.join('a.' + c for c in _ALERT_COLUMNS.split(', '))},
                       r.category AS rule_category,
                       r.display_name AS rule_display_name,
                       r.ack_policy AS rule_ack_policy
                FROM admin_alerts a
                JOIN admin_alert_rules r ON r.rule_key = a.rule_key
                WHERE a.alert_id = %s
                LIMIT 1
                """,
                (alert_id,),
            )
            row = cur.fetchone()
    return _decode_alert(row) if row else None


def get_active_alert(
    rule_key: str, subject_type: str, subject_id: str
) -> dict[str, Any] | None:
    """Find existing open/acknowledged alert for the same (rule, subject)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_ALERT_COLUMNS}
                FROM admin_alerts
                WHERE rule_key = %s AND subject_type = %s AND subject_id = %s
                  AND status IN ('open', 'acknowledged')
                LIMIT 1
                """,
                (rule_key, subject_type, subject_id),
            )
            row = cur.fetchone()
    return _decode_alert(row) if row else None


def list_active_subject_ids_for_rule(rule_key: str) -> list[tuple[str, str]]:
    """Return list of (subject_type, subject_id) for all currently active
    alerts of a given rule. Evaluator uses this to find alerts whose source
    state has cleared (auto_close)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT subject_type, subject_id
                FROM admin_alerts
                WHERE rule_key = %s AND status IN ('open', 'acknowledged')
                """,
                (rule_key,),
            )
            rows = cur.fetchall()
    return [(r["subject_type"], r["subject_id"]) for r in rows]


def insert_alert(
    *,
    rule_key: str,
    subject_type: str,
    subject_id: str,
    severity: str,
    title: str,
    detail: dict[str, Any] | None = None,
) -> int:
    """Insert new alert (status='open'). Returns alert_id."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO admin_alerts
                    (rule_key, subject_type, subject_id, severity, title, detail_json)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    rule_key,
                    subject_type,
                    subject_id,
                    severity,
                    title,
                    json.dumps(detail) if detail is not None else None,
                ),
            )
            alert_id = cur.lastrowid
        conn.commit()
    return int(alert_id)


def touch_alert(
    alert_id: int, *, detail: dict[str, Any] | None = None
) -> int:
    """Bump last_seen_at + optionally refresh detail_json (evaluator re-saw)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            if detail is not None:
                rows = cur.execute(
                    """
                    UPDATE admin_alerts
                    SET last_seen_at = CURRENT_TIMESTAMP,
                        detail_json = %s
                    WHERE alert_id = %s
                    """,
                    (json.dumps(detail), alert_id),
                )
            else:
                rows = cur.execute(
                    """
                    UPDATE admin_alerts
                    SET last_seen_at = CURRENT_TIMESTAMP
                    WHERE alert_id = %s
                    """,
                    (alert_id,),
                )
        conn.commit()
    return rows


def acknowledge_alert(
    alert_id: int,
    *,
    ack_by: int,
    note: str | None = None,
    expires_at: str | None = None,
) -> int:
    """Mark alert acknowledged. expires_at is ISO datetime string (sticky policy)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE admin_alerts
                SET status = 'acknowledged',
                    ack_by = %s,
                    ack_at = CURRENT_TIMESTAMP,
                    ack_note = %s,
                    ack_expires_at = %s
                WHERE alert_id = %s AND status = 'open'
                """,
                (ack_by, note, expires_at, alert_id),
            )
        conn.commit()
    return rows


def reopen_acked_alert(alert_id: int) -> int:
    """Sticky policy: clear ack fields so alert re-appears as open."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE admin_alerts
                SET status = 'open',
                    ack_by = NULL,
                    ack_at = NULL,
                    ack_note = NULL,
                    ack_expires_at = NULL,
                    last_seen_at = CURRENT_TIMESTAMP
                WHERE alert_id = %s AND status = 'acknowledged'
                """,
                (alert_id,),
            )
        conn.commit()
    return rows


def resolve_alert(alert_id: int, *, reason: str) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE admin_alerts
                SET status = 'resolved',
                    resolved_at = CURRENT_TIMESTAMP,
                    resolved_reason = %s
                WHERE alert_id = %s AND status IN ('open', 'acknowledged')
                """,
                (reason, alert_id),
            )
        conn.commit()
    return rows


# ---------------------------------------------------------------------------
# Alert events (audit trail)
# ---------------------------------------------------------------------------

def insert_event(
    *,
    alert_id: int,
    event_type: str,
    actor_type: str,
    actor_id: int | None,
    from_status: str | None = None,
    to_status: str | None = None,
    note: str | None = None,
    detail: dict[str, Any] | None = None,
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO admin_alert_events
                    (alert_id, event_type, actor_type, actor_id,
                     from_status, to_status, note, detail_json)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    alert_id,
                    event_type,
                    actor_type,
                    actor_id,
                    from_status,
                    to_status,
                    note,
                    json.dumps(detail) if detail is not None else None,
                ),
            )
            event_id = cur.lastrowid
        conn.commit()
    return int(event_id)


def list_events_for_alert(
    alert_id: int, *, limit: int = 50
) -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT event_id, alert_id, event_type, actor_type, actor_id,
                       from_status, to_status, note, detail_json, created_at
                FROM admin_alert_events
                WHERE alert_id = %s
                ORDER BY created_at DESC, event_id DESC
                LIMIT %s
                """,
                (alert_id, limit),
            )
            rows = cur.fetchall()
    return [_decode_event(r) for r in rows]


def list_recent_events_for_admin(
    *, limit: int = 8
) -> list[dict[str, Any]]:
    """Dashboard 'Recent Audit' widget — last N events across all alerts."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT e.event_id, e.alert_id, e.event_type, e.actor_type,
                       e.actor_id, e.from_status, e.to_status, e.note,
                       e.detail_json, e.created_at,
                       a.title AS alert_title, a.rule_key,
                       a.subject_type, a.subject_id
                FROM admin_alert_events e
                JOIN admin_alerts a ON a.alert_id = e.alert_id
                ORDER BY e.created_at DESC, e.event_id DESC
                LIMIT %s
                """,
                (limit,),
            )
            rows = cur.fetchall()
    return [_decode_event(r) for r in rows]


# ---------------------------------------------------------------------------
# Decoders — pymysql may return JSON column as str or dict depending on driver
# ---------------------------------------------------------------------------

def _decode_json_field(row: dict[str, Any], key: str) -> None:
    value = row.get(key)
    if value is None:
        return
    if isinstance(value, (dict, list)):
        return
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8")
    if isinstance(value, str):
        try:
            row[key] = json.loads(value)
        except json.JSONDecodeError:
            row[key] = None


def _decode_rule(row: dict[str, Any]) -> dict[str, Any]:
    _decode_json_field(row, "threshold_json")
    _decode_json_field(row, "notify_channels")
    row["enabled"] = bool(row.get("enabled"))
    return row


def _decode_alert(row: dict[str, Any]) -> dict[str, Any]:
    _decode_json_field(row, "detail_json")
    return row


def _decode_event(row: dict[str, Any]) -> dict[str, Any]:
    _decode_json_field(row, "detail_json")
    return row
