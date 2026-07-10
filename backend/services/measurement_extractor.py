"""Extract structured lab values from a report's free text via the LLM, and
store them as UNCONFIRMED drafts for a doctor to review. Mirrors the safety
shape of report_service.analyze_report: PII-redact before the text leaves the
bridge, and never fabricate — a parse failure yields zero rows.

Only doctor-confirmed rows are ever trusted by the LabResults/Biomarker views,
so extraction accuracy is a convenience, not a safety boundary.
"""
import json
import re
from datetime import date, datetime
from typing import Any

from fastapi import HTTPException

from core.config import log
from rag import llm
from repositories import measurement_repo, patient_repo, report_repo
from services import measurement_catalog
from services.pii_redactor import redact_text

_MAX_ITEMS = 100

_SYSTEM = (
    "คุณเป็นระบบสกัดค่าแล็บเชิงตัวเลขจากข้อความผลตรวจทางการแพทย์. "
    "อ่านข้อความแล้วคืนเฉพาะค่าที่เป็นตัวเลขซึ่งพบจริงในข้อความเท่านั้น. "
    "ห้ามเดา ห้ามคำนวณ ห้ามแต่งค่า ห้ามเติมค่าที่ไม่มีในข้อความ. "
    "คืนผลเป็น JSON array เท่านั้น ไม่มีข้อความอธิบายอื่น ไม่มี markdown. "
    "แต่ละรายการมีรูปแบบ: "
    '{"code": "<รหัสจากรายการที่กำหนด หรือ \'unknown\'>", '
    '"raw_label": "<ชื่อค่าเดิมในข้อความ>", '
    '"value": <ตัวเลข>, "unit": "<หน่วย หรือ null>", '
    '"date": "YYYY-MM-DD หรือ null"}. '
    "ถ้าค่าใดจับคู่รหัสไม่ได้ให้ใช้ code = \"unknown\" แต่ยังคืนค่านั้นมาด้วย."
)


def _allowed_codes_hint() -> str:
    lines = []
    for code, meta in measurement_catalog.MARKERS.items():
        lines.append(f"- {code}: {meta['label_th']} ({', '.join(meta['aliases'][:3])})")
    return "รหัสที่อนุญาต:\n" + "\n".join(lines)


def _strip_fences(text: str) -> str:
    t = text.strip()
    # Remove ```json ... ``` or ``` ... ``` wrappers if the model added them.
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", t, re.DOTALL)
    return fence.group(1).strip() if fence else t


def _parse_date(raw: Any, fallback: date) -> date:
    if isinstance(raw, str):
        try:
            return datetime.strptime(raw.strip(), "%Y-%m-%d").date()
        except ValueError:
            pass
    return fallback


def _coerce_number(raw: Any) -> float | None:
    if isinstance(raw, (int, float)):
        return float(raw)
    if isinstance(raw, str):
        m = re.search(r"-?\d+(?:\.\d+)?", raw.replace(",", ""))
        if m:
            return float(m.group(0))
    return None


def extract_measurements(*, report_id: int, user: dict[str, Any]) -> dict[str, Any]:
    report = report_repo.get_by_id(report_id)
    if not report:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    if not report.get("extracted_text"):
        raise HTTPException(
            status_code=422,
            detail={
                "code": "REPORT_NO_TEXT",
                "message": "Report นี้ไม่มี text ที่ใช้สกัดค่าได้ (อาจเป็น scanned PDF) — กรอกค่าเองได้",
            },
        )

    patient = patient_repo.get_by_id(report["patient_id"])
    if not patient:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้ของ Report นี้"},
        )

    # PDPA: redact before the report text leaves the bridge for OpenRouter.
    context = redact_text(
        report["extracted_text"],
        known_names=[patient["display_name"]] if patient.get("display_name") else [],
    )
    messages = [
        {"role": "system", "content": _SYSTEM},
        {"role": "user", "content": f"{_allowed_codes_hint()}\n\nข้อความผลแล็บ:\n{context}"},
    ]
    try:
        answer = llm.chat(messages, temperature=0.0, max_tokens=2048)
    except Exception:
        log.exception("measurement extraction LLM failed for report id=%s", report_id)
        raise HTTPException(
            status_code=502,
            detail={"code": "AI_EXTRACT_FAILED", "message": "ระบบ AI ตอบไม่สำเร็จ ลองใหม่อีกครั้ง"},
        )

    parse_error = False
    parsed: list[dict[str, Any]] = []
    try:
        loaded = json.loads(_strip_fences(answer))
        if isinstance(loaded, list):
            parsed = [x for x in loaded if isinstance(x, dict)]
        else:
            parse_error = True
    except (json.JSONDecodeError, ValueError):
        parse_error = True

    fallback_date = (
        report["uploaded_at"].date()
        if isinstance(report.get("uploaded_at"), datetime)
        else date.today()
    )

    rows: list[dict[str, Any]] = []
    for item in parsed[:_MAX_ITEMS]:
        value = _coerce_number(item.get("value"))
        if value is None:
            continue
        raw_label = item.get("raw_label") or item.get("code")
        code = measurement_catalog.normalize_code(item.get("code"))
        if code == "unknown":
            code = measurement_catalog.normalize_code(raw_label)
        value, unit = measurement_catalog.normalize_value_unit(
            code, value, item.get("unit")
        )
        rows.append({
            "code": code,
            "value": value,
            "unit": unit,
            "measured_at": _parse_date(item.get("date"), fallback_date),
            "raw_label": (str(raw_label)[:128] if raw_label else None),
        })

    # Idempotent: re-extraction replaces prior drafts for this report, never
    # touches confirmed rows.
    measurement_repo.delete_drafts_by_report(report_id)
    measurement_repo.insert_bulk_drafts(
        patient_id=report["patient_id"], report_id=report_id, rows=rows
    )

    drafts = measurement_repo.list_drafts_by_report(report_id)
    return {"ok": True, "data": drafts, "parse_error": parse_error}
