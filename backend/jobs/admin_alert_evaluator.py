"""Periodic admin alert evaluator.

For each enabled rule, run its evaluator function → upsert open alerts in
admin_alerts. For rules with ack_policy='auto_close', any existing open/acked
alert whose subject is no longer surfaced this run is auto-resolved.

Runs as background task via asyncio.create_task() in lifespan.

Adding a new rule:
1. Insert row in admin_alert_rules (or via SQL migration)
2. Add eval_<name>(rule, conn) function returning list[Candidate]
3. Register in EVALUATORS dict below
"""
import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable

from core.mysql import mysql_db
from repositories import alert_repo


log = logging.getLogger("admin_alert_evaluator")


@dataclass
class Candidate:
    subject_type: str
    subject_id: str
    title: str
    detail: dict[str, Any]


EvaluatorFn = Callable[[dict[str, Any]], list[Candidate]]


# ---------------------------------------------------------------------------
# Evaluators — one per rule_key
# ---------------------------------------------------------------------------

def eval_stuck_reports(rule: dict[str, Any]) -> list[Candidate]:
    """patient_report_analyses with triage_decision='pending' older than threshold."""
    threshold = int(rule["threshold_json"].get("minutes", 5))
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.id AS analysis_id, a.report_id, a.created_at,
                       TIMESTAMPDIFF(MINUTE, a.created_at, NOW()) AS stuck_min,
                       r.patient_id, r.title
                FROM patient_report_analyses a
                JOIN patient_reports r ON r.id = a.report_id
                WHERE a.triage_decision = 'pending'
                  AND a.decided_at IS NULL
                  AND a.created_at < NOW() - INTERVAL %s MINUTE
                """,
                (threshold,),
            )
            rows = cur.fetchall()
    return [
        Candidate(
            subject_type="analysis",
            subject_id=str(r["analysis_id"]),
            title=f"Analysis #{r['analysis_id']} pending review for {r['stuck_min']} min",
            detail={
                "report_id": r["report_id"],
                "patient_id": r["patient_id"],
                "stuck_minutes": int(r["stuck_min"]),
                "report_title": r["title"],
            },
        )
        for r in rows
    ]


def eval_stale_cro_approvals(rule: dict[str, Any]) -> list[Candidate]:
    """booking_requests in pending_approval past SLA."""
    threshold = int(rule["threshold_json"].get("hours", 24))
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT request_uid, patient_name, phone, created_at,
                       TIMESTAMPDIFF(HOUR, created_at, NOW()) AS waiting_hours
                FROM booking_requests
                WHERE status = 'pending_approval'
                  AND created_at < NOW() - INTERVAL %s HOUR
                """,
                (threshold,),
            )
            rows = cur.fetchall()
    return [
        Candidate(
            subject_type="booking",
            subject_id=r["request_uid"],
            title=(
                f"Booking {r['request_uid']} waiting CRO {r['waiting_hours']}h "
                f"({r['patient_name']})"
            ),
            detail={
                "patient_name": r["patient_name"],
                "phone": r["phone"],
                "waiting_hours": int(r["waiting_hours"]),
            },
        )
        for r in rows
    ]


