"""Patient report upload + storage + text extraction + AI analysis (own LLM)."""
import io
import json
import os
import re
import uuid
from datetime import datetime
from typing import Any

from fastapi import HTTPException, UploadFile

from rag import llm
from services.pii_redactor import redact_text
from core.config import log
from core.email_service import REPORT_NOTIFY_EMAIL, send_email
from core.email_templates import (
    COLOR_GREEN_DARK,
    COLOR_MUTED,
    FONT_MONO,
    render_cta_button,
    render_html_shell,
    render_kv_section,
    render_steps_section,
    render_text_shell,
)
from repositories import patient_doctor_repo, patient_repo, report_repo, user_repo

REPORTS_ROOT = os.getenv("REPORTS_STORAGE_ROOT", "/app/data/reports")
MAX_FILE_BYTES = 10 * 1024 * 1024  # 10MB cap for MVP
ALLOWED_MIMES = {
    "application/pdf",
    "image/jpeg",
    "image/png",
    "text/plain",
}
MAX_EXTRACTED_CHARS = 50_000   # cap stored/analyzed text (DB bloat + LLM cost)
MAX_PDF_PAGES = 100            # cap pages parsed (decompression-bomb guard)

# System persona for lab-report analysis. Replaces the old Dify "doctor" app.
# There is no medical-book Knowledge Base anymore (that lived in Dify), so the
# model reasons from the report data + general medical knowledge and must NOT
# invent citations. Always ends with a machine-parseable Triage line.
_DOCTOR_SYSTEM = (
    "คุณเป็นผู้ช่วยแพทย์ในโรงพยาบาล Better Being วิเคราะห์ผลแล็บ/รายงานให้แพทย์อ่าน "
    "เป็นภาษาไทย กระชับ เป็นระบบ อ้างอิงจากข้อมูลในรายงานและความรู้ทางการแพทย์ทั่วไป "
    "ห้ามแต่งค่าตัวเลข ผลแล็บ หรือการอ้างอิงหนังสือที่ไม่มีในข้อมูล "
    "ตอบตามหัวข้อที่แพทย์ขอ และปิดท้ายด้วยบรรทัด Triage ตามรูปแบบที่กำหนดเสมอ"
)


def list_reports(patient_id: int) -> dict[str, list[dict[str, Any]]]:
    """คืน report ทั้งหมดของคนไข้รายเดียว (ใช้ในหน้า patient) — 404 ถ้าไม่พบคนไข้"""
    if not patient_repo.get_by_id(patient_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "PATIENT_NOT_FOUND", "message": "ไม่พบคนไข้นี้"},
        )
    rows = report_repo.list_by_patient(patient_id)
    return {"data": rows}


def list_reports_workspace(
    *,
    user: dict[str, Any],
    report_type: str | None,
    source: str | None,
    decision: str | None,
    search: str | None,
    mine_only: bool,
    page: int,
    limit: int,
) -> dict[str, Any]:
    """Workspace report list for /reports page.

    mine_only=True restricts to reports assigned_doctor_id = user.id.
    For role=doctor or nurse this is the natural default in UI.
    Admin sees all by default; opt-in via mine_only.
    """
    page = max(1, page)
    limit = max(1, min(100, limit))

    assigned_doctor_id: int | None = None
    if mine_only:
        assigned_doctor_id = int(user["id"])

    rows, total = report_repo.list_recent(
        assigned_doctor_id=assigned_doctor_id,
        report_type=report_type,
        source=source,
        decision=decision,
        search=search,
        page=page,
        limit=limit,
    )
    pages = (total + limit - 1) // limit if limit else 1
    return {
        "data": rows,
        "pagination": {
            "page": page,
            "limit": limit,
            "total": total,
            "total_pages": pages,
        },
    }


def get_report(report_id: int) -> dict[str, Any]:
    """คืน report รายเดียว — 404 ถ้าไม่พบ"""
    row = report_repo.get_by_id(report_id)
    if not row:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    return row


