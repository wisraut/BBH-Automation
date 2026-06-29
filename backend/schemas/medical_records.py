"""Pydantic v2 schemas for the patient medical-records bundle."""
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


ConditionStatus = Literal["active", "controlled", "resolved"]
AllergySeverity = Literal["mild", "moderate", "severe", "life_threatening"]


# ─── Conditions ───────────────────────────────────────────────────────────

class ConditionOut(BaseModel):
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
    condition_name: str = Field(min_length=1, max_length=255)
    icd10: str | None = Field(default=None, max_length=20)
    diagnosed_year: int | None = Field(default=None, ge=1900, le=2200)
    status: ConditionStatus = "active"
    notes: str | None = Field(default=None, max_length=2000)


# ─── Allergies ────────────────────────────────────────────────────────────

class AllergyOut(BaseModel):
    id: int
    allergen: str
    reaction: str | None = None
    severity: AllergySeverity | None = None
    notes: str | None = None
    created_by: int | None = None
    created_at: datetime


class AllergyCreate(BaseModel):
    allergen: str = Field(min_length=1, max_length=255)
    reaction: str | None = Field(default=None, max_length=255)
    severity: AllergySeverity | None = None
    notes: str | None = Field(default=None, max_length=2000)


# ─── Medications ──────────────────────────────────────────────────────────

class MedicationOut(BaseModel):
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
    drug_name: str = Field(min_length=1, max_length=255)
    dose: str | None = Field(default=None, max_length=100)
    frequency: str | None = Field(default=None, max_length=100)
    indication: str | None = Field(default=None, max_length=255)
    started_year: int | None = Field(default=None, ge=1900, le=2200)
    is_active: bool = True
    notes: str | None = Field(default=None, max_length=2000)


class MedicationActiveUpdate(BaseModel):
    is_active: bool


# ─── Treatments ───────────────────────────────────────────────────────────

class TreatmentOut(BaseModel):
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
    treatment_type: str = Field(min_length=1, max_length=100)
    description: str = Field(min_length=1, max_length=2000)
    hospital: str | None = Field(default=None, max_length=255)
    treated_date: date | None = None
    outcome: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


# ─── Bundle ───────────────────────────────────────────────────────────────

class MedicalBundle(BaseModel):
    conditions: list[ConditionOut]
    allergies: list[AllergyOut]
    medications: list[MedicationOut]
    treatments: list[TreatmentOut]


class SimpleOk(BaseModel):
    ok: bool = True
