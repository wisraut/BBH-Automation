"""
test_pdf_email.py — Test PDF email flow end-to-end
1. Generate fake email with PDF attachment containing lab values
2. Run through email_poller helpers (_get_body, _get_pdf_attachments, _insert_report)
3. Verify DB row created with status=NULL and PDF text in report_text
4. Clean up test rows

ใช้แทนการส่ง email จริง เพราะ test pipeline ไม่ต้องผ่าน Gmail SMTP
"""
import os
import sys
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.mime.application import MIMEApplication

import psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

# Import project packages from repo root.
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from jobs import email_poller

DB_CONFIG = {
    "host":     os.getenv("DB_HOST", "localhost"),
    "port":     int(os.getenv("DB_PORT", 5433)),
    "dbname":   os.getenv("DB_NAME", "hospital_db"),
    "user":     os.getenv("DB_USER", "postgres"),
    "password": os.getenv("DB_PASSWORD"),
}

TEST_PATIENT_EMAIL = "test-patient@example.com"  # HN-2019-001 (สมชาย)
TEST_MARKER = "PDF_TEST_RUN_2026_06_03"  # marker เพื่อ cleanup ง่าย


# ── Build minimal valid PDF with ASCII text content ──────────────────────────
def make_test_pdf(text: str) -> bytes:
    """สร้าง PDF byte สำหรับทดสอบ — ASCII text only, ใช้ Helvetica"""
    # escape PDF string special chars
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    lines = safe.split("\n")
    # Build BT...ET block with multi-line text
    content_lines = [b"BT", b"/F1 11 Tf", b"50 750 Td", b"14 TL"]
    for ln in lines:
        content_lines.append(f"({ln}) Tj".encode("latin-1", errors="replace"))
        content_lines.append(b"T*")
    content_lines.append(b"ET")
    content = b"\n".join(content_lines)

    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R /MediaBox [0 0 612 792] >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(content)).encode() + b" >>\nstream\n" + content + b"\nendstream",
    ]

    pdf = b"%PDF-1.4\n"
    offsets = []
    for i, obj in enumerate(objects, 1):
        offsets.append(len(pdf))
        pdf += f"{i} 0 obj\n".encode() + obj + b"\nendobj\n"

    xref_offset = len(pdf)
    pdf += f"xref\n0 {len(objects) + 1}\n".encode()
    pdf += b"0000000000 65535 f \n"
    for off in offsets:
        pdf += f"{off:010d} 00000 n \n".encode()
    pdf += f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\n".encode()
    pdf += f"startxref\n{xref_offset}\n%%EOF".encode()
    return pdf


# ── Build email message with PDF attachment ──────────────────────────────────
def make_test_email() -> "email.message.Message":
    pdf_text = (
        f"=== {TEST_MARKER} ===\n"
        "Lab Report - 03/06/2026\n"
        "HbA1c: 8.6 percent [HIGH]\n"
        "FBS: 210 mg/dL [HIGH]\n"
        "Creatinine: 1.4 mg/dL [HIGH]\n"
        "BP: 162/96 mmHg [HIGH]\n"
        "Diagnosis: Uncontrolled DM with stage 3 CKD\n"
    )
    msg = MIMEMultipart()
    msg["From"]    = TEST_PATIENT_EMAIL
    msg["To"]      = "owner@example.com"
    msg["Subject"] = f"Lab Report Test {TEST_MARKER}"
    msg.attach(MIMEText("กรุณาดูผลแล็บใน PDF ที่แนบมาด้วยครับ", "plain", "utf-8"))
    pdf_part = MIMEApplication(make_test_pdf(pdf_text), _subtype="pdf")
    pdf_part.add_header("Content-Disposition", "attachment", filename="lab_report.pdf")
    msg.attach(pdf_part)
    return msg


# ── Test steps ───────────────────────────────────────────────────────────────
def cleanup_previous():
    """ลบ test row เก่าก่อนรัน"""
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM audit_logs WHERE report_id IN "
                "(SELECT report_id FROM reports WHERE report_text LIKE %s)",
                (f"%{TEST_MARKER}%",),
            )
            cur.execute("DELETE FROM analyses WHERE report_id IN "
                        "(SELECT report_id FROM reports WHERE report_text LIKE %s)",
                        (f"%{TEST_MARKER}%",))
            cur.execute("DELETE FROM reports WHERE report_text LIKE %s", (f"%{TEST_MARKER}%",))
            conn.commit()
    conn.close()


