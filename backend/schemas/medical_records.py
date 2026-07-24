"""Pydantic v2 schemas for the patient medical-records bundle."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


ConditionStatus = Literal["active", "controlled", "resolved"]
AllergySeverity = Literal["mild", "moderate", "severe", "life_threatening"]


# ─── Conditions ───────────────────────────────────────────────────────────

class ConditionOut(BaseModel):
    """response ของโรคประจำตัวหนึ่งรายการในบันทึกเวชระเบียนคนไข้"""
    id: int
    condition_name: str
    icd10: str | None = None
    diagnosed_year: int | None = None
    status: ConditionStatus
    notes: str | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class ConditionCreate(BaseModel):
    """request body ตอนเพิ่มโรคประจำตัวให้คนไข้"""
    condition_name: str = Field(min_length=1, max_length=255)
    icd10: str | None = Field(default=None, max_length=20)
    diagnosed_year: int | None = Field(default=None, ge=1900, le=2200)
    status: ConditionStatus = "active"
    notes: str | None = Field(default=None, max_length=2000)


# ─── Allergies ────────────────────────────────────────────────────────────

class AllergyOut(BaseModel):
    """response ของประวัติแพ้ยา/สารก่อภูมิแพ้หนึ่งรายการ"""
    id: int
    allergen: str
    reaction: str | None = None
    severity: AllergySeverity | None = None
    notes: str | None = None
    created_by: int | None = None
    created_at: datetime


class AllergyCreate(BaseModel):
    """request body ตอนเพิ่มประวัติแพ้ยา/สารก่อภูมิแพ้ให้คนไข้"""
    allergen: str = Field(min_length=1, max_length=255)
    reaction: str | None = Field(default=None, max_length=255)
    severity: AllergySeverity | None = None
    notes: str | None = Field(default=None, max_length=2000)


# ─── Medications ──────────────────────────────────────────────────────────

class MedicationOut(BaseModel):
    """response ของยาที่คนไข้ใช้หนึ่งรายการ (is_active บอกว่ายังใช้อยู่หรือหยุดแล้ว)"""
    id: int
    drug_name: str
    dose: str | None = None
    frequency: str | None = None
    indication: str | None = None
    started_year: int | None = None
    is_active: bool
    notes: str | None = None
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime


class MedicationCreate(BaseModel):
    """request body ตอนเพิ่มยาที่คนไข้ใช้"""
    drug_name: str = Field(min_length=1, max_length=255)
    dose: str | None = Field(default=None, max_length=100)
    frequency: str | None = Field(default=None, max_length=100)
    indication: str | None = Field(default=None, max_length=255)
    started_year: int | None = Field(default=None, ge=1900, le=2200)
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=2000)


class MedicationActiveUpdate(BaseModel):
    """request body สำหรับ toggle สถานะยา (กำลังใช้/หยุดใช้) โดยไม่แตะ field อื่น"""
    is_active: bool


# ─── Treatments ───────────────────────────────────────────────────────────

class TreatmentOut(BaseModel):
    """response ของประวัติการรักษา/ผ่าตัดหนึ่งรายการ"""
    id: int
    treatment_type: str
    description: str
    hospital: str | None = None
    treated_date: date | None = None
    outcome: str | None = None
    notes: str | None = None
    created_by: int | None = None
    created_at: datetime


class TreatmentCreate(BaseModel):
    """request body ตอนเพิ่มประวัติการรักษา/ผ่าตัดให้คนไข้"""
    treatment_type: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=2000)
    hospital: str | None = Field(default=None, max_length=255)
    treated_date: date | None = None
    outcome: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


# ─── Bundle ───────────────────────────────────────────────────────────────

class MedicalBundle(BaseModel):
    """response รวมเวชระเบียนคนไข้ทุกส่วน (โรค/แพ้ยา/ยา/ประวัติรักษา) ในก้อนเดียว —
    ให้หน้าเวชระเบียนดึงครบทีเดียว"""
    conditions: list[ConditionOut]
    allergies: list[AllergyOut]
    medications: list[MedicationOut]
    treatments: list[TreatmentOut]


class SimpleOk(BaseModel):
    """response มาตรฐานแบบสั้นสำหรับ action ที่ไม่คืนข้อมูล (แค่บอกว่าสำเร็จ)"""
    ok: bool = True
