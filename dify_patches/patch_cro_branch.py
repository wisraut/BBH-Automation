"""
Patch Dify graph เพิ่ม CRO Inquiry branch (Phase 1A, 2026-06-05)

After patch — `public_inquiry` case ใน if_else_role:
    if_else_role[role=public_inquiry]
      -> llm_cro_decide (Gemini Flash)
         system prompt: ตัดสินใจ AUTO: หรือ ESCALATE:<class>:
         context: {{#format_docs.formatted_context#}}
      -> answer_cro
         output: {{#llm_cro_decide.text#}}

main.py._handle_public_inquiry parse prefix:
    - "AUTO: ..."          → forward text ตรงๆ ให้คนไข้
    - "ESCALATE:<class>:..." → insert cro_queue + notify CRO team + ตอบ "รับเรื่องแล้ว"

Idempotent — รันซ้ำได้ ไม่ duplicate
"""
import json
import sys
import os
import psycopg2
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

WORKFLOW_PUBLISHED = "8f10dd4d-de2c-44a7-92fa-8a5c05a77224"
WORKFLOW_DRAFT     = "e0a912fd-4153-4144-b4fd-ec22ad68ff0e"
START_NODE_ID      = "1779775683966"

DIFY_DB = {
    "host": "localhost", "port": 5433, "dbname": "dify",
    "user": "postgres", "password": os.getenv("DB_PASSWORD"),
}

CRO_DECIDE_PROMPT = """คุณเป็น AI Assistant ของโรงพยาบาล Better Being Hospital (BBH) สาย Functional Medicine

ตอบในรูปแบบ EXACTLY หนึ่งใน 4 format นี้เท่านั้น — ห้ามอธิบายเพิ่มหรือใส่ข้อความอื่น:

1. "AUTO: <คำตอบ>"
   ใช้กับ: ทักทาย / ขอบคุณ / ลา / ข้อมูลทั่วไปที่มีใน reference

2. "ESCALATE:<class>: <เหตุผลสั้น>"
   ใช้กับ: ที่ AI ไม่ควรตอบเอง
   classes: pricing | scheduling | medical | emergency | complaint | personal_data | unknown

3. "BOOKING_ASK: <ข้อความถามต่อ>"
   ใช้กับ: ลูกค้าต้องการจองคิว และยังขาดข้อมูล
   ถามทีละข้อ จนครบ 5 ข้อ: ชื่อ, เบอร์โทร, วันที่, เวลา, อาการ/วัตถุประสงค์

4. "BOOKING_DONE: {\"name\":\"...\",\"phone\":\"...\",\"date\":\"...\",\"time\":\"...\",\"symptom\":\"...\"}"
   ใช้เมื่อ: ครบ 5 ข้อ และลูกค้ายืนยัน (ใช่/ค่ะ/ครับ/ยืนยัน)

เกณฑ์การตัดสินใจ:
- emergency keywords (เจ็บหน้าอก/หายใจไม่ออก/หมดสติ/ชัก) → ESCALATE:emergency เสมอ
- คำถามวินิจฉัย/อาการ → ESCALATE:medical (ห้าม AI วินิจฉัย)
- ราคา/บริการ/เวลาเปิด → ESCALATE (ถ้า reference ไม่มี)
- ทักทาย/ขอบคุณ → AUTO
- "จองคิว"/"นัด"/"อยากตรวจ" → เข้า booking flow

Booking flow — ถามทีละข้อ:
1. ชื่อ-นามสกุล
2. เบอร์โทร
3. วันที่สะดวก
4. เวลาสะดวก
5. อาการ/วัตถุประสงค์
6. สรุป + ขอยืนยัน → ถ้าตอบยืนยัน output BOOKING_DONE: {json}

ตัวอย่าง booking turn by turn:
turn1 user: "อยากจองคิว"          → "BOOKING_ASK: ยินดีค่ะ ขอชื่อ-นามสกุลก่อนนะคะ"
turn2 user: "นาย A ใจดี"          → "BOOKING_ASK: ขอเบอร์โทรค่ะ"
turn3 user: "081-234-5678"        → "BOOKING_ASK: วันที่สะดวกค่ะ (จ-ศ 8:00-18:00, ส 9:00-15:00)"
turn4 user: "วันเสาร์"             → "BOOKING_ASK: เวลาที่สะดวกค่ะ"
turn5 user: "9 โมงเช้า"            → "BOOKING_ASK: อาการ/วัตถุประสงค์ค่ะ"
turn6 user: "ปวดท้อง"              → "BOOKING_ASK: ขอสรุปข้อมูลค่ะ\\n• ชื่อ: นาย A ใจดี\\n• เบอร์: 081-234-5678\\n• วัน: เสาร์\\n• เวลา: 9:00\\n• อาการ: ปวดท้อง\\n\\nถูกต้องไหมคะ?"
turn7 user: "ใช่ค่ะ"               → "BOOKING_DONE: {\"name\":\"นาย A ใจดี\",\"phone\":\"081-234-5678\",\"date\":\"เสาร์\",\"time\":\"9:00\",\"symptom\":\"ปวดท้อง\"}"

ห้ามแต่งข้อมูลเอง — ใช้เฉพาะที่ user พิมพ์มา
ห้าม output อะไรนอกเหนือจาก 4 format ข้างบน

คำถามปัจจุบัน: {{#sys.query#}}
Reference: {{#context#}}

ตอบ:"""


