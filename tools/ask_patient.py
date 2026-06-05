"""
ask_patient.py — ส่งอาการให้ Dify (role=patient) แล้วดูคำตอบ
ใช้: python ask_patient.py "ปวดหัวมา 3 วัน"
     python ask_patient.py --doctor "ผู้ป่วยชาย 65 ปี HbA1c 8.5"
"""
import os
import sys
import time
import httpx
from dotenv import load_dotenv

sys.stdout.reconfigure(encoding="utf-8")
load_dotenv()

DIFY_URL = os.getenv("DIFY_API_URL")
KEY      = os.getenv("DIFY_API_KEY")

role = "patient"
args = sys.argv[1:]
if args and args[0] == "--doctor":
    role = "doctor"
    args = args[1:]

if not args:
    print("ใช้: python ask_patient.py \"<อาการ>\"")
    print("     python ask_patient.py --doctor \"<lab report>\"")
    sys.exit(1)

query = " ".join(args)
print(f">>> role={role}  query={query}")
print("-" * 70)

t0 = time.time()
r = httpx.post(
    f"{DIFY_URL}/chat-messages",
    headers={"Authorization": f"Bearer {KEY}"},
    json={
        "inputs":          {"role": role},
        "query":           query,
        "response_mode":   "blocking",
        "conversation_id": "",
        "user":            f"cli-{role}",
    },
    timeout=300,
)
dt = time.time() - t0

if r.status_code != 200:
    print(f"HTTP {r.status_code}")
    print(r.text[:500])
    sys.exit(2)

j = r.json()
print(j.get("answer", ""))
print("-" * 70)
print(f"[{dt:.1f}s, {len(j.get('answer',''))} chars, conv={j.get('conversation_id','')[:12]}]")
