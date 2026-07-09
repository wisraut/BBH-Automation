"""Patient medical-records bundle + CRUD endpoints.

GET endpoint returns the whole bundle (4 lists) in one round-trip — perfect
for the patient-detail view. Mutations are per-entity so the UI can refresh
just one tab.

Audit: every list and mutation goes through audit_service so HIPAA-style
trail covers medical history access, not just reports/profile.
"""
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request

from core.security import require_user
from repositories import medical_records_repo, patient_repo
from schemas.medical_records import (
    AllergyCreate,
    AllergyOut,
    ConditionCreate,
    ConditionOut,
    MedicalBundle,
    MedicationActiveUpdate,
    MedicationCreate,
    MedicationOut,
    SimpleOk,
    TreatmentCreate,
    TreatmentOut,
)
from services import audit_service


router = APIRouter(tags=["medical-records"])

# Reading full clinical records (conditions/allergies/meds/treatments) is for
# clinicians + admin only — a CRO (front desk / booking) does not need them
# (least-privilege / PDPA). Flip back to include "cro" if hospital policy needs it.
_StaffUser = Annotated[dict, Depends(require_user(["doctor", "nurse", "admin"]))]
_DoctorOrAdmin = Annotated[dict, Depends(require_user(["doctor", "admin"]))]


def _require_patient(patient_id: int) -> dict:
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )
    return p


# ─── Bundle (one-shot fetch for detail view) ──────────────────────────────

@router.get("/api/patients/{patient_id}/medical-bundle", response_model=MedicalBundle)
def get_bundle(patient_id: int, request: Request, user: _StaffUser) -> dict:
    _require_patient(patient_id)
    bundle = {
        "conditions": medical_records_repo.list_conditions(patient_id),
        "allergies": medical_records_repo.list_allergies(patient_id),
        "medications": medical_records_repo.list_medications(patient_id),
        "treatments": medical_records_repo.list_treatments(patient_id),
    }
    audit_service.record_access(
        request, user,
        action="view_medical_bundle", subject_type="patient",
        subject_id=patient_id, patient_id=patient_id,
        extra={"counts": {k: len(v) for k, v in bundle.items()}},
    )
    return bundle


# ─── Conditions ───────────────────────────────────────────────────────────

@router.post(
    "/api/patients/{patient_id}/conditions",
    response_model=ConditionOut, status_code=201,
)
def add_condition(
    patient_id: int, body: ConditionCreate, request: Request,
    user: _DoctorOrAdmin,
) -> dict:
    _require_patient(patient_id)
    new_id = medical_records_repo.insert_condition(
        patient_id=patient_id,
        condition_name=body.condition_name,
        icd10=body.icd10,
        diagnosed_year=body.diagnosed_year,
        status=body.status,
        notes=body.notes,
        created_by=int(user["id"]),
    )
    audit_service.record_access(
        request, user,
        action="add_condition", subject_type="condition", subject_id=new_id,
        patient_id=patient_id,
    )
    rows = medical_records_repo.list_conditions(patient_id)
    return next(r for r in rows if r["id"] == new_id)


@router.delete("/api/conditions/{condition_id}", response_model=SimpleOk)
def delete_condition(
    condition_id: int, request: Request, user: _DoctorOrAdmin,
) -> dict:
    if medical_records_repo.delete_condition(condition_id) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="delete_condition", subject_type="condition", subject_id=condition_id,
    )
    return {"ok": True}


# ─── Allergies ────────────────────────────────────────────────────────────

@router.post(
    "/api/patients/{patient_id}/allergies",
    response_model=AllergyOut, status_code=201,
)
def add_allergy(
    patient_id: int, body: AllergyCreate, request: Request,
    user: _DoctorOrAdmin,
) -> dict:
    _require_patient(patient_id)
    new_id = medical_records_repo.insert_allergy(
        patient_id=patient_id,
        allergen=body.allergen,
        reaction=body.reaction,
        severity=body.severity,
        notes=body.notes,
        created_by=int(user["id"]),
    )
    audit_service.record_access(
        request, user,
        action="add_allergy", subject_type="allergy", subject_id=new_id,
        patient_id=patient_id,
    )
    rows = medical_records_repo.list_allergies(patient_id)
    return next(r for r in rows if r["id"] == new_id)


