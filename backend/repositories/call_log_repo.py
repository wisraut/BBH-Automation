"""CRUD for patient_call_logs."""
from datetime import datetime
from typing import Any

from core.mysql import mysql_db


def list_by_patient(patient_id: int, *, limit: int = 50) -> list[dict[str, Any]]:
    """ประวัติการโทรของคนไข้ 1 คน เรียงล่าสุดก่อน + join ชื่อผู้โทร (called_by → users)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT c.id, c.patient_id, c.called_at, c.direction, c.outcome,
                       c.duration_min, c.subject, c.reference_booking_uid,
                       c.note, c.called_by, u.display_name AS called_by_name,
                       c.created_at
                FROM patient_call_logs c
                LEFT JOIN users u ON u.id = c.called_by
                WHERE c.patient_id = %s
                ORDER BY c.called_at DESC, c.id DESC
                LIMIT %s
                """,
                (patient_id, limit),
            )
            return cur.fetchall()


def insert(
    *,
    patient_id: int,
    direction: str,
    outcome: str,
    duration_min: int | None,
    subject: str | None,
    reference_booking_uid: str | None,
    note: str | None,
    called_by: int | None,
    called_at: datetime | None = None,
) -> int:
    """บันทึกการโทร 1 ครั้งลง patient_call_logs คืน id ใหม่. ถ้าไม่ส่ง called_at
    ปล่อยให้ DB ใส่เวลาปัจจุบัน (ไม่ใส่คอลัมน์นั้นใน INSERT)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            if called_at is None:
                cur.execute(
                    """
                    INSERT INTO patient_call_logs
                        (patient_id, direction, outcome, duration_min,
                         subject, reference_booking_uid, note, called_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (patient_id, direction, outcome, duration_min,
                     subject, reference_booking_uid, note, called_by),
                )
            else:
                cur.execute(
                    """
                    INSERT INTO patient_call_logs
                        (patient_id, called_at, direction, outcome, duration_min,
                         subject, reference_booking_uid, note, called_by)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (patient_id, called_at, direction, outcome, duration_min,
                     subject, reference_booking_uid, note, called_by),
                )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def delete(call_id: int) -> int:
    """ลบ call log 1 แถวถาวรด้วย id. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "DELETE FROM patient_call_logs WHERE id = %s", (call_id,),
            )
        conn.commit()
    return rows
