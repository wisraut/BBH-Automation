"""Test 3 paths: doctor, patient-normal, patient-emergency"""
import os
import sys
import time
import httpx
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

DIFY_URL = os.getenv("DIFY_API_URL")
KEY      = os.getenv("DIFY_API_KEY")


def ask(role: str, query: str, label: str):
    print(f"\n{'=' * 70}")
    print(f">>> {label}  (role={role})")
    print(f">>> query: {query[:80]}")
    print("=" * 70)
    t0 = time.time()
    r = httpx.post(
        f"{DIFY_URL}/chat-messages",
        headers={
            "Authorization": f"Bearer {KEY}",
            "Content-Type":  "application/json",
        },
        json={
            "inputs":          {"role": role},
            "query":           query,
            "response_mode":   "blocking",
            "conversation_id": "",
            "user":            f"test:{role}",
        },
        timeout=300,
    )
    dt = time.time() - t0
    print(f"HTTP {r.status_code}  ({dt:.1f}s)")
    if r.status_code != 200:
        print(r.text[:500])
        return
    j = r.json()
    answer = j.get("answer", "")
    print(f"answer ({len(answer)} chars):")
    print("-" * 70)
    print(answer)


# Test 1: Doctor — should hit llm (doctor summary)
ask(
    role="doctor",
    query="ผู้ป่วยชาย 65 ปี ตรวจพบ HbA1c 8.5%, creatinine 1.4 — ขอสรุปสำคัญ",
    label="DOCTOR BRANCH",
)

# Test 2: Patient normal — should hit llm_patient_advisor
ask(
    role="patient",
    query="ผมปวดท้องด้านขวาล่างมา 2 วันแล้ว ไม่แน่ใจว่าเป็นอะไร",
    label="PATIENT NORMAL BRANCH",
)

# Test 3: Patient emergency — should hit answer_emergency (no LLM)
ask(
    role="patient",
    query="ผมเจ็บหน้าอกมาก หายใจไม่ออก ทำยังไงดี",
    label="PATIENT EMERGENCY BRANCH",
)
