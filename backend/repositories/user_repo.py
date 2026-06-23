"""CRUD helpers for dashboard users and auth audit logs."""
from typing import Any

from core.mysql import mysql_db


def find_user_by_email(email: str) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_hash, display_name, role, specialty, avatar_url,
                       is_active, last_login_at
                FROM users
                WHERE email = %s
                LIMIT 1
                """,
                (email,),
            )
            return cur.fetchone()


def find_user_by_id(user_id: int) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_hash, display_name, role, specialty, avatar_url,
                       is_active, last_login_at
                FROM users
                WHERE id = %s
                LIMIT 1
                """,
                (user_id,),
            )
            return cur.fetchone()


def list_doctors() -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, display_name, specialty, email
                FROM users
                WHERE role = 'doctor' AND is_active = 1
                ORDER BY display_name
                """
            )
            return cur.fetchall()


def update_password_hash(user_id: int, password_hash: str) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE users SET password_hash = %s WHERE id = %s",
                (password_hash, user_id),
            )
        conn.commit()
    return rows


def list_audit_logs_by_user(user_id: int, *, limit: int = 20) -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, event_type, email, ip_address, user_agent,
                       fail_reason, created_at
                FROM auth_audit_logs
                WHERE user_id = %s
                ORDER BY created_at DESC
                LIMIT %s
                """,
                (user_id, limit),
            )
            return cur.fetchall()


def mark_login_success(user_id: int) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET last_login_at = NOW() WHERE id = %s", (user_id,))
        conn.commit()


def mark_logout(user_id: int) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("UPDATE users SET last_logout_at = NOW() WHERE id = %s", (user_id,))
        conn.commit()


def insert_auth_audit(
    *,
    event_type: str,
    email: str,
    ip_address: str,
    user_agent: str | None,
    user_id: int | None = None,
    fail_reason: str | None = None,
) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth_audit_logs
                    (event_type, user_id, email, ip_address, user_agent, fail_reason)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (event_type, user_id, email, ip_address, user_agent, fail_reason),
            )
        conn.commit()
