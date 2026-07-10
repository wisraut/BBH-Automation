"""Per-user personal integration settings (doctor_settings)."""
from typing import Any

from core.mysql import mysql_db


def get(doctor_id: int) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT doctor_id, notebooklm_url, updated_at "
                "FROM doctor_settings WHERE doctor_id = %s",
                (doctor_id,),
            )
            return cur.fetchone()


def upsert(doctor_id: int, *, notebooklm_url: str | None) -> None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO doctor_settings (doctor_id, notebooklm_url)
                VALUES (%s, %s)
                ON DUPLICATE KEY UPDATE notebooklm_url = VALUES(notebooklm_url)
                """,
                (doctor_id, notebooklm_url),
            )
        conn.commit()
