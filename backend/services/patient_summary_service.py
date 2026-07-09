"""Pre-visit AI summary — short Thai brief for a doctor about to see a patient.

Uses our own LLM (Gemini via OpenRouter) — no Dify. Patient name + identifiers
are masked before the prompt leaves the bridge (PDPA) — the model answers in
general terms about the case.
"""
from typing import Any

from fastapi import HTTPException

from rag import llm
from repositories import medical_records_repo, patient_repo
from services.pii_redactor import redact_text


_SYSTEM_INSTRUCTION = (
    "คุณเป็นผู้ช่วยแพทย์ในโรงพยาบาล สรุปประวัติคนไข้ให้แพทย์อ่านก่อนตรวจ "
    "เป็นภาษาไทย ความยาว 3-5 บรรทัดสั้นๆ แต่ละบรรทัดมีจุดเดียว "
    "หลีกเลี่ยงข้อมูลส่วนตัว เน้นที่ประวัติทางการแพทย์ล้วน: โรคประจำตัว, แพ้ยา, "
    "ยาที่ใช้อยู่, ประวัติการรักษาสำคัญ และข้อควรระวังก่อนตรวจ"
)


def _compose_brief(patient_id: int) -> tuple[str, list[str]]:
    p = patient_repo.get_by_id(patient_id)
    if not p:
        raise HTTPException(404, {"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"})

    conditions = medical_records_repo.list_conditions(patient_id)
    allergies = medical_records_repo.list_allergies(patient_id)
    medications = medical_records_repo.list_medications(patient_id)
    treatments = medical_records_repo.list_treatments(patient_id)

    parts: list[str] = ["=== ข้อมูลคนไข้ที่กำลังจะตรวจ ==="]
    parts.append(f"เพศ: {p.get('gender') or '-'}")
    parts.append(f"DOB: {p.get('dob') or '-'}")

    if allergies:
        parts.append("")
        parts.append("=== แพ้ยา/สารก่อภูมิแพ้ ===")
        for a in allergies:
            parts.append(
                f"- {a['allergen']}"
                + (f" → {a['reaction']}" if a.get("reaction") else "")
                + (f" (severity: {a['severity']})" if a.get("severity") else "")
            )

    if conditions:
        parts.append("")
        parts.append("=== โรคประจำตัว ===")
        for c in conditions:
            parts.append(
                f"- {c['condition_name']}"
                + (f" ({c['icd10']})" if c.get("icd10") else "")
                + f" — status: {c['status']}"
                + (f" — diagnosed {c['diagnosed_year']}" if c.get("diagnosed_year") else "")
            )

    active_meds = [m for m in medications if m.get("is_active")]
    if active_meds:
        parts.append("")
        parts.append("=== ยาที่ใช้อยู่ ===")
        for m in active_meds:
            parts.append(
                f"- {m['drug_name']}"
                + (f" {m['dose']}" if m.get("dose") else "")
                + (f" {m['frequency']}" if m.get("frequency") else "")
                + (f" — {m['indication']}" if m.get("indication") else "")
            )

    if treatments:
        parts.append("")
        parts.append("=== ประวัติการรักษา ===")
        for t in treatments[:5]:
            parts.append(
                f"- {t['treatment_type']} ({t.get('treated_date') or '-'}): {t['description']}"
                + (f" @ {t['hospital']}" if t.get("hospital") else "")
            )

    name = p.get("display_name") or ""
    composed = "\n".join(parts)
    return redact_text(composed, known_names=[name] if name else []), [name]


def generate_summary(patient_id: int, *, user: dict[str, Any]) -> dict[str, str]:
    prompt, _ = _compose_brief(patient_id)
    messages = [
        {"role": "system", "content": _SYSTEM_INSTRUCTION},
        {"role": "user", "content": prompt},
    ]
    try:
        answer = llm.chat(messages)
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"code": "AI_ERROR", "message": "สรุปไม่สำเร็จ ลองอีกครั้ง"},
        ) from exc
    return {"summary": answer, "conversation_id": ""}