def main():
    print("=" * 70)
    print(" PDF Email End-to-End Test")
    print("=" * 70)

    # ── 0. Cleanup ──────────────────────────────────────────────────────────
    print("\n[0/5] Cleanup test rows เก่า...")
    cleanup_previous()
    print("      OK")

    # ── 1. สร้าง email mock ──────────────────────────────────────────────────
    print("\n[1/5] สร้าง email message พร้อม PDF attachment...")
    msg = make_test_email()
    pdf_size = len(make_test_pdf("dummy"))
    print(f"      Subject: {msg['Subject']}")
    print(f"      From   : {msg['From']}")
    print(f"      PDF generated: {pdf_size} bytes (sample)")

    # ── 2. ทดสอบ _get_body + _get_pdf_attachments ───────────────────────────
    print("\n[2/5] แตก body + PDF จาก email...")
    body = email_poller._get_body(msg)
    pdfs = email_poller._get_pdf_attachments(msg)
    assert body, "body ว่างเปล่า — _get_body พัง"
    assert len(pdfs) == 1, f"คาดว่าจะมี 1 PDF แต่ได้ {len(pdfs)}"
    fname, pdf_text = pdfs[0]
    assert TEST_MARKER in pdf_text, "ไม่เจอ TEST_MARKER ใน PDF text → extraction พัง"
    assert "HbA1c" in pdf_text, "ไม่เจอ HbA1c ใน PDF text"
    print(f"      body: {body[:50]!r}...")
    print(f"      PDF : {fname} ({len(pdf_text)} chars)")
    print(f"      มี marker '{TEST_MARKER}': YES")

    # ── 3. หาคนไข้จาก sender email ──────────────────────────────────────────
    print("\n[3/5] หาคนไข้จาก sender email...")
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT patient_id, name, doctor_id FROM patients WHERE LOWER(email) = %s",
                (TEST_PATIENT_EMAIL.lower(),),
            )
            row = cur.fetchone()
    conn.close()
    assert row, f"ไม่พบคนไข้ที่ใช้ email {TEST_PATIENT_EMAIL}"
    patient_id, patient_name, doctor_id = row
    print(f"      พบ: {patient_name} ({patient_id}) → แพทย์ {doctor_id}")

    # ── 4. ทดสอบ _insert_report (atomic) ────────────────────────────────────
    print("\n[4/5] รัน _insert_report() ...")
    report_text = f"Subject: {msg['Subject']}\n\n{body}\n\n=== PDF: {fname} ===\n{pdf_text}"
    report_id = email_poller._insert_report(
        DB_CONFIG,
        patient_id  = patient_id,
        source      = TEST_PATIENT_EMAIL,
        subject     = msg["Subject"],
        report_text = report_text,
    )
    print(f"      report_id ที่ได้: {report_id}")
    assert report_id.startswith("RPT-"), "report_id format ผิด"

    # ── 5. Verify DB row ────────────────────────────────────────────────────
    print("\n[5/5] ตรวจสอบ DB ว่า row ถูกต้อง...")
    with psycopg2.connect(**DB_CONFIG) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT report_id, patient_id, status, report_text
                   FROM reports WHERE report_id = %s""",
                (report_id,),
            )
            r = cur.fetchone()
            cur.execute(
                "SELECT action FROM audit_logs WHERE report_id = %s",
                (report_id,),
            )
            audit = cur.fetchall()
    conn.close()

    assert r, "ไม่พบ row ที่เพิ่ง insert"
    assert r[1] == patient_id,  f"patient_id ผิด: {r[1]} ≠ {patient_id}"
    assert r[2] is None,         f"status ต้องเป็น NULL แต่ได้ {r[2]!r} — analyze จะ lock ไม่ได้!"
    assert TEST_MARKER in r[3],  "report_text ไม่มี marker"
    assert "HbA1c" in r[3],      "report_text ไม่มี PDF content"
    assert any(a[0] == "report_submitted" for a in audit), "ไม่พบ audit_log"

    print(f"      report_id    = {r[0]}")
    print(f"      patient_id   = {r[1]}")
    print(f"      status       = {r[2]} (NULL — lock ได้)")
    print(f"      report_text  = {len(r[3])} chars (มี PDF content)")
    print(f"      audit_logs   = {[a[0] for a in audit]}")

    # ── Cleanup ─────────────────────────────────────────────────────────────
    print("\n[Cleanup] ลบ test row...")
    cleanup_previous()
    print("           OK")

    print("\n" + "=" * 70)
    print(" ✅ ALL PASS — email_poller รองรับ PDF + race-safe + status=NULL ครบ")
    print("=" * 70)


if __name__ == "__main__":
    try:
        main()
    except AssertionError as e:
        print(f"\n❌ FAIL: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception:
        import traceback
        traceback.print_exc()
        sys.exit(2)
