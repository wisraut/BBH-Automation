"""CRUD for patient medical records (conditions / allergies / medications /
treatments). One file per logical "bundle" — each helper is independent and
the API layer composes them into a single patient detail view."""
from typing import Any

from core.mysql import mysql_db


# ─── Conditions ───────────────────────────────────────────────────────────

def list_conditions(patient_id: int) -> list[dict[str, Any]]:
    """โรคประจำตัวของคนไข้ เรียง active ก่อน แล้วปีที่วินิจฉัยล่าสุด."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, condition_name, icd10, diagnosed_year, status, notes, "
                "created_by, created_at, updated_at "
                "FROM medical_conditions WHERE patient_id = %s "
                "ORDER BY FIELD(status,'active','controlled','resolved'), diagnosed_year DESC",
                (patient_id,),
            )
            return cur.fetchall()


def insert_condition(
    *, patient_id: int, condition_name: str, icd10: str | None,
    diagnosed_year: int | None, status: str, notes: str | None,
    created_by: int | None,
) -> int:
    """เพิ่มโรคประจำตัว 1 รายการให้คนไข้ คืน id ใหม่."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO medical_conditions
                    (patient_id, condition_name, icd10, diagnosed_year, status, notes, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                """,
                (patient_id, condition_name, icd10, diagnosed_year, status, notes, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def delete_condition(condition_id: int) -> int:
    """ลบโรคประจำตัว 1 รายการถาวรด้วย id. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute("DELETE FROM medical_conditions WHERE id = %s", (condition_id,))
        conn.commit()
    return rows


# ─── Allergies ────────────────────────────────────────────────────────────

def list_allergies(patient_id: int) -> list[dict[str, Any]]:
    """ประวัติแพ้ของคนไข้ เรียงตามความรุนแรง (life_threatening ก่อน) — ให้ตัวร้ายแรงเด่นบนสุด."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, allergen, reaction, severity, notes, created_by, created_at "
                "FROM patient_allergies WHERE patient_id = %s "
                "ORDER BY FIELD(severity,'life_threatening','severe','moderate','mild', NULL), id DESC",
                (patient_id,),
            )
            return cur.fetchall()


def insert_allergy(
    *, patient_id: int, allergen: str, reaction: str | None,
    severity: str | None, notes: str | None, created_by: int | None,
) -> int:
    """เพิ่มประวัติแพ้ 1 รายการให้คนไข้ คืน id ใหม่."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO patient_allergies "
                "(patient_id, allergen, reaction, severity, notes, created_by) "
                "VALUES (%s, %s, %s, %s, %s, %s)",
                (patient_id, allergen, reaction, severity, notes, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def delete_allergy(allergy_id: int) -> int:
    """ลบประวัติแพ้ 1 รายการถาวรด้วย id. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute("DELETE FROM patient_allergies WHERE id = %s", (allergy_id,))
        conn.commit()
    return rows


# ─── Medications ──────────────────────────────────────────────────────────

def list_medications(patient_id: int) -> list[dict[str, Any]]:
    """ยาที่คนไข้ใช้ เรียงยาที่ยัง active ก่อน แล้วปีที่เริ่มล่าสุด."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, drug_name, dose, frequency, indication, started_year, "
                "is_active, notes, created_by, created_at, updated_at "
                "FROM current_medications WHERE patient_id = %s "
                "ORDER BY is_active DESC, started_year DESC",
                (patient_id,),
            )
            return cur.fetchall()


def insert_medication(
    *, patient_id: int, drug_name: str, dose: str | None, frequency: str | None,
    indication: str | None, started_year: int | None, is_active: bool,
    notes: str | None, created_by: int | None,
) -> int:
    """เพิ่มยา 1 รายการให้คนไข้ (is_active bool → 1/0) คืน id ใหม่."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO current_medications
                    (patient_id, drug_name, dose, frequency, indication,
                     started_year, is_active, notes, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (patient_id, drug_name, dose, frequency, indication,
                 started_year, 1 if is_active else 0, notes, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def update_medication_active(med_id: int, *, is_active: bool) -> int:
    """สลับสถานะ active/หยุดใช้ของยา (ไม่ลบทิ้ง เก็บประวัติ). คืนจำนวนแถวที่แก้."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute(
                "UPDATE current_medications SET is_active = %s WHERE id = %s",
                (1 if is_active else 0, med_id),
            )
        conn.commit()
    return rows


def delete_medication(med_id: int) -> int:
    """ลบยา 1 รายการถาวรด้วย id. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute("DELETE FROM current_medications WHERE id = %s", (med_id,))
        conn.commit()
    return rows


# ─── Treatments ───────────────────────────────────────────────────────────

def list_treatments(patient_id: int) -> list[dict[str, Any]]:
    """ประวัติการรักษา/ผ่าตัดของคนไข้ เรียงวันที่รักษาล่าสุดก่อน."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, treatment_type, description, hospital, treated_date, "
                "outcome, notes, created_by, created_at "
                "FROM treatment_history WHERE patient_id = %s "
                "ORDER BY treated_date DESC, id DESC",
                (patient_id,),
            )
            return cur.fetchall()


def insert_treatment(
    *, patient_id: int, treatment_type: str, description: str,
    hospital: str | None, treated_date: str | None, outcome: str | None,
    notes: str | None, created_by: int | None,
) -> int:
    """เพิ่มประวัติการรักษา 1 รายการให้คนไข้ คืน id ใหม่."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO treatment_history
                    (patient_id, treatment_type, description, hospital,
                     treated_date, outcome, notes, created_by)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (patient_id, treatment_type, description, hospital,
                 treated_date, outcome, notes, created_by),
            )
            new_id = cur.lastrowid
        conn.commit()
    return int(new_id)


def delete_treatment(treatment_id: int) -> int:
    """ลบประวัติการรักษา 1 รายการถาวรด้วย id. คืนจำนวนแถวที่ลบ."""
    with mysql_db() as conn:
        with conn.cursor() as cur:
            rows = cur.execute("DELETE FROM treatment_history WHERE id = %s", (treatment_id,))
        conn.commit()
    return rows