def build_cro_nodes():
    """3 nodes ใหม่: llm_cro_decide + answer_cro"""
    return [
        {
            "id": "llm_cro_decide",
            "type": "custom",
            "width": 244,
            "height": 98,
            "position": {"x": 1460, "y": 100},
            "positionAbsolute": {"x": 1460, "y": 100},
            "sourcePosition": "right",
            "targetPosition": "left",
            "data": {
                "type": "llm",
                "title": "CRO Decide",
                "selected": False,
                "model": {
                    "mode": "chat",
                    "name": "google/gemini-2.5-flash-lite",
                    "provider": "langgenius/openrouter/openrouter",
                    "completion_params": {"temperature": 0.2},
                },
                "memory": {
                    "window": {"size": 10, "enabled": True},
                    "role_prefix": {"user": "", "assistant": ""},
                    "query_prompt_template": "{{#sys.query#}}",
                },
                "vision": {"enabled": False},
                "context": {
                    "enabled": True,
                    "variable_selector": ["format_docs", "formatted_context"],
                },
                "variables": [],
                "prompt_template": [
                    {
                        "id": "prompt-cro-decide",
                        "role": "system",
                        "text": CRO_DECIDE_PROMPT,
                    }
                ],
            },
        },
        {
            "id": "answer_cro",
            "type": "custom",
            "width": 244,
            "height": 105,
            "position": {"x": 1740, "y": 100},
            "positionAbsolute": {"x": 1740, "y": 100},
            "sourcePosition": "right",
            "targetPosition": "left",
            "data": {
                "type": "answer",
                "title": "CRO Answer (raw — main.py parses prefix)",
                "answer": "{{#llm_cro_decide.text#}}",
                "selected": False,
                "variables": [],
            },
        },
    ]


def build_cro_edges():
    return [
        {
            "id": "if_else_role-public_inquiry-llm_cro_decide",
            "type": "custom",
            "source": "if_else_role",
            "target": "llm_cro_decide",
            "sourceHandle": "public_inquiry_role",
            "targetHandle": "target",
            "data": {"sourceType": "if-else", "targetType": "llm"},
        },
        {
            "id": "llm_cro_decide-answer_cro",
            "type": "custom",
            "source": "llm_cro_decide",
            "target": "answer_cro",
            "sourceHandle": "source",
            "targetHandle": "target",
            "data": {"sourceType": "llm", "targetType": "answer"},
        },
    ]


