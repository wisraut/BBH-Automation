"""CRUD for doctor_availability (recurring weekly open-for-booking template)."""
from typing import Any

from core.mysql import mysql_db


def list_by_doctor(doctor_id: int) -> list[dict[str, Any]]:
    """Template ranges for a doctor, times as 'HH:MM' strings (ordered for the
    editor)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, doctor_id, day_of_week,
                       TIME_FORMAT(start_time, '%%H:%%i') AS start_time,
                       TIME_FORMAT(end_time,   '%%H:%%i') AS end_time
                FROM doctor_availability
                WHERE doctor_id = %s
                ORDER BY day_of_week ASC, start_time ASC
                """,
                (doctor_id,),
            )
            return cur.fetchall()


def has_template(doctor_id: int) -> bool:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM doctor_availability WHERE doctor_id = %s LIMIT 1",
                (doctor_id,),
            )
            return cur.fetchone() is not None


def replace_for_doctor(
    *, doctor_id: int, ranges: list[dict[str, Any]], created_by: int | None
) -> int:
    """PUT semantics: replace the doctor's whole template atomically. Each range:
    day_of_week (int 0-6), start_time, end_time ('HH:MM'). Returns count written."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM doctor_availability WHERE doctor_id = %s", (doctor_id,))
            if ranges:
                cur.executemany(
                    """
                    INSERT INTO doctor_availability
                        (doctor_id, day_of_week, start_time, end_time, created_by)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    [
                        (doctor_id, r["day_of_week"], r["start_time"], r["end_time"], created_by)
                        for r in ranges
                    ],
                )
        conn.commit()
    return len(ranges)


def covers(*, doctor_id: int, day_of_week: int, start_time: str, end_time: str) -> bool:
    """True if the candidate window [start_time, end_time] on `day_of_week` is
    covered by the doctor's open hours. Adjacent/overlapping template ranges are
    merged first, so a booking spanning e.g. 09:00-12:00 + 12:00-17:00 counts as
    covered (times are zero-padded HH:MM:SS, so string order is chronological)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT TIME_FORMAT(start_time, '%%H:%%i:%%s') AS s,
                       TIME_FORMAT(end_time,   '%%H:%%i:%%s') AS e
                FROM doctor_availability
                WHERE doctor_id = %s AND day_of_week = %s
                ORDER BY start_time ASC
                """,
                (doctor_id, day_of_week),
            )
            ranges = [(r["s"], r["e"]) for r in cur.fetchall()]
    merged: list[list[str]] = []
    for s, e in ranges:
        if merged and s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return any(s <= start_time and end_time <= e for s, e in merged)
