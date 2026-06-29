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


def list_recent(
    *,
    assigned_doctor_id: int | None = None,
    report_type: str | None = None,
    source: str | None = None,
    decision: str | None = None,
    search: str | None = None,
    page: int = 1,
    limit: int = 20,
) -> tuple[list[dict[str, Any]], int]:
    """Cross-patient report list with filters for the /reports workspace.

    decision filter values:
      - 'no_analysis' = report has no analyses row
      - 'pending' / 'review' / 'accept' / 'reject' = latest analysis triage_decision
    """
    conditions: list[str] = []
    args: list[Any] = []

    if assigned_doctor_id is not None:
        conditions.append("r.assigned_doctor_id = %s")
        args.append(assigned_doctor_id)
    if report_type:
        conditions.append("r.report_type = %s")
        args.append(report_type)
    if source:
        conditions.append("r.source = %s")
        args.append(source)
    if search:
        conditions.append("(r.title LIKE %s OR p.display_name LIKE %s OR p.hn LIKE %s)")
        s = f"%{search}%"
        args.extend([s, s, s])
    if decision == "no_analysis":
        conditions.append(
            "NOT EXISTS (SELECT 1 FROM patient_report_analyses a WHERE a.report_id = r.id)"
        )
    elif decision in ("pending", "review", "accept", "reject"):
        conditions.append(
            "(SELECT a.triage_decision FROM patient_report_analyses a "
            "WHERE a.report_id = r.id ORDER BY a.created_at DESC LIMIT 1) = %s"
        )
        args.append(decision)

    # Hide soft-deleted from workspace lists
    conditions.append("r.deleted_at IS NULL")
    where_sql = "WHERE " + " AND ".join(conditions) if conditions else ""
    offset = (page - 1) * limit

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT COUNT(*) AS n
                FROM patient_reports r
                JOIN patients p ON p.id = r.patient_id
                {where_sql}
                """,
                tuple(args),
            )
            total = int(cur.fetchone()["n"])

            cur.execute(
                f"""
                SELECT r.id AS report_id, r.patient_id, r.title, r.report_type,
                       r.source, r.uploaded_at, r.notes,
                       r.assigned_doctor_id, r.file_path IS NOT NULL AS has_file,
                       p.display_name AS patient_name, p.hn,
                       (SELECT a.triage_decision FROM patient_report_analyses a
                          WHERE a.report_id = r.id ORDER BY a.created_at DESC LIMIT 1) AS latest_decision,
                       (SELECT a.created_at FROM patient_report_analyses a
                          WHERE a.report_id = r.id ORDER BY a.created_at DESC LIMIT 1) AS analysis_at,
                       u.display_name AS assigned_doctor_name
                FROM patient_reports r
                JOIN patients p ON p.id = r.patient_id
                LEFT JOIN users u ON u.id = r.assigned_doctor_id
                {where_sql}
                ORDER BY r.uploaded_at DESC
                LIMIT %s OFFSET %s
                """,
                (*args, limit, offset),
            )
            return cur.fetchall(), total


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
                WHERE patient_id = %s AND deleted_at IS NULL
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


def soft_delete(report_id: int, *, deleted_by: int | None) -> int:
    """Mark a report deleted. Row + file on disk are retained for compliance —
    only hidden from default queries via deleted_at IS NULL filter."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE patient_reports SET deleted_at = NOW(), deleted_by = %s "
                "WHERE id = %s AND deleted_at IS NULL",
                (deleted_by, report_id),
            )
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
