"""Patient care team (patient_doctors) — many-to-many patient↔doctor with roles.

Invariant enforced in code (not by the DB): at most one active `primary` per
patient. Adding/reassigning a primary demotes the previous one to `specialist`.
"""
from typing import Any

from core.mysql import mysql_db

ROLES = ("primary", "specialist", "consultant")


def add_member(*, patient_id: int, doctor_id: int, role: str, added_by: int | None) -> None:
    """Add a doctor to the care team, or update an existing member's role /
    reactivate them. A `primary` role demotes any other current primary."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            if role == "primary":
                cur.execute(
                    "UPDATE patient_doctors SET role = 'specialist' "
                    "WHERE patient_id = %s AND role = 'primary' AND is_active = 1 "
                    "  AND doctor_id <> %s",
                    (patient_id, doctor_id),
                )
            cur.execute(
                """
                INSERT INTO patient_doctors (patient_id, doctor_id, role, is_active, added_by)
                VALUES (%s, %s, %s, 1, %s)
                ON DUPLICATE KEY UPDATE role = VALUES(role), is_active = 1
                """,
                (patient_id, doctor_id, role, added_by),
            )
        conn.commit()


def seed_from_booking(*, patient_id: int, doctor_id: int, added_by: int | None) -> None:
    """Auto-add the booking's assigned doctor to the care team. Becomes the
    `primary` if the patient has none yet, else joins as `specialist`. Never
    overwrites an existing membership's role (only reactivates)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) AS n FROM patient_doctors "
                "WHERE patient_id = %s AND role = 'primary' AND is_active = 1",
                (patient_id,),
            )
            role = "specialist" if cur.fetchone()["n"] else "primary"
            cur.execute(
                """
                INSERT INTO patient_doctors (patient_id, doctor_id, role, is_active, added_by)
                VALUES (%s, %s, %s, 1, %s)
                ON DUPLICATE KEY UPDATE is_active = 1
                """,
                (patient_id, doctor_id, role, added_by),
            )
        conn.commit()


def deactivate(*, patient_id: int, doctor_id: int) -> int:
    """Remove a doctor from the care team (soft — keeps history)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE patient_doctors SET is_active = 0 "
                "WHERE patient_id = %s AND doctor_id = %s AND is_active = 1",
                (patient_id, doctor_id),
            )
        conn.commit()
    return rows


def list_by_patient(patient_id: int, *, active_only: bool = True) -> list[dict[str, Any]]:
    cond = "AND pd.is_active = 1" if active_only else ""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT pd.doctor_id, u.display_name AS doctor_name, u.specialty,
                       pd.role, pd.is_active, pd.added_at
                FROM patient_doctors pd
                JOIN users u ON u.id = pd.doctor_id
                WHERE pd.patient_id = %s {cond}
                ORDER BY FIELD(pd.role, 'primary', 'specialist', 'consultant'), pd.added_at
                """,
                (patient_id,),
            )
            return cur.fetchall()


def panel_patient_ids(doctor_id: int) -> list[int]:
    """Patient ids where this doctor is an active care-team member (the doctor's
    'my patients' panel)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT patient_id FROM patient_doctors "
                "WHERE doctor_id = %s AND is_active = 1",
                (doctor_id,),
            )
            return [r["patient_id"] for r in cur.fetchall()]