def delete_report(report_id: int, *, user: dict[str, Any]) -> dict[str, bool]:
    """Soft delete — record stays in DB and file stays on disk (HIPAA-like
    retention). Future queries hide via deleted_at IS NULL filter. Audit
    rows live in patient_access_audit; the deleted_by column on the report
    is denormalized for fast lookup."""
    report = report_repo.get_by_id(report_id)
    if not report:
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    rows = report_repo.soft_delete(report_id, deleted_by=int(user["id"]))
    if rows == 0:
        # already deleted — idempotent
        pass
    return {"ok": True}


def set_notebooklm_url(report_id: int, url: str | None) -> dict[str, Any]:
    """บันทึกลิงก์ NotebookLM ให้ report — บังคับต้องขึ้นต้น http(s):// เพราะลิงก์นี้
    ถูก render เป็น <a href> ใน dashboard กัน stored XSS (javascript:/data:)"""
    if not report_repo.get_by_id(report_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    clean = (url or "").strip()
    if clean and not (clean.startswith("http://") or clean.startswith("https://")):
        # Rendered as <a href> in the dashboard — reject javascript:/data: etc.
        # so a pasted link can't become stored XSS.
        raise HTTPException(
            status_code=422,
            detail={"code": "INVALID_URL", "message": "ลิงก์ต้องขึ้นต้นด้วย http:// หรือ https://"},
        )
    report_repo.update_notebooklm_url(report_id, clean or None)
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
    """รับไฟล์ report ที่อัปโหลด: ตรวจขนาด (<=10MB) + ชนิดไฟล์จาก magic bytes จริง
    (ไม่เชื่อ Content-Type ที่ client แจ้ง), เซฟลงดิสก์, สกัด text, บันทึกลง DB แล้ว
    แจ้งแพทย์ทางอีเมล (best-effort ไม่บล็อกการอัปโหลด)"""
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
    # Trust the file's magic bytes, not the client-declared content_type — an
    # .exe/.html renamed with Content-Type: application/pdf must not pass.
    mime = _detect_mime(raw)
    if mime not in ALLOWED_MIMES:
        raise HTTPException(
            status_code=415,
            detail={"code": "UNSUPPORTED_MIME", "message": "ชนิดไฟล์นี้ไม่รองรับ (ต้องเป็น PDF / รูป / ข้อความ)"},
        )
    if assigned_doctor_id is not None:
        doctor = user_repo.find_user_by_id(int(assigned_doctor_id))
        if not doctor or doctor.get("role") != "doctor" or not doctor.get("is_active"):
            raise HTTPException(
                status_code=422,
                detail={"code": "DOCTOR_NOT_FOUND", "message": "แพทย์ที่เลือกไม่พบหรือไม่อยู่ในระบบ"},
            )

    file_path = _save_to_disk(raw, mime)
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
        patient_id=patient_id,
        report_id=new_id,
        title=title.strip(),
        report_type=report_type,
        source=source,
        assigned_doctor_id=assigned_doctor_id,
        uploaded_by=user,
        file_path=os.path.join(REPORTS_ROOT, file_path),
        file_mime=mime,
        original_filename=upload.filename,
    )

    return {
        "ok": True,
        "id": new_id,
        "title": title.strip(),
        "has_extracted_text": bool(extracted_text and extracted_text.strip()),
        "notified_doctor": notified,
    }


def list_analyses(report_id: int) -> dict[str, list[dict[str, Any]]]:
    """คืนผลวิเคราะห์ AI ทั้งหมดของ report — 404 ถ้าไม่พบ report"""
    if not report_repo.get_by_id(report_id):
        raise HTTPException(
            status_code=404,
            detail={"code": "REPORT_NOT_FOUND", "message": "ไม่พบ Report นี้"},
        )
    return {"data": report_repo.list_analyses(report_id)}


