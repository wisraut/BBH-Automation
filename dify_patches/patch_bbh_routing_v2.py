"""
BBH Bot CRO Decide — Routing v2 (2026-06-24):
  - Broaden CONSULT scope so symptom inquiries (incl. "อยากมาตรวจ", "กังวล")
    return CONSULT instead of ESCALATE:medical.
  - Narrow ESCALATE:medical to two specific cases (lab interpretation,
    personal drug dosing).
  - Add explicit per-turn re-evaluation rule so the LLM does NOT inherit
    a prior turn's classification from the memory window.
  - Reduce llm_cro_decide memory window 10 -> 5 (still covers the 6-turn
    booking flow but stops a single ESCALATE response from polluting the
    rest of the user's conversation).

Idempotent: safe to run multiple times. Skips edits that already match.
Updates both the draft and the published workflow versions.

Run:
    python dify_patches/patch_bbh_routing_v2.py
"""
import json
import os
import sys

import psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

APP_ID         = "63def8c7-3614-4e34-9475-185190b19c0f"
WORKFLOW_PUB   = "264edd76-60b3-4539-8fa1-d7b60aee5d7c"
WORKFLOW_DRAFT = "5ab61b4b-13e5-4b32-bb53-df2be62f4ae3"

# Routing rules block — full replacement of "ROUTING FIXES" section.
NEW_ROUTING_BLOCK = """ROUTING FIXES - apply BEFORE older rules:

# Per-turn re-evaluation (important for memory window)
ทุก turn ให้ประเมิน classification ใหม่จาก content ปัจจุบัน + KB เท่านั้น
ห้ามจดจำหรือสืบทอด classification (AUTO/ESCALATE/CONSULT/BOOKING_ASK/BOOKING_DONE)
จาก turn ก่อนหน้าโดยอัตโนมัติ — context จาก memory ใช้ได้แค่กรณี booking flow
ที่ยังเก็บ state ระหว่างถามทีละข้อ

# กฎสูงสุด — Booking flow protection (override กฎทั้งหมดด้านล่าง)
ถ้า assistant message ล่าสุดเป็น "BOOKING_ASK: ..." (กำลังอยู่ระหว่างเก็บข้อมูลจอง)
→ user message ถัดไป**คือค่าของ field ที่เพิ่งถามไป** ห้าม classify เป็น
CONSULT/ESCALATE/AUTO เด็ดขาด แม้ user จะตอบเป็นเนื้อหาที่ดูเหมือนอาการทางการแพทย์
รุนแรง

วิธีตอบ:
- บันทึกค่าที่ user ส่งมา (เป็น string ตามที่ส่งมา)
- ถ้ายังเก็บไม่ครบ 5 field (ชื่อ, เบอร์, วัน, เวลา, อาการ) → "BOOKING_ASK: <ขอ field ถัดไป>"
- ถ้าครบ 5 field แล้ว → สรุปข้อมูลแล้วขอยืนยัน ("BOOKING_ASK: ขอสรุปข้อมูลค่ะ... ถูกต้องไหมคะ?")
- ถ้า user ยืนยัน (ใช่/ค่ะ/ครับ/ยืนยัน) → "BOOKING_DONE: {json}"

ห้ามตอบคำแนะนำทางการแพทย์ ห้ามอธิบายโรค ห้ามใส่ disclaimer ระหว่างอยู่ใน booking flow
— ทำเป็น CONSULT ทีหลังได้หลังจาก booking เสร็จเรียบร้อย (เจ้าหน้าที่จะแนะนำเอง)

ตัวอย่าง — ตอนเก็บ field อาการ:
turn(prev): assistant ตอบ "BOOKING_ASK: อาการ/วัตถุประสงค์ค่ะ"
turn(now):  user ตอบ "อาการปวดหัวจี๊ดๆ บางทีเวียนหัว บ้านหมุน"
→ ถูก: "BOOKING_ASK: ขอสรุปข้อมูลค่ะ\\n• ชื่อ: ...\\n• อาการ: อาการปวดหัวจี๊ดๆ บางทีเวียนหัว บ้านหมุน\\n\\nถูกต้องไหมคะ?"
→ ผิด: "CONSULT: อาการปวดศีรษะอาจเกิดได้จาก..." (ห้าม! กำลังอยู่กลาง booking)

# กฎทอง: ลูกค้าบรรยายอาการของตัวเอง → CONSULT ทุกครั้ง
(ใช้เมื่อ**ไม่ได้**อยู่ใน booking flow เท่านั้น)
ไม่ว่าจะใช้คำว่า "กังวล", "อยากมาตรวจ", "อยากรู้ว่าเป็นอะไร", "ไม่แน่ใจ",
"อยากให้ช่วยดู", หรือ "คิดว่าอาจจะเป็น..." — เป็น CONSULT ทั้งหมด
อาการครอบคลุม: ปวดหัว, ตัวร้อน, เป็นไข้, ปวดท้อง, ปวดเมื่อย, นอนไม่หลับ, เครียด,
คัดจมูก, ไอ, มือ-ขาอ่อนแรง, ชา, มึน, เวียนหัว, ใจสั่น, ผื่น, ปวดเฉพาะที่,
อาการทางระบบประสาท ฯลฯ

CONSULT response ต้องมี:
  1. สาเหตุที่พบได้บ่อย (ความรู้ทั่วไป)
  2. วิธีดูแลตัวเองเบื้องต้น
  3. สัญญาณเตือนที่ต้องไป รพ./โทร 1669 ทันที (ถ้าอาการเข้าข่าย)
  4. แนะนำให้พบแพทย์เพื่อวินิจฉัย (พร้อมเสนอนัดได้)
  + disclaimer ปิดท้าย

# ESCALATE:medical — เฉพาะ 2 กรณีเท่านั้น (ห้ามใช้กับการบรรยายอาการ)
1. ลูกค้าถามตีความผลตรวจที่มีอยู่แล้ว
   เช่น "ค่า ALT 200 แปลว่าอะไร", "ผล CT ของฉันบอกว่ามี mass แปลว่าเป็นอะไร"
2. ลูกค้าถามขนาด/ชนิดยาเฉพาะบุคคล
   เช่น "ฉันควรกินยาอะไร dose เท่าไหร่", "ปรับยาให้หน่อย"
(คำถามแบบ "ฉันเป็นโรค X ใช่ไหม" → CONSULT ก็ได้ เพราะตอบความรู้ทั่วไป + แนะนำพบแพทย์)

# ESCALATE:emergency — keyword ฉุกเฉินถึงชีวิตเท่านั้น
เจ็บหน้าอกรุนแรง, หายใจไม่ออก, หมดสติ, ชัก, เลือดออกไม่หยุด, อุบัติเหตุ

# Other routing
- ถาม "วันไหนว่าง", "มีคิวว่างไหม", "วัน X ว่างไหม", "อาทิตย์หน้าว่างไหม" → BOOKING_ASK
- ถาม "คลินิกรักษาอะไรได้บ้าง", "รักษาโรคอะไรได้" → AUTO จาก reference
- ถามความรู้ทั่วไปเกี่ยวกับ Functional Medicine, อาหารเสริม, วิตามิน, ฮอร์โมน
  (เช่น "omega-3 ช่วยอะไร", "Leaky Gut คืออะไร") → CONSULT + disclaimer"""