def transform(graph: dict) -> dict:
    # 1. Update start node `role` variable: cro_inquiry → public_inquiry
    for n in graph["nodes"]:
        if n["id"] == START_NODE_ID:
            for v in n["data"].get("variables", []):
                if v.get("variable") == "role":
                    opts = v.setdefault("options", [])
                    opts[:] = [o if o != "cro_inquiry" else "public_inquiry" for o in opts]
                    if "public_inquiry" not in opts:
                        opts.append("public_inquiry")
                    break

    # 2. Migrate or add if_else_role case
    for n in graph["nodes"]:
        if n["id"] == "if_else_role":
            cases = n["data"].setdefault("cases", [])
            migrated = False
            for c in cases:
                if c.get("case_id") == "cro_inquiry_role":
                    c["case_id"] = "public_inquiry_role"
                    for cond in c.get("conditions", []):
                        if cond.get("value") == "cro_inquiry":
                            cond["value"] = "public_inquiry"
                    migrated = True
                    break
            if not migrated and not any(c.get("case_id") == "public_inquiry_role" for c in cases):
                cases.insert(0, {
                    "case_id": "public_inquiry_role",
                    "logical_operator": "and",
                    "conditions": [
                        {
                            "value": "public_inquiry",
                            "variable_selector": [START_NODE_ID, "role"],
                            "comparison_operator": "is",
                        }
                    ],
                })
            break

    # 3. Migrate edge id + sourceHandle: cro_inquiry → public_inquiry
    for e in graph["edges"]:
        if e.get("id") == "if_else_role-cro_inquiry-llm_cro_decide":
            e["id"] = "if_else_role-public_inquiry-llm_cro_decide"
        if e.get("sourceHandle") == "cro_inquiry_role":
            e["sourceHandle"] = "public_inquiry_role"

    # 4. Add new nodes — OR update existing (overwrite prompt + memory)
    new_nodes = {n["id"]: n for n in build_cro_nodes()}
    updated = []
    for n in graph["nodes"]:
        if n["id"] in new_nodes:
            n["data"] = new_nodes[n["id"]]["data"]  # overwrite data (prompt, memory)
            updated.append(n["id"])
    existing_ids = {n["id"] for n in graph["nodes"]}
    for nid, n in new_nodes.items():
        if nid not in existing_ids:
            graph["nodes"].append(n)

    # 5. Add new edges (idempotent)
    existing_eids = {e["id"] for e in graph["edges"]}
    graph["edges"].extend([e for e in build_cro_edges() if e["id"] not in existing_eids])

    return graph


def main():
    conn = psycopg2.connect(**DIFY_DB)
    cur = conn.cursor()

    for wf_id, label in [(WORKFLOW_PUBLISHED, "published"), (WORKFLOW_DRAFT, "draft")]:
        cur.execute("SELECT graph FROM workflows WHERE id=%s", (wf_id,))
        row = cur.fetchone()
        if not row:
            print(f"⚠️  workflow {label} ({wf_id}) not found — skip")
            continue
        graph = row[0]
        if isinstance(graph, str):
            graph = json.loads(graph)
        n_before = len(graph.get("nodes", []))
        e_before = len(graph.get("edges", []))
        new = transform(graph)
        n_after = len(new["nodes"])
        e_after = len(new["edges"])
        cur.execute(
            "UPDATE workflows SET graph=%s, updated_at=NOW() WHERE id=%s",
            (json.dumps(new, ensure_ascii=False), wf_id),
        )
        print(f"✓ {label:<10} {wf_id}  nodes {n_before}->{n_after}  edges {e_before}->{e_after}")

    conn.commit()
    cur.close()
    conn.close()
    print("\n✅ CRO branch patched (both published and draft)")


if __name__ == "__main__":
    main()