def analyze_report(*, report_id: int, user: dict[str, Any]) -> dict[str, Any]:
    """วิเคราะห์ report ด้วย LLM ให้แพทย์อ่าน — ต้องมี extracted_text (ไม่งั้น 422),
    PII-redact ก่อนส่งออก OpenRouter, ดึง triage decision จากคำตอบ แล้วเก็บผลลง DB;
    LLM ล้มโยน 502"""
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

    # PII-redact before the report text leaves the bridge for OpenRouter.
    context = redact_text(
        _build_context(patient=patient, report=report),
        known_names=[patient.get("display_name")] if patient.get("display_name") else [],
    )
    messages = [
        {"role": "system", "content": _DOCTOR_SYSTEM},
        {"role": "user", "content": context},
    ]
    try:
        answer = llm.chat(messages, max_tokens=1536)
    except Exception:
        log.exception("AI analyze failed for report id=%s", report_id)
        raise HTTPException(
            status_code=502,
            detail={
                "code": "AI_ANALYZE_FAILED",
                "message": "ระบบ AI ตอบไม่สำเร็จ ลองใหม่อีกครั้ง",
            },
        )

    triage = _detect_triage(answer)
    analysis_id = report_repo.create_analysis(
        report_id=report_id,
        requested_by=user.get("id"),
        dify_conversation_id=None,
        summary_text=answer,
        raw_response=json.dumps({"answer": answer}, ensure_ascii=False),
        triage_decision=triage,
    )
    analyses = report_repo.list_analyses(report_id)
    latest = next((a for a in analyses if a["id"] == analysis_id), analyses[0] if analyses else None)
    return {"ok": True, "analysis": latest}


