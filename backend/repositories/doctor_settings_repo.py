"""Per-user personal integration settings (doctor_settings)."""
from typing import Any

from core.mysql import mysql_db


def get(doctor_id: int) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT doctor_id, notebooklm_url, google_calendar_id, updated_at "
                "FROM doctor_settings WHERE doctor_id = %s",
                (doctor_id,),
            )
            return cur.fetchone()


def upsert(
    doctor_id: int, *, notebooklm_url: str | None, google_calendar_id: str | None
) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO doctor_settings (doctor_id, notebooklm_url, google_calendar_id)
                VALUES (%s, %s, %s)
                ON DUPLICATE KEY UPDATE
                    notebooklm_url = VALUES(notebooklm_url),
                    google_calendar_id = VALUES(google_calendar_id)
                """,
                (doctor_id, notebooklm_url, google_calendar_id),
            )
        conn.commit()
