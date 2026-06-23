"""Patient report upload + storage + text extraction + Dify analysis."""
import io
import json
import os
import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, UploadFile

import integrations.dify_client as dify
from core.config import log
from core.email_service import REPORT_NOTIFY_EMAIL, send_email
from repositories import patient_repo, report_repo, user_repo

REPORTS_ROOT = os.getenv("REPORTS_STORAGE_ROOT", "/app/data/reports")
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB cap for MVP
ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
}
_DIFY_TRIAGE_PATTERN = re.compile(
    r"(accept|reject|review)", re.IGNORECASE
)


def list_reports(patient_id: int) -> dict[str, list[dict[str, Any]]]:
    if not patient_repo.get_by_id(patient_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )
    rows = report_repo.list_by_patient(patient_id)
    return {"data": rows}


def get_report(report_id: int) -> dict[str, Any]:
    row = report_repo.get_by_id(report_id)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    return row


def delete_report(report_id: int) -> dict[str, bool]:
    report = report_repo.get_by_id(report_id)
    if not report:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    report_repo.delete(report_id)
    file_path = report.get("file_path")
    if file_path:
        abs_path = os.path.join(REPORTS_ROOT, str(file_path))
        try:
            os.remove(abs_path)
        except FileNotFoundError:
            pass
    return {"ok": True}


def set_notebooklm_url(report_id: int, url: str | None) -> dict[str, Any]:
    if not report_repo.get_by_id(report_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    report_repo.update_notebooklm_url(report_id, url.strip() if url else None)
    return report_repo.get_by_id(report_id)


async def upload_report(
    *,
    patient_id: int,
    upload: UploadFile,
    title: str,
    report_type: str,
    source: str,
    notes: str | None,
    assigned_doctor_id: int | None = None,
    user: dict[str, Any],
) -> dict[str, Any]:
    patient = patient_repo.get_by_id(patient_id)
    if not patient:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )

    raw = await upload.read()
    if not raw:
        raise HTTPException(
            status_code=400,
            detail={"code": "EMPTY_FILE", "message": "ไฟล์ว่าง"},
        )
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(
            status_code=413,
            detail={"code": "FILE_TOO_LARGE", "message": "ไฟล์ใหญ่กว่า 10MB"},
        )
    mime = (upload.content_type or "").lower() or "application/octet-stream"
    if mime not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail={
                "code": "UNSUPPORTED_MIME",
                "message": f"ไม่รองรับไฟล์ประเภท {mime}",
            },
        )

    file_path = _save_to_disk(raw, upload.filename or "report", mime)
    extracted_text = _extract_text(raw, mime)

    new_id = report_repo.create(
        patient_id=patient_id,
        source=source,
        report_type=report_type,
        title=title.strip(),
        file_path=file_path,
        file_mime=mime,
        file_size=len(raw),
        extracted_text=extracted_text,
        notes=notes.strip() if notes else None,
        uploaded_by=user.get("id"),
        assigned_doctor_id=assigned_doctor_id,
    )

    notified = _notify_report_uploaded(
        patient=patient,
        title=title.strip(),
        report_type=report_type,
        source=source,
        assigned_doctor_id=assigned_doctor_id,
        uploaded_by=user,
    )

    return {
        "ok": True,
        "id": new_id,
        "title": title.strip(),
        "has_extracted_text": bool(extracted_text and extracted_text.strip()),
        "notified_doctor": notified,
    }


def list_analyses(report_id: int) -> dict[str, list[dict[str, Any]]]:
    if not report_repo.get_by_id(report_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    return {"data": report_repo.list_analyses(report_id)}


def analyze_report(*, report_id: int, user: dict[str, Any]) -> dict[str, Any]:
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
                "message": "Report นี้ไม่มี text ที่ใช้วิเคราะห์ได้ (อาจเป็น scanned PDF)",
            },
        )

    patient = patient_repo.get_by_id(report["patient_id"])
    if not patient:
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้ของ Report นี้"},
        )

    context = _build_context(patient=patient, report=report)
    try:
        answer, conv_id, _meta = dify.ask_with_meta(
            user_id=str(user.get("id") or "doctor"),
            message=context,
            role="doctor",
            conv_id="",
        )
    except Exception:
        log.exception("Dify analyze failed for report id=%s", report_id)
        raise HTTPException(
            status_code=502,
            detail={
                "code": "DIFY_ANALYZE_FAILED",
                "message": "ระบบ AI ตอบไม่สำเร็จ ลองใหม่อีกครั้ง",
            },
        )

    triage = _detect_triage(answer)
    analysis_id = report_repo.create_analysis(
        report_id=report_id,
        requested_by=user.get("id"),
        dify_conversation_id=conv_id or None,
        summary_text=answer,
        raw_response=json.dumps({"answer": answer, "conv_id": conv_id}, ensure_ascii=False),
        triage_decision=triage,
    )
    analyses = report_repo.list_analyses(report_id)
    latest = next((a for a in analyses if a["id"] == analysis_id), analyses[0] if analyses else None)
    return {"ok": True, "analysis": latest}