def decide_triage(
    *, analysis_id: int, decision: str, user: dict[str, Any]
) -> dict[str, bool]:
    """บันทึกการตัดสิน triage ของแพทย์ (accept/reject/review) ต่อผลวิเคราะห์หนึ่งอัน
    — 404 ถ้าไม่พบ analysis"""
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
    patient_id: int,
    report_id: int,
    title: str,
    report_type: str,
    source: str,
    assigned_doctor_id: int | None,
    uploaded_by: dict[str, Any],
    file_path: str | None = None,
    file_mime: str | None = None,
    original_filename: str | None = None,
) -> bool:
    """Email the assigned doctor (falls back to REPORT_NOTIFY_EMAIL when no
    doctor is picked or the doctor has no email on file). Best-effort: never
    raises, so a mail outage can't block the upload itself."""
    # Route to the patient's care team (Stage 2). Fall back to the report's
    # assigned doctor, then the shared REPORT_NOTIFY_EMAIL, so a patient with no
    # care team yet is still covered. recipients = [(email, display_name), ...]
    team = patient_doctor_repo.active_recipients(patient_id)
    if team:
        recipients = [(m["email"], m.get("display_name") or "คุณหมอ") for m in team]
    else:
        doctor = user_repo.find_user_by_id(assigned_doctor_id) if assigned_doctor_id else None
        doctor_email = doctor.get("email") if doctor else None
        if doctor_email:
            recipients = [(doctor_email, doctor.get("display_name") or "(ไม่ระบุ)")]
        else:
            recipients = [(REPORT_NOTIFY_EMAIL, "(ไม่ระบุ)")]

    frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173").rstrip("/")
    deep_link = f"{frontend_base}/patients?patient={patient_id}&report={report_id}"

    patient_display = patient.get("display_name") or "-"
    hn = patient.get("hn") or "-"
    uploader_display = (
        uploaded_by.get("display_name") or uploaded_by.get("email") or "-"
    )

    steps = [
        "เปิดลิงก์ด้านบน → กด &lsquo;ดาวน์โหลดไฟล์&rsquo;",
        (
            "เปิด <a href=\"https://notebooklm.google.com\" style=\"color:"
            + COLOR_GREEN_DARK
            + ";\">notebooklm.google.com</a> → New notebook → Add source → Upload"
        ),
        "คัดลอกลิงก์ notebook กลับมาวางใน BBH Portal (ปุ่ม &lsquo;บันทึก NotebookLM link&rsquo;)",
    ]

    subject = f"[BBH] Report ใหม่: {title}"

    details = render_kv_section(
        eyebrow="รายละเอียด Report",
        items=[
            ("คนไข้", f"{patient_display} <span style=\"color:{COLOR_MUTED};\">(HN: {hn})</span>"),
            ("ชื่อ Report", title),
            ("ประเภท", report_type),
            ("แหล่งที่มา", source),
            ("อัพโหลดโดย", uploader_display),
        ],
    )
    cta = render_cta_button(label="เปิดใน BBH Portal", url=deep_link)
    steps_section = render_steps_section(
        eyebrow="ขั้นตอนใส่ NotebookLM",
        steps=steps,
    )
    footer_html = (
        f"การแจ้งเตือนอัตโนมัติจาก BBH Bridge<br>"
        f"Report ID: <span style=\"font-family:{FONT_MONO};color:{COLOR_MUTED};\">{report_id}</span>"
        f" &middot; Patient ID: <span style=\"font-family:{FONT_MONO};color:{COLOR_MUTED};\">{patient_id}</span>"
    )
    # Attach the actual report file so each doctor can grab it straight from
    # Gmail (drag-drop into NotebookLM); helper drops the attachment if > 20MB.
    attach_name = f"{title[:80]}{_ext_for(file_mime or '')}"

    # One personalised email per care-team recipient; True if any send succeeds.
    any_sent = False
    for recipient_email, doctor_display in recipients:
        body_text = render_text_shell(
            eyebrow="รายงานใหม่ · ต้องดำเนินการ",
            title=f"Report ใหม่ของคนไข้ {patient_display}",
            subtitle=f"เรียน คุณหมอ {doctor_display}",
            content_text=(
                f"คนไข้:       {patient_display} (HN: {hn})\n"
                f"ชื่อ Report:  {title}\n"
                f"ประเภท:      {report_type}\n"
                f"แหล่งที่มา:  {source}\n"
                f"อัพโหลดโดย:  {uploader_display}\n\n"
                f"เปิดใน BBH Portal:\n  {deep_link}\n\n"
                f"ขั้นตอนใส่ NotebookLM:\n"
                f"  1) เปิดลิงก์ด้านบน → ดาวน์โหลดไฟล์\n"
                f"  2) เปิด notebooklm.google.com → New notebook → Upload\n"
                f"  3) คัดลอกลิงก์ notebook กลับมาวางใน BBH Portal"
            ),
            footer_text=(
                f"Report ID: {report_id}\n"
                f"Patient ID: {patient_id}"
            ),
        )
        body_html = render_html_shell(
            eyebrow="รายงานใหม่ · ต้องดำเนินการ",
            title_html=(
                f"Report ใหม่ของ <span style=\"color:{COLOR_GREEN_DARK};\">{patient_display}</span>"
            ),
            subtitle=f"เรียน คุณหมอ {doctor_display} — มี Report ใหม่ถูกอัพโหลดเข้าระบบ",
            content_html=details + cta + steps_section,
            footer_html=footer_html,
            preheader=f"{title} · {patient_display} (HN: {hn})",
        )
        sent = send_email(
            to=recipient_email,
            subject=subject,
            body=body_text,
            html=body_html,
            attachment_path=file_path,
            attachment_filename=attach_name,
            attachment_mime=file_mime,
            from_name="Better Being Hospital",
        )
        any_sent = any_sent or sent
    return any_sent


