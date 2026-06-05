"""
Patch Dify graph เพิ่ม Patient branch (Task #16, 2026-06-04)

Original (linear):
    start -> kb -> format_docs -> llm -> answer

New:
    start (+role var)
      -> kb -> format_docs -> if_else_role
                                 |--patient_role--> if_else_emergency
                                 |                     |--emergency--> answer_emergency
                                 |                     |--false-----> llm_patient_advisor -> answer_patient
                                 |--false---------> llm -> answer  (doctor — unchanged)
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
APP_ID             = "64eb590e-4b27-4b10-aca2-44355e37ff40"
START_NODE_ID      = "1779775683966"

DIFY_DB = {
    "host": "localhost", "port": 5433, "dbname": "dify",
    "user": "postgres", "password": os.getenv("DB_PASSWORD"),
}

PATIENT_PROMPT = """คุณคือผู้ช่วยให้ข้อมูลของโรงพยาบาล สำหรับคนไข้

หน้าที่ของคุณ:
- ตอบเป็นภาษาไทยที่เข้าใจง่าย ห้ามใช้ศัพท์แพทย์โดยไม่อธิบาย
- ใช้ข้อมูลจากแหล่งอ้างอิงด้านล่างเป็นหลัก ห้ามแต่งเอง
- ไม่วินิจฉัยโรค แต่ให้ข้อมูลทั่วไปและคำแนะนำ

