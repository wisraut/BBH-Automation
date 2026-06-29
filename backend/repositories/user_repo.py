"""CRUD helpers for dashboard users and auth audit logs."""
from typing import Any

from core.mysql import mysql_db


def find_user_by_email(email: str) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, email, password_hash, display_name, role, specialty, avatar_url,
                       is_active, last_login_at, created_at, updated_at
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
                       is_active, last_login_at, created_at, updated_at
                FROM users
                WHERE id = %s
                LIMIT 1
                """,
                (user_id,),
            )
            return cur.fetchone()


_USER_COLUMNS = (
    "id, email, display_name, role, specialty, avatar_url, "
    "is_active, last_login_at, created_at, updated_at"
)


def list_users(
    *,
    role: str | None = None,
    is_active: bool | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 30,
) -> tuple[list[dict[str, Any]], int]:
    conditions: list[str] = []
    args: list[Any] = []
    if role:
        conditions.append("role = %s")
        args.append(role)
    if is_active is not None:
        conditions.append("is_active = %s")
        args.append(1 if is_active else 0)
    if search:
        conditions.append("(email LIKE %s OR display_name LIKE %s)")
        s = f"%{search}%"
        args.extend([s, s])
    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * limit
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) AS n FROM users {where_sql}", tuple(args))
            total = int(cur.fetchone()["n"])
            cur.execute(
                f"SELECT {_USER_COLUMNS} FROM users {where_sql} "
                "ORDER BY is_active DESC, role, display_name "
                "LIMIT %s OFFSET %s",
                (*args, limit, offset),
            )
            return cur.fetchall(), total


def create_user(
    *,
    email: str,
    password_hash: str,
    display_name: str,
    role: str,
    specialty: str | None,
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO users (email, password_hash, display_name, role, specialty, is_active)
                VALUES (%s, %s, %s, %s, %s, 1)
                """,
                (email, password_hash, display_name, role, specialty),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def update_user_fields(
    user_id: int,
    *,
    display_name: str | None = None,
    role: str | None = None,
    specialty: str | None = None,
    is_active: bool | None = None,
) -> int:
    fields: list[str] = []
    args: list[Any] = []
    if display_name is not None:
        fields.append("display_name = %s")
        args.append(display_name)
    if role is not None:
        fields.append("role = %s")
        args.append(role)
    if specialty is not None:
        fields.append("specialty = %s")
        args.append(specialty)
    if is_active is not None:
        fields.append("is_active = %s")
        args.append(1 if is_active else 0)
    if not fields:
        return 0
    args.append(user_id)
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                f"UPDATE users SET {', '.join(fields)} WHERE id = %s",
                tuple(args),
            )
        conn.commit()
    return rows


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
