"""CRUD for doctor_schedule_blocks (vacation/off-hours/conference)."""
from datetime import datetime
from typing import Any

from core.mysql import mysql_db


def list_blocks(
    *,
    doctor_id: int | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
) -> list[dict[str, Any]]:
    conds: list[str] = []
    args: list[Any] = []
    if doctor_id is not None:
        conds.append("b.doctor_id = %s")
        args.append(doctor_id)
    if date_from:
        conds.append("b.end_at >= %s")
        args.append(date_from)
    if date_to:
        conds.append("b.start_at <= %s")
        args.append(date_to)
    where_sql = "WHERE " + " AND ".join(conds) if conds else ""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT b.id, b.doctor_id, u.display_name AS doctor_name, b.block_type,
                       b.start_at, b.end_at, b.reason, b.created_by, b.created_at
                FROM doctor_schedule_blocks b
                LEFT JOIN users u ON u.id = b.doctor_id
                {where_sql}
                ORDER BY b.start_at DESC
                """,
                tuple(args),
            )
            return cur.fetchall()


def insert_block(
    *, doctor_id: int, block_type: str, start_at: datetime, end_at: datetime,
    reason: str | None, created_by: int | None,
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO doctor_schedule_blocks
                    (doctor_id, block_type, start_at, end_at, reason, created_by)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (doctor_id, block_type, start_at, end_at, reason, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def delete_block(block_id: int) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "DELETE FROM doctor_schedule_blocks WHERE id = %s", (block_id,),
            )
        conn.commit()
    return rows


def find_overlap(*, doctor_id: int, start_at: datetime, end_at: datetime) -> dict | None:
    """Return the first block that overlaps a candidate window, or None."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, block_type, start_at, end_at, reason
                FROM doctor_schedule_blocks
                WHERE doctor_id = %s AND start_at < %s AND end_at > %s
                LIMIT 1
                """,
                (doctor_id, end_at, start_at),
            )
            return cur.fetchone()
