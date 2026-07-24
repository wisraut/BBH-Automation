"""CRUD helpers for patients table — parameterized SQL only."""
from datetime import date as _date
from typing import Any

from core.mysql import mysql_db
from utils.phone import normalize_phone


_BASE_COLUMNS = (
    "id, hn, display_name, phone, phone2, phone3, phone4, email, dob, gender, "
    "nationality, national_id, blood_type, address, intake_by, notes, "
    "english_name, religion, marital_status, occupation, "
    "father_name, father_phone, mother_name, mother_phone, "
    "emergency_contact_name, emergency_contact_relation, emergency_contact_phone, "
    "emergency_contact_address, past_illness, congenital_disease, drugs_supplements, "
    "drug_allergy, food_allergy, chief_complaint, smoking, smoking_years, drinking, drinking_years, "
    "created_by, created_at, updated_at"
)


def _serialize(row: dict[str, Any] | None) -> dict[str, Any] | None:
    """แปลงแถวคนไข้ให้ JSON-serializable: cast dob (date) เป็น ISO string.
    คืน None ถ้า row เป็น None."""
    if not row:
        return None
    if isinstance(row.get("dob"), _date):
        row["dob"] = row["dob"].isoformat()
    return row


# Whitelisted sort columns — ORDER BY can't be parameterized, so the sort key is
# mapped through this dict (never interpolated from raw client input).
_SORT_COLUMNS = {
    "hn": "p.hn",
    "name": "p.display_name",
    "latest_visit": "latest_visit_at",
}


def list_patients(
    *, search: str | None, page: int, limit: int, panel_doctor_id: int | None = None,
    sort_key: str = "hn", direction: str = "desc",
) -> tuple[list[dict[str, Any]], int]:
    """List with optional fuzzy search (name/hn/phone) + booking/report counts.

    ``panel_doctor_id`` restricts to that doctor's active care-team panel
    ("my patients")."""
    offset = (page - 1) * limit
    conds = ["p.deleted_at IS NULL"]
    args: tuple[Any, ...] = ()
    if search:
        like = f"%{search.strip()}%"
        conds.append("(p.display_name LIKE %s OR p.hn LIKE %s OR p.phone LIKE %s)")
        args = (like, like, like)
    if panel_doctor_id is not None:
        conds.append(
            "EXISTS (SELECT 1 FROM patient_doctors pd "
            "WHERE pd.patient_id = p.id AND pd.doctor_id = %s AND pd.is_active = 1)"
        )
        args = (*args, panel_doctor_id)
    where_sql = "WHERE " + " AND ".join(conds)

    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT COUNT(*) AS n FROM patients p {where_sql}",
                args,
            )
            total = int(cur.fetchone()["n"])

            order_col = _SORT_COLUMNS.get(sort_key, "p.hn")
            order_dir = "ASC" if direction == "asc" else "DESC"
            cur.execute(
                f"""
                SELECT
                    p.id,
                    p.hn,
                    p.display_name,
                    p.phone,
                    p.gender,
                    p.dob,
                    p.created_at,
                    (SELECT COUNT(*) FROM booking_requests b WHERE b.patient_id = p.id) AS total_bookings,
                    (SELECT COUNT(*) FROM patient_reports r WHERE r.patient_id = p.id) AS total_reports,
                    (SELECT MAX(b.approved_at) FROM booking_requests b
                       WHERE b.patient_id = p.id AND b.status = 'approved') AS latest_visit_at
                FROM patients p
                {where_sql}
                ORDER BY {order_col} {order_dir}, p.id DESC
                LIMIT %s OFFSET %s
                """,
                (*args, limit, offset),
            )
            rows = cur.fetchall()
    return rows, total


def get_by_id(patient_id: int, *, include_deleted: bool = False) -> dict[str, Any] | None:
    """ดึงคนไข้ 1 คนด้วย id (คืน None ถ้าไม่เจอ). ปกติกรอง soft-deleted ทิ้ง —
    include_deleted=True ถึงจะเห็นคนไข้ที่ถูกลบ."""
    extra = "" if include_deleted else " AND deleted_at IS NULL"
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_BASE_COLUMNS} FROM patients WHERE id = %s{extra} LIMIT 1",
                (patient_id,),
            )
            return _serialize(cur.fetchone())