def decide_triage(
    *, analysis_id: int, decision: str, user: dict[str, Any]
) -> dict[str, bool]:
    rows = report_repo.decide_triage(
        analysis_id=analysis_id,
        decision=decision,
        decided_by=user.get("id"),
    )
    if rows == 0:
        raise HTTPException(
            status_code=404,
            detail={"code": "ANALYSIS_NOT_FOUND", "message": "ไม่พบผลวิเคราะห์นี้"},
        )
    return {"ok": True}


# ─── Helpers ──────────────────────────────────────────────────────────────────


def _notify_report_uploaded(
    *,
    patient: dict[str, Any],
    title: str,
    report_type: str,
    source: str,
    assigned_doctor_id: int | None,
    uploaded_by: dict[str, Any],
) -> bool:
    """Email the assigned doctor (falls back to REPORT_NOTIFY_EMAIL when no
    doctor is picked or the doctor has no email on file). Best-effort: never
    raises, so a mail outage can't block the upload itself."""
    doctor = user_repo.find_user_by_id(assigned_doctor_id) if assigned_doctor_id else None
    doctor_line = f"หมอที่เลือก: {doctor['display_name']}" if doctor else "หมอที่เลือก: (ไม่ระบุ)"
    recipient = (doctor.get("email") if doctor else None) or REPORT_NOTIFY_EMAIL

    body = "\n".join([
        f"มี Report ใหม่ถูกอัพโหลดเข้าระบบ",
        "",
        f"คนไข้: {patient.get('display_name') or '-'} (HN: {patient.get('hn') or '-'})",
        f"ชื่อ Report: {title}",
        f"ประเภท: {report_type}",
        f"แหล่งที่มา: {source}",
        doctor_line,
        f"อัพโหลดโดย: {uploaded_by.get('display_name') or uploaded_by.get('email') or '-'}",
    ])
    return send_email(
        to=recipient,
        subject=f"[BBH] Report ใหม่: {title}",
        body=body,
    )


def _save_to_disk(raw: bytes, filename: str, mime: str) -> str:
    now = datetime.now()
    rel_dir = f"{now:%Y/%m}"
    abs_dir = os.path.join(REPORTS_ROOT, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    ext = _ext_for(filename, mime)
    rel_path = f"{rel_dir}/{uuid.uuid4().hex}{ext}"
    with open(os.path.join(REPORTS_ROOT, rel_path), "wb") as fh:
        fh.write(raw)
    return rel_path


def _ext_for(filename: str, mime: str) -> str:
    _, ext = os.path.splitext(filename)
    if ext:
        return ext.lower()
    return {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "text/plain": ".txt",
    }.get(mime, "")


def _extract_text(raw: bytes, mime: str) -> str | None:
    if mime == "text/plain":
        try:
            return raw.decode("utf-8", errors="ignore").strip() or None
        except Exception:  # noqa: BLE001
            return None
    if mime == "application/pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            parts = [page.extract_text() or "" for page in reader.pages]
            text = "\n\n".join(p.strip() for p in parts if p.strip())
            return text or None
        except Exception:  # noqa: BLE001
            log.exception("PDF text extraction failed")
            return None
    return None  # images: OCR not in MVP


def _build_context(*, patient: dict[str, Any], report: dict[str, Any]) -> str:
    parts = [
        "กรุณาวิเคราะห์ Report ของคนไข้ตามข้อมูลด้านล่าง โดยใช้ความรู้จาก Knowledge Base ของหนังสือแพทย์เป็นแหล่งอ้างอิงหลัก",
        "",
        "=== ข้อมูลคนไข้ ===",
        f"HN: {patient.get('hn') or '-'}",
        f"ชื่อ: {patient.get('display_name') or '-'}",
        f"เพศ: {patient.get('gender') or '-'}",
        f"วันเกิด: {patient.get('dob') or '-'}",
        f"หมายเหตุ: {patient.get('notes') or '-'}",
        "",
        f"=== Report ({report.get('report_type')}) — {report.get('title')} ===",
        report.get("extracted_text") or "",
        "",
        "=== สิ่งที่ต้องตอบ ===",
        "1) สรุปอาการ/ผลแล็บที่สำคัญ",
        "2) ความเสี่ยง / สิ่งที่ต้องสังเกต",
        "3) อ้างอิงจากหนังสือใน Knowledge Base ถ้ามี",
        "4) Triage suggestion: ลงท้ายด้วย 1 บรรทัด `Triage: accept` หรือ `Triage: reject` หรือ `Triage: review` (review = ไม่แน่ใจ ขอให้แพทย์ตรวจซ้ำ)",
    ]
    return "\n".join(parts)


def _detect_triage(answer: str) -> str:
    """Look for 'Triage: <decision>' line in Dify output."""
    m = re.search(r"Triage\s*:\s*(accept|reject|review)", answer, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return "pending"