อาการ/คำถามจากคนไข้:
{{#sys.query#}}

แหล่งอ้างอิงจากหนังสือแพทย์:
{{#context#}}

ตอบในรูปแบบนี้ทุกครั้ง:

1️⃣ สิ่งที่อาจเป็นไปได้
(จากหนังสือ อธิบายภาษาง่าย)

2️⃣ การดูแลตัวเองเบื้องต้น
(สิ่งที่ทำได้เองที่บ้าน)

3️⃣ สัญญาณที่ต้องรีบไปโรงพยาบาล
(อาการที่ควรไปพบแพทย์ทันที)

⚠️ นี่เป็นข้อมูลเพื่อความเข้าใจเท่านั้น ไม่ใช่การวินิจฉัย กรุณาปรึกษาแพทย์เพื่อตรวจอาการจริง"""

EMERGENCY_TEXT = (
    "🚨 อาการที่คุณบอกอาจเป็นเหตุฉุกเฉิน\n\n"
    "กรุณา **โทร 1669** ทันที (สายด่วนการแพทย์ฉุกเฉิน)\n"
    "หรือเดินทางไปโรงพยาบาลที่ใกล้ที่สุด\n\n"
    "อย่ารอครับ/ค่ะ ขอให้ปลอดภัย 🙏"
)

EMERGENCY_KEYWORDS = [
    "เจ็บหน้าอก", "หายใจไม่ออก", "เลือดออกมาก",
    "หมดสติ", "ชัก", "อาเจียนเป็นเลือด", "ปวดหัวรุนแรง",
]


def build_new_nodes():
    """สร้าง 5 nodes ใหม่ + return list"""
    nodes = []

    # 1. if_else_role
    nodes.append({
        "id": "if_else_role",
        "type": "custom",
        "width": 224,
        "height": 130,
        "position": {"x": 900, "y": 320},
        "positionAbsolute": {"x": 900, "y": 320},
        "sourcePosition": "right",
        "targetPosition": "left",
        "data": {
            "type": "if-else",
            "title": "Check Role",
            "selected": False,
            "cases": [
                {
                    "case_id": "patient_role",
                    "logical_operator": "and",
                    "conditions": [
                        {
                            "value": "patient",
                            "variable_selector": [START_NODE_ID, "role"],
                            "comparison_operator": "is",
                        }
                    ],
                }
            ],
        },
    })

    # 2. if_else_emergency (only on patient branch)
    nodes.append({
        "id": "if_else_emergency",
        "type": "custom",
        "width": 224,
        "height": 200,
        "position": {"x": 1180, "y": 480},
        "positionAbsolute": {"x": 1180, "y": 480},
        "sourcePosition": "right",
        "targetPosition": "left",
        "data": {
            "type": "if-else",
            "title": "Emergency Keyword?",
            "selected": False,
            "cases": [
                {
                    "case_id": "emergency",
                    "logical_operator": "or",
                    "conditions": [
                        {
                            "value": kw,
                            "variable_selector": ["sys", "query"],
                            "comparison_operator": "contains",
                        }
                        for kw in EMERGENCY_KEYWORDS
                    ],
                }
            ],
        },
    })

    # 3. answer_emergency
    nodes.append({
        "id": "answer_emergency",
        "type": "custom",
        "width": 244,
        "height": 105,
        "position": {"x": 1460, "y": 380},
        "positionAbsolute": {"x": 1460, "y": 380},
        "sourcePosition": "right",
        "targetPosition": "left",
        "data": {
            "type": "answer",
            "title": "Emergency 1669",
            "answer": EMERGENCY_TEXT,
            "selected": False,
            "variables": [],
        },
    })

    # 4. llm_patient_advisor
    nodes.append({
        "id": "llm_patient_advisor",
        "type": "custom",
        "width": 244,
        "height": 98,
        "position": {"x": 1460, "y": 580},
        "positionAbsolute": {"x": 1460, "y": 580},
        "sourcePosition": "right",
        "targetPosition": "left",
        "data": {
            "type": "llm",
            "title": "Patient Advisor",
            "selected": False,
            "model": {
                "mode": "chat",
                "name": "google/gemini-2.5-flash-lite",
                "provider": "langgenius/openrouter/openrouter",
                "completion_params": {"temperature": 0.5},
            },
            "memory": {
                "window": {"size": 10, "enabled": False},
                "role_prefix": {"user": "", "assistant": ""},
                "query_prompt_template": "{{#sys.query#}}\n\n{{#sys.files#}}",
            },
            "vision": {"enabled": False},
            "context": {
                "enabled": True,
                "variable_selector": ["format_docs", "formatted_context"],
            },
            "variables": [],
            "prompt_template": [
                {
                    "id": "prompt-patient-advisor",
                    "role": "system",
                    "text": PATIENT_PROMPT,
                }
            ],
        },
    })

    # 5. answer_patient
    nodes.append({
        "id": "answer_patient",
        "type": "custom",
        "width": 244,
        "height": 105,
        "position": {"x": 1740, "y": 580},
        "positionAbsolute": {"x": 1740, "y": 580},
        "sourcePosition": "right",
        "targetPosition": "left",
        "data": {
            "type": "answer",
            "title": "Patient Answer",
            "answer": "{{#llm_patient_advisor.text#}}",
            "selected": False,
            "variables": [],
        },
    })

    return nodes


def build_new_edges():
    """สร้าง edges ใหม่ตาม topology"""
    return [
        # format_docs -> if_else_role
        {
            "id": "format_docs-if_else_role",
            "type": "custom",
            "source": "format_docs",
            "target": "if_else_role",
            "sourceHandle": "source",
            "targetHandle": "target",
            "data": {"sourceType": "code", "targetType": "if-else"},
        },
        # if_else_role:patient -> if_else_emergency
        {
            "id": "if_else_role-patient-if_else_emergency",
            "type": "custom",
            "source": "if_else_role",
            "target": "if_else_emergency",
            "sourceHandle": "patient_role",
            "targetHandle": "target",
            "data": {"sourceType": "if-else", "targetType": "if-else"},
        },
        # if_else_role:false -> llm (doctor flow)
        {
            "id": "if_else_role-false-llm",
            "type": "custom",
            "source": "if_else_role",
            "target": "llm",
            "sourceHandle": "false",
            "targetHandle": "target",
            "data": {"sourceType": "if-else", "targetType": "llm"},
        },
        # if_else_emergency:emergency -> answer_emergency
        {
            "id": "if_else_emergency-emergency-answer_emergency",
            "type": "custom",
            "source": "if_else_emergency",
            "target": "answer_emergency",
            "sourceHandle": "emergency",
            "targetHandle": "target",
            "data": {"sourceType": "if-else", "targetType": "answer"},
        },
        # if_else_emergency:false -> llm_patient_advisor
        {
            "id": "if_else_emergency-false-llm_patient_advisor",
            "type": "custom",
            "source": "if_else_emergency",
            "target": "llm_patient_advisor",
            "sourceHandle": "false",
            "targetHandle": "target",
            "data": {"sourceType": "if-else", "targetType": "llm"},
        },
        # llm_patient_advisor -> answer_patient
        {
            "id": "llm_patient_advisor-answer_patient",
            "type": "custom",
            "source": "llm_patient_advisor",
            "target": "answer_patient",
            "sourceHandle": "source",
            "targetHandle": "target",
            "data": {"sourceType": "llm", "targetType": "answer"},
        },
    ]


def transform(graph: dict) -> dict:
    """In-place transform — return modified graph dict"""
    # 1. Add `role` variable to start node
    for n in graph["nodes"]:
        if n["id"] == START_NODE_ID:
            existing = n["data"].setdefault("variables", [])
            if not any(v.get("variable") == "role" for v in existing):
                existing.append({
                    "label":      "role",
                    "variable":   "role",
                    "type":       "select",
                    "options":    ["doctor", "patient"],
                    "default":    "doctor",
                    "required":   False,
                    "max_length": 48,
                })

    # 2. Remove edge format_docs -> llm (replace with format_docs -> if_else_role)
    graph["edges"] = [
        e for e in graph["edges"]
        if not (e.get("source") == "format_docs" and e.get("target") == "llm")
    ]

    # 3. Skip if already patched
    existing_node_ids = {n["id"] for n in graph["nodes"]}
    new_nodes = [n for n in build_new_nodes() if n["id"] not in existing_node_ids]
    graph["nodes"].extend(new_nodes)

    existing_edge_ids = {e["id"] for e in graph["edges"]}
    new_edges = [e for e in build_new_edges() if e["id"] not in existing_edge_ids]
    graph["edges"].extend(new_edges)

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
    print("\n✅ Graph patched in DB (both published and draft)")


if __name__ == "__main__":
    main()
