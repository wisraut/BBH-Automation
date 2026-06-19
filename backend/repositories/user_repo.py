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
                SELECT id, email, display_name, role, specialty, avatar_url, is_active
                FROM users
                WHERE id = %s
                LIMIT 1
                """,
                (user_id,),
            )
            return cur.fetchone()


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