def _detect_mime(raw: bytes) -> str:
    """Authoritative content-type from magic bytes — never trust the client
    header. Unknown binary -> octet-stream (rejected by the allow-list)."""
    if raw[:5] == b"%PDF-":
        return "application/pdf"
    if raw[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if raw[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    head = raw[:8192]
    if b"\x00" not in head:
        try:
            head.decode("utf-8")
            return "text/plain"
        except UnicodeDecodeError:
            pass
    return "application/octet-stream"


def _save_to_disk(raw: bytes, mime: str) -> str:
    """เซฟไฟล์ลงดิสก์ในโฟลเดอร์ตามปี/เดือน ตั้งชื่อด้วย uuid — นามสกุลมาจาก mime ที่
    ตรวจแล้ว (ไม่ใช้ชื่อไฟล์จาก client) กันชื่อ/นามสกุลอันตราย; คืน relative path"""
    now = datetime.now()
    rel_dir = f"{now:%Y/%m}"
    abs_dir = os.path.join(REPORTS_ROOT, rel_dir)
    os.makedirs(abs_dir, exist_ok=True)
    # Extension is derived from the verified mime, never the client filename.
    rel_path = f"{rel_dir}/{uuid.uuid4().hex}{_ext_for(mime)}"
    with open(os.path.join(REPORTS_ROOT, rel_path), "wb") as fh:
        fh.write(raw)
    return rel_path


def _ext_for(mime: str) -> str:
    """map mime ที่ตรวจแล้วเป็นนามสกุลไฟล์ — mime ที่ไม่รู้จักตกเป็น .bin"""
    return {
        "application/pdf": ".pdf",
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "text/plain": ".txt",
    }.get(mime, ".bin")


def _extract_text(raw: bytes, mime: str) -> str | None:
    """สกัด text จากไฟล์: text ตรงๆ, PDF ผ่าน pypdf (จำกัดหน้า/ความยาวกัน bomb),
    รูปยังไม่ทำ OCR (คืน None); ทุก path จำกัดที่ MAX_EXTRACTED_CHARS และไม่โยน error
    (parse ล้ม -> None) เพราะการอัปโหลดยังต้องสำเร็จ"""
    if mime == "text/plain":
        try:
            text = raw.decode("utf-8", errors="ignore").strip()
            return text[:MAX_EXTRACTED_CHARS] or None
        except Exception:  # noqa: BLE001
            return None
    if mime == "application/pdf":
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            parts: list[str] = []
            total = 0
            for i, page in enumerate(reader.pages):
                if i >= MAX_PDF_PAGES:
                    break
                chunk = page.extract_text() or ""
                parts.append(chunk)
                total += len(chunk)
                if total > MAX_EXTRACTED_CHARS:
                    break
            text = "\n\n".join(p.strip() for p in parts if p.strip())
            return text[:MAX_EXTRACTED_CHARS] or None
        except Exception:  # noqa: BLE001
            log.exception("PDF text extraction failed")
            return None
    return None  # images: OCR not in MVP


def _build_context(*, patient: dict[str, Any], report: dict[str, Any]) -> str:
    """ประกอบ prompt วิเคราะห์: ข้อมูลคนไข้ + text ของ report + หัวข้อที่ให้ AI ตอบ
    (รวมบรรทัด Triage ที่ backend ต้อง parse กลับ)"""
    parts = [
        "กรุณาวิเคราะห์ Report ของคนไข้ตามข้อมูลด้านล่าง โดยใช้ความรู้ทางการแพทย์ทั่วไปเป็นแหล่งอ้างอิง",
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
        "3) คำแนะนำเบื้องต้นสำหรับแพทย์",
        "4) Triage suggestion: ลงท้ายด้วย 1 บรรทัด `Triage: accept` หรือ `Triage: reject` หรือ `Triage: review` (review = ไม่แน่ใจ ขอให้แพทย์ตรวจซ้ำ)",
    ]
    return "\n".join(parts)


def _detect_triage(answer: str) -> str:
    """Look for 'Triage: <decision>' line in the model output."""
    m = re.search(r"Triage\s*:\s*(accept|reject|review)", answer, re.IGNORECASE)
    if m:
        return m.group(1).lower()
    return "pending"