# Stable anchor — block always starts with "ROUTING FIXES - apply BEFORE older rules:"
# Replace from the anchor to the prompt sentinel "ตอบ:" (which sits at the very end).
ANCHOR_HEAD = "ROUTING FIXES - apply BEFORE older rules:"
ANCHOR_TAIL = "ตอบ:"

# Target memory window size for the routing classifier node.
MEMORY_WINDOW_SIZE = 5


def patch_prompt(text: str) -> tuple[str, bool]:
    head = text.find(ANCHOR_HEAD)
    tail = text.rfind(ANCHOR_TAIL)
    if head == -1 or tail == -1 or tail < head:
        return text, False
    new = text[:head] + NEW_ROUTING_BLOCK + "\n\n" + ANCHOR_TAIL
    return new, new != text


def patch_memory(node: dict) -> bool:
    mem = node["data"].setdefault("memory", {})
    win = mem.setdefault("window", {"size": MEMORY_WINDOW_SIZE, "enabled": True})
    changed = False
    if win.get("size") != MEMORY_WINDOW_SIZE:
        win["size"] = MEMORY_WINDOW_SIZE
        changed = True
    if not win.get("enabled"):
        win["enabled"] = True
        changed = True
    return changed


def patch_workflow(cur, wf_id: str) -> None:
    cur.execute("SELECT graph FROM workflows WHERE id=%s", (wf_id,))
    row = cur.fetchone()
    if not row:
        print(f"  [SKIP] {wf_id}: not found")
        return
    graph = json.loads(row[0])
    prompt_changed = False
    memory_changed = False
    for node in graph["nodes"]:
        if node["id"] != "llm_cro_decide":
            continue
        tmpl = node["data"]["prompt_template"][0]
        new_text, prompt_changed = patch_prompt(tmpl["text"])
        tmpl["text"] = new_text
        memory_changed = patch_memory(node)
        break

    if not (prompt_changed or memory_changed):
        print(f"  [OK ] {wf_id}: already up to date")
        return

    cur.execute(
        "UPDATE workflows SET graph=%s WHERE id=%s",
        (json.dumps(graph, ensure_ascii=False), wf_id),
    )
    parts = []
    if prompt_changed:
        parts.append("prompt")
    if memory_changed:
        parts.append("memory")
    print(f"  [OK ] {wf_id}: patched {' + '.join(parts)}")


def main() -> int:
    conn = psycopg2.connect(
        host=os.getenv("DIFY_DB_HOST", "localhost"),
        port=int(os.getenv("DIFY_DB_PORT", 5433)),
        dbname="dify",
        user="postgres",
        password=os.getenv("DIFY_DB_PASSWORD", "difyai123456"),
    )
    try:
        with conn.cursor() as cur:
            for wf in (WORKFLOW_DRAFT, WORKFLOW_PUB):
                patch_workflow(cur, wf)
        conn.commit()
    finally:
        conn.close()
    print("\nDone. Memory window 10 -> 5, routing prompt v2 applied.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
