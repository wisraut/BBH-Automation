"""CRUD helpers for patient_reports + patient_report_analyses."""
from typing import Any

from core.mysql import mysql_db


_REPORT_LIST_COLUMNS = (
    "id, patient_id, source, report_type, title, file_mime, file_size, "
    "file_path IS NOT NULL AS has_file, "
    "extracted_text IS NOT NULL AND CHAR_LENGTH(extracted_text) > 0 AS has_extracted_text, "
    "uploaded_by, assigned_doctor_id, notebooklm_url, uploaded_at"
)
_REPORT_DETAIL_COLUMNS = (
    "id, patient_id, source, report_type, title, file_path, file_mime, file_size, "
    "extracted_text, notes, uploaded_by, assigned_doctor_id, notebooklm_url, "
    "uploaded_at, created_at, updated_at"
)


def list_by_patient(patient_id: int) -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    {_REPORT_LIST_COLUMNS},
                    (SELECT MAX(a.created_at) FROM patient_report_analyses a
                       WHERE a.report_id = patient_reports.id) AS latest_analysis_at
                FROM patient_reports
                WHERE patient_id = %s
                ORDER BY uploaded_at DESC
                """,
                (patient_id,),
            )
            return cur.fetchall()


def get_by_id(report_id: int) -> dict[str, Any] | None:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT
                    {_REPORT_DETAIL_COLUMNS},
                    file_path IS NOT NULL AS has_file,
                    extracted_text IS NOT NULL AND CHAR_LENGTH(extracted_text) > 0 AS has_extracted_text,
                    (SELECT MAX(a.created_at) FROM patient_report_analyses a
                       WHERE a.report_id = patient_reports.id) AS latest_analysis_at
                FROM patient_reports
                WHERE id = %s
                LIMIT 1
                """,
                (report_id,),
            )
            return cur.fetchone()


def create(
    *,
    patient_id: int,
    source: str,
    report_type: str,
    title: str,
    file_path: str | None,
    file_mime: str | None,
    file_size: int | None,
    extracted_text: str | None,
    notes: str | None,
    uploaded_by: int | None,
    assigned_doctor_id: int | None = None,
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO patient_reports
                    (patient_id, source, report_type, title, file_path,
                     file_mime, file_size, extracted_text, notes, uploaded_by,
                     assigned_doctor_id)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    patient_id, source, report_type, title, file_path,
                    file_mime, file_size, extracted_text, notes, uploaded_by,
                    assigned_doctor_id,
                ),
            )
            new_id = cur.lastrowid
        conn.commit()
    return new_id


def update_notebooklm_url(report_id: int, url: str | None) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE patient_reports SET notebooklm_url = %s WHERE id = %s",
                (url, report_id),
            )
        conn.commit()
    return rows


def delete(report_id: int) -> int:
    """Delete a report row. patient_report_analyses cascade via FK."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute("DELETE FROM patient_reports WHERE id = %s", (report_id,))
        conn.commit()
    return rows


# ─── Analyses ─────────────────────────────────────────────────────────────────


def list_analyses(report_id: int) -> list[dict[str, Any]]:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, report_id, requested_by, dify_conversation_id,
                       summary_text, triage_decision, decided_by, decided_at, created_at
                FROM patient_report_analyses
                WHERE report_id = %s
                ORDER BY created_at DESC
                """,
                (report_id,),
            )
            return cur.fetchall()


def create_analysis(
    *,
    report_id: int,
    requested_by: int | None,
    dify_conversation_id: str | None,
    summary_text: str,
    raw_response: str | None,
    triage_decision: str,
) -> int:
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO patient_report_analyses
                    (report_id, requested_by, dify_conversation_id,
                     summary_text, raw_response, triage_decision)
                VALUES (%s, %s, %s, %s, %s, %s)
                """,
                (
                    report_id, requested_by, dify_conversation_id,
                    summary_text, raw_response, triage_decision,
                ),
            )
            new_id = cur.lastrowid
        conn.commit()
    return new_id


def decide_triage(
    *, analysis_id: int, decision: str, decided_by: int | None
) -> int:
    """Doctor confirms AI triage suggestion."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE patient_report_analyses
                SET triage_decision = %s, decided_by = %s, decided_at = NOW()
                WHERE id = %s
                """,
                (decision, decided_by, analysis_id),
            )
        conn.commit()
    return rows