def find_candidates_by_phone(phone_normalized: str, *, limit: int = 5) -> list[dict[str, Any]]:
    """Existing (non-deleted) patients whose normalized phone matches. Used at
    approve time to let the CRO confirm identity instead of auto-merging on a
    weak identifier. Ordered oldest-first (most-established record on top)."""
    if not phone_normalized:
        return []
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT p.id, p.hn, p.display_name, p.phone, p.dob,
                    (SELECT MAX(b.approved_at) FROM booking_requests b
                       WHERE b.patient_id = p.id AND b.status = 'approved') AS latest_visit_at
                FROM patients p
                WHERE p.phone_normalized = %s AND p.deleted_at IS NULL
                ORDER BY p.id ASC
                LIMIT %s
                """,
                (phone_normalized, limit),
            )
            return [_serialize(r) for r in cur.fetchall()]


def get_by_hn(hn: str) -> dict[str, Any] | None:
    """ดึงคนไข้ที่ยังไม่ถูกลบด้วยเลข HN (คืน None ถ้าไม่เจอ)."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT {_BASE_COLUMNS} FROM patients WHERE hn = %s AND deleted_at IS NULL LIMIT 1",
                (hn,),
            )
            return _serialize(cur.fetchone())


def create(
    *,
    hn: str,
    display_name: str,
    phone: str | None,
    email: str | None,
    dob: _date | None,
    gender: str | None,
    nationality: str | None,
    notes: str | None,
    created_by: int | None,
) -> int:
    """สร้างคนไข้ใหม่ คืน id ใหม่. เก็บ phone_normalized คู่กับ phone เพื่อให้
    match ตอน booking ไม่พลาดเพราะ format เบอร์ต่างกัน."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO patients
                    (hn, display_name, phone, phone_normalized, email, dob, gender, nationality, notes, created_by)
                VALUES
                    (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (hn, display_name, phone, normalize_phone(phone) or None,
                 email, dob, gender, nationality, notes, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return new_id


def update(*, patient_id: int, fields: dict[str, Any]) -> int:
    """อัปเดตเฉพาะ field ที่ส่งมาของคนไข้. ถ้าแก้ phone จะ sync phone_normalized
    ให้ทันทีกัน index หลุด. ไม่มี field = คืน 0 ไม่แตะ DB. คืนจำนวนแถวที่แก้."""
    if not fields:
        return 0
    # Keep phone_normalized in lockstep whenever the raw phone changes, so the
    # matching index never goes stale against the displayed number.
    if "phone" in fields:
        fields = {**fields, "phone_normalized": normalize_phone(fields["phone"]) or None}
    cols = ", ".join(f"{k} = %s" for k in fields)
    values = tuple(fields.values()) + (patient_id,)
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                f"UPDATE patients SET {cols} WHERE id = %s",
                values,
            )
        conn.commit()
    return rows


def soft_delete(patient_id: int, *, deleted_by: int | None) -> int:
    """Mark patient deleted. Reports/bookings/audit rows are retained for
    legal retention — only the patient row is hidden from default queries."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE patients SET deleted_at = NOW(), deleted_by = %s "
                "WHERE id = %s AND deleted_at IS NULL",
                (deleted_by, patient_id),
            )
        conn.commit()
    return rows


def reserve_hn(year_yy: str) -> str:
    """Generate next HN for the year — atomic via patient_hn_counters."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO patient_hn_counters (year_yy, last_seq)
                VALUES (%s, 0)
                ON DUPLICATE KEY UPDATE year_yy = VALUES(year_yy)
                """,
                (year_yy,),
            )
            cur.execute(
                "SELECT last_seq FROM patient_hn_counters WHERE year_yy = %s FOR UPDATE",
                (year_yy,),
            )
            next_seq = int(cur.fetchone()["last_seq"]) + 1
            cur.execute(
                "UPDATE patient_hn_counters SET last_seq = %s WHERE year_yy = %s",
                (next_seq, year_yy),
            )
        conn.commit()
    return f"{year_yy}-{next_seq:04d}"
