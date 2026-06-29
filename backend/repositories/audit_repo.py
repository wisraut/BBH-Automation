"""Patient access audit log (HIPAA-like)."""
import json
from typing import Any

from core.mysql import mysql_db


def log_access(
    *,
    actor: dict[str, Any] | None,
    action: str,
    subject_type: str,
    subject_id: str,
    patient_id: int | None = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    request_path: str | None = None,
    request_method: str | None = None,
    extra: dict[str, Any] | None = None,
) -> None:
    """Insert one audit row. Swallows errors — auditing must never break
    the request flow.
    """
    try:
        actor_id = int(actor["id"]) if actor and "id" in actor else None
        actor_email = actor.get("email") if actor else None
        actor_role = actor.get("role") if actor else None
        with mysql_db() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO patient_access_audit
                        (actor_id, actor_email, actor_role, action,
                         subject_type, subject_id, patient_id,
                         ip_address, user_agent, request_path, request_method,
                         extra_json)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        actor_id, actor_email, actor_role, action,
                        subject_type, str(subject_id), patient_id,
                        ip_address, user_agent, request_path, request_method,
                        json.dumps(extra) if extra else None,
                    ),
                )
            conn.commit()
    except Exception:
        pass


def list_access(
    *,
    actor_id: int | None = None,
    patient_id: int | None = None,
    action: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = 1,
    limit: int = 50,
) -> tuple[list[dict[str, Any]], int]:
    conditions: list[str] = []
    args: list[Any] = []
    if actor_id is not None:
        conditions.append("actor_id = %s")
        args.append(actor_id)
    if patient_id is not None:
        conditions.append("patient_id = %s")
        args.append(patient_id)
    if action:
        conditions.append("action = %s")
        args.append(action)
    if date_from:
        conditions.append("created_at >= %s")
        args.append(date_from)
    if date_to:
        conditions.append("created_at <= %s")
        args.append(date_to)
    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * limit
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS n FROM patient_access_audit {where_sql}", tuple(args))
            total = int(cur.fetchone()["n"])
            cur.execute(
                f"""
                SELECT a.id, a.actor_id, a.actor_email, a.actor_role, a.action,
                       a.subject_type, a.subject_id, a.patient_id,
                       a.ip_address, a.request_path, a.request_method,
                       a.extra_json, a.created_at,
                       p.display_name AS patient_display_name, p.hn AS patient_hn
                FROM patient_access_audit a
                LEFT JOIN patients p ON p.id = a.patient_id
                {where_sql}
                ORDER BY a.created_at DESC, a.id DESC
                LIMIT %s OFFSET %s
                """,
                (*args, limit, offset),
            )
            rows = cur.fetchall()
    # decode extra_json
    for r in rows:
        v = r.get("extra_json")
        if isinstance(v, (bytes, bytearray)):
            v = v.decode("utf-8")
        if isinstance(v, str):
            try:
                r["extra_json"] = json.loads(v)
            except Exception:
                r["extra_json"] = None
    return rows, total