@router.delete("/api/allergies/{allergy_id}", response_model=SimpleOk)
def delete_allergy(
    allergy_id: int, request: Request, user: _DoctorOrAdmin,
) -> dict:
    if medical_records_repo.delete_allergy(allergy_id) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="delete_allergy", subject_type="allergy", subject_id=allergy_id,
    )
    return {"ok": True}


# ─── Medications ──────────────────────────────────────────────────────────

@router.post(
    "/api/patients/{patient_id}/medications",
    response_model=MedicationOut, status_code=201,
)
def add_medication(
    patient_id: int, body: MedicationCreate, request: Request,
    user: _DoctorOrAdmin,
) -> dict:
    _require_patient(patient_id)
    new_id = medical_records_repo.insert_medication(
        patient_id=patient_id,
        drug_name=body.drug_name,
        dose=body.dose,
        frequency=body.frequency,
        indication=body.indication,
        started_year=body.started_year,
        is_active=body.is_active,
        notes=body.notes,
        created_by=int(user["id"]),
    )
    audit_service.record_access(
        request, user,
        action="add_medication", subject_type="medication", subject_id=new_id,
        patient_id=patient_id,
    )
    rows = medical_records_repo.list_medications(patient_id)
    return next(r for r in rows if r["id"] == new_id)


@router.patch("/api/medications/{med_id}/active", response_model=SimpleOk)
def set_medication_active(
    med_id: int, body: MedicationActiveUpdate, request: Request,
    user: _DoctorOrAdmin,
) -> dict:
    if medical_records_repo.update_medication_active(med_id, is_active=body.is_active) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="update_medication", subject_type="medication", subject_id=med_id,
        extra={"is_active": body.is_active},
    )
    return {"ok": True}


@router.delete("/api/medications/{med_id}", response_model=SimpleOk)
def delete_medication(
    med_id: int, request: Request, user: _DoctorOrAdmin,
) -> dict:
    if medical_records_repo.delete_medication(med_id) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="delete_medication", subject_type="medication", subject_id=med_id,
    )
    return {"ok": True}


# ─── Treatments ───────────────────────────────────────────────────────────

@router.post(
    "/api/patients/{patient_id}/treatments",
    response_model=TreatmentOut, status_code=201,
)
def add_treatment(
    patient_id: int, body: TreatmentCreate, request: Request,
    user: _DoctorOrAdmin,
) -> dict:
    _require_patient(patient_id)
    new_id = medical_records_repo.insert_treatment(
        patient_id=patient_id,
        treatment_type=body.treatment_type,
        description=body.description,
        hospital=body.hospital,
        treated_date=body.treated_date.isoformat() if body.treated_date else None,
        outcome=body.outcome,
        notes=body.notes,
        created_by=int(user["id"]),
    )
    audit_service.record_access(
        request, user,
        action="add_treatment", subject_type="treatment", subject_id=new_id,
        patient_id=patient_id,
    )
    rows = medical_records_repo.list_treatments(patient_id)
    return next(r for r in rows if r["id"] == new_id)


@router.delete("/api/treatments/{treatment_id}", response_model=SimpleOk)
def delete_treatment(
    treatment_id: int, request: Request, user: _DoctorOrAdmin,
) -> dict:
    if medical_records_repo.delete_treatment(treatment_id) == 0:
        raise HTTPException(404, {"code": "NOT_FOUND", "message": "ไม่พบรายการ"})
    audit_service.record_access(
        request, user,
        action="delete_treatment", subject_type="treatment", subject_id=treatment_id,
    )
    return {"ok": True}
