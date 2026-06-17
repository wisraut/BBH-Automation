"""
Patch BBH Bot CRO Decide prompt — เพิ่ม routing rule ให้อาการทั่วไป (ปวดหัว/ตัวร้อน/ไข้)
ไปทาง CONSULT (ตอบจาก KB + disclaimer + เมื่อไหร่ควรพบแพทย์) แทนที่จะ ESCALATE:medical

อัปเดตทั้ง draft และ published workflow versions
"""
import json, os, sys, psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

APP_ID             = "63def8c7-3614-4e34-9475-185190b19c0f"
WORKFLOW_PUBLISHED = "264edd76-60b3-4539-8fa1-d7b60aee5d7c"
WORKFLOW_DRAFT     = "5ab61b4b-13e5-4b32-bb53-df2be62f4ae3"

NEW_RULE = (
    "- ถ้าถามอาการทั่วไปแบบกว้างๆ ที่ไม่ใช่ฉุกเฉิน "
    "(\"ปวดหัว\", \"ตัวร้อน\", \"เป็นไข้\", \"ปวดท้องนิดหน่อย\", \"ปวดเมื่อย\", \"นอนไม่หลับ\", \"เครียด\", \"คัดจมูก\", \"ไอ\") "
    "→ CONSULT: ตอบจาก KB ให้คำแนะนำเบื้องต้น (สาเหตุที่พบบ่อย / วิธีดูแลตัวเอง / สัญญาณเตือนที่ควรพบแพทย์) + disclaimer "
    "(ห้าม ESCALATE:medical เพราะ user ไม่ได้ถาม \"ฉันเป็นโรคอะไร\" — แค่บอกว่ามีอาการ ต้องการความรู้/คำแนะนำเบื้องต้น)\n"
    "- ESCALATE:medical ใช้เฉพาะกรณี user ขอวินิจฉัยส่วนตัวอย่างชัดเจน "
    "(\"ฉันเป็น cancer ใช่ไหม\", \"ตรวจหน่อยว่าเป็นโรคอะไร\", \"อาการแบบนี้อันตรายแค่ไหน อันตรายถึงชีวิตไหม\", \"ฉันต้องกินยาอะไร\")"
)

ANCHOR = "ROUTING FIXES - apply BEFORE older rules:"

DIFY_DB = dict(
    host="localhost", port=5433, dbname="dify",
    user="postgres", password=os.getenv("DB_PASSWORD"),
)

def patch_prompt(text: str) -> str:
    if NEW_RULE.splitlines()[0][:30] in text:
        print("  [skip] rule already present")
        return text
    if ANCHOR not in text:
        raise RuntimeError(f"anchor not found: {ANCHOR!r}")
    return text.replace(ANCHOR, ANCHOR + "\n" + NEW_RULE)

def patch_workflow(cur, workflow_id: str, label: str):
    cur.execute("SELECT graph FROM workflows WHERE id=%s", (workflow_id,))
    row = cur.fetchone()
    if not row:
        print(f"  {label}: NOT FOUND")
        return
    graph = json.loads(row[0]) if isinstance(row[0], str) else row[0]
    for n in graph["nodes"]:
        if n["id"] == "llm_cro_decide":
            pt = n["data"]["prompt_template"]
            old = pt[0]["text"]
            new = patch_prompt(old)
            pt[0]["text"] = new
            print(f"  {label}: text {len(old)} → {len(new)} chars")
    cur.execute("UPDATE workflows SET graph=%s, updated_at=NOW() WHERE id=%s",
                (json.dumps(graph, ensure_ascii=False), workflow_id))
    print(f"  {label}: UPDATED")

def main():
    conn = psycopg2.connect(**DIFY_DB)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            print("== published ==")
            patch_workflow(cur, WORKFLOW_PUBLISHED, "published")
            print("== draft ==")
            patch_workflow(cur, WORKFLOW_DRAFT, "draft")
        conn.commit()
        print("\nOK — committed")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

if __name__ == "__main__":
    main()
