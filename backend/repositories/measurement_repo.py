"""CRUD helpers for patient_measurements (structured lab/biomarker values)."""
from datetime import date
from typing import Any

from core.mysql import mysql_db

_COLUMNS = (
    "id, patient_id, report_id, code, value, unit, measured_at, status, "
    "raw_label, note, created_by, confirmed_by, confirmed_at, created_at"
)


def get_by_id(measurement_id: int) -> dict[str, Any] | None:
    """ดึงค่าตรวจ 1 แถวด้วย id (คืน None ถ้าไม่เจอ)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLUMNS} FROM patient_measurements WHERE id = %s LIMIT 1",
                (measurement_id,),
            )
            return cur.fetchone()


def list_by_patient(
    patient_id: int,
    *,
    status: str | None = None,
    codes: list[str] | None = None,
) -> list[dict[str, Any]]:
    """ค่าตรวจของคนไข้ 1 คน filter ตาม status และ/หรือชุด code ได้ เรียงตามเวลาที่วัดล่าสุดก่อน."""
    conditions = ["patient_id = %s"]
    args: list[Any] = [patient_id]
    if status:
        conditions.append("status = %s")
        args.append(status)
    if codes:
        placeholders = ", ".join(["%s"] * len(codes))
        conditions.append(f"code IN ({placeholders})")
        args.extend(codes)
    where_sql = " AND ".join(conditions)
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS} FROM patient_measurements
                WHERE {where_sql}
                ORDER BY measured_at DESC, code ASC
                """,
                tuple(args),
            )
            return cur.fetchall()


def list_drafts_by_report(report_id: int) -> list[dict[str, Any]]:
    """ค่าตรวจ status='draft' ที่สกัดจากรีพอร์ต 1 ใบ (รอหมอ confirm/reject)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS} FROM patient_measurements
                WHERE report_id = %s AND status = 'draft'
                ORDER BY code ASC
                """,
                (report_id,),
            )
            return cur.fetchall()


def latest_confirmed_by_code(patient_id: int) -> list[dict[str, Any]]:
    """Most recent confirmed value per code — powers the LabResults latest table."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS} FROM patient_measurements m
                WHERE patient_id = %s AND status = 'confirmed'
                  AND NOT EXISTS (
                    SELECT 1 FROM patient_measurements m2
                    WHERE m2.patient_id = m.patient_id AND m2.code = m.code
                      AND m2.status = 'confirmed'
                      AND (m2.measured_at > m.measured_at
                           OR (m2.measured_at = m.measured_at AND m2.id > m.id))
                  )
                ORDER BY code ASC
                """,
                (patient_id,),
            )
            return cur.fetchall()


def series(patient_id: int, code: str) -> list[dict[str, Any]]:
    """Confirmed values for one code, oldest -> newest, for the Biomarker sparkline."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                SELECT {_COLUMNS} FROM patient_measurements
                WHERE patient_id = %s AND code = %s AND status = 'confirmed'
                ORDER BY measured_at ASC, id ASC
                """,
                (patient_id, code),
            )
            return cur.fetchall()


def delete_drafts_by_report(report_id: int) -> int:
    """ลบค่าตรวจ draft ทั้งหมดของรีพอร์ต (เช่นก่อนสกัดใหม่). ลบเฉพาะ draft ไม่แตะ
    ค่าที่ confirmed แล้ว. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "DELETE FROM patient_measurements WHERE report_id = %s AND status = 'draft'",
                (report_id,),
            )
        conn.commit()
    return rows


def insert_bulk_drafts(
    *,
    patient_id: int,
    report_id: int | None,
    rows: list[dict[str, Any]],
) -> int:
    """Insert extracted values as status='draft'. Each row: code, value, unit,
    measured_at, raw_label. Returns count inserted."""
    if not rows:
        return 0
    params = [
        (
            patient_id,
            report_id,
            r["code"],
            r["value"],
            r.get("unit"),
            r["measured_at"],
            r.get("raw_label"),
        )
        for r in rows
    ]
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                INSERT INTO patient_measurements
                    (patient_id, report_id, code, value, unit, measured_at,
                     status, raw_label)
                VALUES (%s, %s, %s, %s, %s, %s, 'draft', %s)
                """,
                params,
            )
        conn.commit()
    return len(params)


def confirm(
    measurement_id: int,
    *,
    confirmed_by: int | None,
    code: str | None = None,
    value: float | None = None,
    unit: str | None = None,
    measured_at: date | None = None,
    note: str | None = None,
) -> int:
    """Set a draft row to confirmed, applying any doctor edits. Only provided
    fields are overwritten. Returns rowcount."""
    sets = ["status = 'confirmed'", "confirmed_by = %s", "confirmed_at = NOW()"]
    args: list[Any] = [confirmed_by]
    if code is not None:
        sets.append("code = %s")
        args.append(code)
    if value is not None:
        sets.append("value = %s")
        args.append(value)
    if unit is not None:
        sets.append("unit = %s")
        args.append(unit)
    if measured_at is not None:
        sets.append("measured_at = %s")
        args.append(measured_at)
    if note is not None:
        sets.append("note = %s")
        args.append(note)
    args.append(measurement_id)
    with mysql_db() as conn:
        with conn.cursor() as cur:
            # Only a draft may be confirmed. This blocks resurrecting a value the
            # doctor already rejected (via a stale/duplicate confirm or bulk-confirm).
            rows = cur.execute(
                f"UPDATE patient_measurements SET {', '.join(sets)} WHERE id = %s AND status = 'draft'",
                tuple(args),
            )
        conn.commit()
    return rows


def reject(measurement_id: int, *, confirmed_by: int | None) -> int:
    """Discard a draft (kept for audit — never hard-deleted). Only a draft may be
    rejected, so a stale/duplicate reject can't wipe a doctor-confirmed value."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                """
                UPDATE patient_measurements
                SET status = 'rejected', confirmed_by = %s, confirmed_at = NOW()
                WHERE id = %s AND status = 'draft'
                """,
                (confirmed_by, measurement_id),
            )
        conn.commit()
    return rows