def eval_failed_line_pushes(rule: dict[str, Any]) -> list[Candidate]:
    """line_push_log failed rows in the recent window — aggregated to one alert per channel."""
    window = int(rule["threshold_json"].get("window_minutes", 60))
    min_count = int(rule["threshold_json"].get("min_count", 1))
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT channel, COUNT(*) AS fail_count,
                       MAX(created_at) AS last_failed_at
                FROM line_push_log
                WHERE status = 'failed'
                  AND created_at >= NOW() - INTERVAL %s MINUTE
                GROUP BY channel
                HAVING COUNT(*) >= %s
                """,
                (window, min_count),
            )
            rows = cur.fetchall()
    out: list[Candidate] = []
    for r in rows:
        last = r["last_failed_at"]
        out.append(
            Candidate(
                subject_type="push",
                subject_id=r["channel"],
                title=(
                    f"{r['fail_count']} LINE push failures on '{r['channel']}' "
                    f"in last {window} min"
                ),
                detail={
                    "channel": r["channel"],
                    "fail_count": int(r["fail_count"]),
                    "window_minutes": window,
                    "last_failed_at": last.isoformat() if last else None,
                },
            )
        )
    return out


def eval_unassigned_patients(rule: dict[str, Any]) -> list[Candidate]:
    """Patients with no assigned doctor on any of their patient_reports."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.id AS patient_id, p.display_name, p.hn, p.created_at
                FROM patients p
                WHERE NOT EXISTS (
                    SELECT 1 FROM patient_reports r
                    WHERE r.patient_id = p.id AND r.assigned_doctor_id IS NOT NULL
                )
                  AND p.created_at < NOW() - INTERVAL 1 DAY
                ORDER BY p.created_at DESC
                LIMIT 100
                """
            )
            rows = cur.fetchall()
    return [
        Candidate(
            subject_type="patient",
            subject_id=str(r["patient_id"]),
            title=f"{r['display_name']} ({r['hn'] or 'no HN'}) has no assigned doctor",
            detail={
                "patient_id": r["patient_id"],
                "hn": r["hn"],
                "display_name": r["display_name"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            },
        )
        for r in rows
    ]


def eval_disabled_user_sessions(rule: dict[str, Any]) -> list[Candidate]:
    """Disabled users (is_active=0) who logged in recently — JWT may still be valid."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id AS user_id, email, display_name, role, last_login_at,
                       TIMESTAMPDIFF(HOUR, last_login_at, NOW()) AS hours_since_login
                FROM users
                WHERE is_active = 0
                  AND last_login_at IS NOT NULL
                  AND last_login_at >= NOW() - INTERVAL 24 HOUR
                """
            )
            rows = cur.fetchall()
    return [
        Candidate(
            subject_type="user",
            subject_id=str(r["user_id"]),
            title=(
                f"Disabled user {r['email']} ({r['role']}) "
                f"last logged in {r['hours_since_login']}h ago"
            ),
            detail={
                "user_id": r["user_id"],
                "email": r["email"],
                "display_name": r["display_name"],
                "role": r["role"],
                "last_login_at": r["last_login_at"].isoformat() if r["last_login_at"] else None,
            },
        )
        for r in rows
    ]


EVALUATORS: dict[str, EvaluatorFn] = {
    "eval_stuck_reports": eval_stuck_reports,
    "eval_stale_cro_approvals": eval_stale_cro_approvals,
    "eval_failed_line_pushes": eval_failed_line_pushes,
    "eval_unassigned_patients": eval_unassigned_patients,
    "eval_disabled_user_sessions": eval_disabled_user_sessions,
}


# ---------------------------------------------------------------------------
# Upsert + auto-close + ack expiry
# ---------------------------------------------------------------------------

def _upsert_for_rule(rule: dict[str, Any], candidates: list[Candidate]) -> None:
    """sync alert ให้ตรงกับ candidate ที่ evaluator เจอในรอบนี้:
    subject ใหม่ = insert, subject เดิม = touch (+ reopen ถ้าหมด ack window),
    subject ที่หายไป = auto-resolve เฉพาะ rule ที่ ack_policy='auto_close' (state หายเอง)"""
    severity = rule["severity"]
    rule_key = rule["rule_key"]
    seen_subjects: set[tuple[str, str]] = set()

    for cand in candidates:
        key = (cand.subject_type, cand.subject_id)
        seen_subjects.add(key)

        existing = alert_repo.get_active_alert(
            rule_key, cand.subject_type, cand.subject_id
        )
        if existing:
            alert_repo.touch_alert(existing["alert_id"], detail=cand.detail)

            # Sticky policy: if ack window expired, reopen
            if existing["status"] == "acknowledged":
                expires = existing.get("ack_expires_at")
                if expires and _is_past(expires):
                    alert_repo.reopen_acked_alert(existing["alert_id"])
                    alert_repo.insert_event(
                        alert_id=existing["alert_id"],
                        event_type="re_triggered",
                        actor_type="system",
                        actor_id=None,
                        from_status="acknowledged",
                        to_status="open",
                        note="ack window expired",
                    )
        else:
            alert_id = alert_repo.insert_alert(
                rule_key=rule_key,
                subject_type=cand.subject_type,
                subject_id=cand.subject_id,
                severity=severity,
                title=cand.title,
                detail=cand.detail,
            )
            alert_repo.insert_event(
                alert_id=alert_id,
                event_type="opened",
                actor_type="system",
                actor_id=None,
                to_status="open",
                detail=cand.detail,
            )

    # Auto-close: any active alert for this rule whose subject is no longer
    # surfaced this run gets resolved (only if ack_policy='auto_close').
    if rule["ack_policy"] == "auto_close":
        active = alert_repo.list_active_subject_ids_for_rule(rule_key)
        stale = [s for s in active if s not in seen_subjects]
        for subject_type, subject_id in stale:
            existing = alert_repo.get_active_alert(rule_key, subject_type, subject_id)
            if not existing:
                continue
            alert_repo.resolve_alert(
                existing["alert_id"], reason="auto_state_cleared"
            )
            alert_repo.insert_event(
                alert_id=existing["alert_id"],
                event_type="resolved",
                actor_type="system",
                actor_id=None,
                from_status=existing["status"],
                to_status="resolved",
                note="source state cleared",
            )


def _is_past(dt: datetime) -> bool:
    """คืน True ถ้าเวลา dt ผ่านมาแล้วเทียบกับตอนนี้ (UTC)
    เติม tzinfo=UTC ให้ naive datetime ก่อนเทียบ กัน error 'compare naive vs aware'"""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt < datetime.now(timezone.utc)


def run_once() -> None:
    """Single evaluation pass over all enabled rules."""
    rules = alert_repo.list_rules(enabled_only=True)
    for rule in rules:
        fn = EVALUATORS.get(rule["evaluator"])
        if not fn:
            log.warning("No evaluator function for rule %s (=%s)",
                        rule["rule_key"], rule["evaluator"])
            continue
        try:
            candidates = fn(rule)
            _upsert_for_rule(rule, candidates)
        except Exception:
            log.exception("Evaluator %s failed for rule %s",
                          rule["evaluator"], rule["rule_key"])


async def start_evaluator(interval_seconds: int = 60) -> None:
    """Async loop — run_once() every interval_seconds. Cancellable."""
    log.info("Admin alert evaluator started (interval=%ds)", interval_seconds)
    while True:
        try:
            await asyncio.to_thread(run_once)
        except asyncio.CancelledError:
            log.info("Admin alert evaluator stopped")
            raise
        except Exception:
            log.exception("Evaluator pass crashed; will retry")
        await asyncio.sleep(interval_seconds)
