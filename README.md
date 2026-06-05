# LINE–Dify Hospital Bridge

> ระบบ AI assistant สำหรับคลินิก Functional Medicine — ช่วยตอบคำถามคนไข้, สรุปรายงานผลตรวจให้แพทย์, และวินิจฉัยอาการเบื้องต้นจากองค์ความรู้ในหนังสือแพทย์

ระบบรับ message จากคนไข้ผ่าน **LINE / Email** → ใช้ **Dify (LLM + RAG)** จาก Knowledge Base หนังสือ Functional Medicine → ตอบกลับอัตโนมัติ หรือส่งต่อให้แพทย์/พนักงานคลินิก review

---

## Features

- 🤖 **Doctor flow** — แพทย์ login ใน LINE ด้วย DR001 → รับแจ้งเตือน report จากคนไข้ → กดวิเคราะห์ → ได้สรุปจาก Gemini (ผ่าน Dify) ภายใน 30 วินาที
- 🩺 **Patient Advisor** — คนไข้ register PT001 → ปรึกษาอาการผ่าน LINE → AI ตอบจาก KB Functional Medicine + disclaimer
- 🚨 **Emergency keyword detection** — Dify ตรวจ 7 keyword ฉุกเฉิน (เจ็บหน้าอก/หายใจไม่ออก/ฯลฯ) → ตอบ "โทร 1669" ทันที
- 📧 **Email poller** — รับ report จากคนไข้ทาง Gmail (PDF attachment) → แตก text → แจ้งแพทย์
- 🎯 **Centralized Dify** — routing logic ทั้งหมดอยู่ใน Dify graph (if-else nodes) — `main.py` ทำหน้าที่แค่ bridge
- 🔒 **HMAC signature verify** — LINE webhook ใช้ SHA-256 ตามมาตรฐาน
- 📊 **TUI Monitor** — Textual dashboard แสดงสถานะ services / doctors / reports / activity real-time

---

## Architecture

```
                            ┌─────────────────────┐
   ┌────────┐   webhook    │   ngrok container   │
   │  LINE  │ ────────────▶│  (static domain)    │
   └────────┘               └──────────┬──────────┘
                                       │
                                       ▼
   ┌────────┐               ┌─────────────────────┐
   │ Gmail  │ ─── IMAP ───▶│   bridge container  │
   └────────┘               │  - FastAPI          │
                            │  - LINE handler     │
                            │  - email_poller     │
                            └──────────┬──────────┘
                                       │
                            ┌──────────┼──────────┐
                            ▼          ▼          ▼
                       ┌────────┐ ┌────────┐ ┌─────────┐
                       │  Dify  │ │ Hosp.  │ │ Gemini  │
                       │ (RAG + │ │  DB    │ │ (via    │
                       │ Graph) │ │        │ │ OpenRtr)│
                       └────────┘ └────────┘ └─────────┘
                            │
                            ▼
                       ┌─────────────────┐
                       │  Knowledge Base │
                       │  - FM Textbook  │
                       │  - FM Standard  │
                       └─────────────────┘
```

ทุก container ใช้ Docker network `docker_default` (จาก Dify compose) — bridge join เข้าผ่าน external network.

---

## Quick Start

ติดตั้งครั้งแรกบนเครื่องใหม่ดู **[Setup.md](Setup.md)** (มี 2 ทาง: ลงจาก backup / ลงสด)

หลังติดตั้งแล้ว — รัน:
```powershell
.\start.bat
```
จะ start ทุก service (Dify + bridge + ngrok + monitor TUI) ในคำสั่งเดียว

### Verify
```powershell
# Bridge
curl http://localhost:8000/

# Dify
curl http://localhost/v1/info -H "Authorization: Bearer $env:DIFY_API_KEY"

# ngrok tunnel
curl https://<your-domain>.ngrok-free.dev/
```

---

## Tech Stack

| Layer | ใช้ |
|---|---|
| LLM Orchestration | [Dify](https://dify.ai) (self-hosted, advanced-chat mode) |
| LLM | Google Gemini Flash (ผ่าน OpenRouter) |
| Embedding / Vector | Dify built-in (Weaviate) |
| Bridge | Python 3.12 + FastAPI + Uvicorn |
| DB | PostgreSQL 15 (Dify ใช้ instance เดียวกัน) |
| Tunnel | ngrok (static domain free tier) |
| Container | Docker Compose |
| LINE | Messaging API + Quick Reply postback |
| Email | Gmail IMAP + pypdf |
| Monitor | Textual (Python TUI) |

---

## Project Structure

```
line-dify-bridge/
├── main.py                      # FastAPI app + LINE webhook + routing
├── email_poller.py              # Gmail IMAP poller (รัน async ใน bridge)
├── monitor.py                   # TUI dashboard (รัน host, ไม่ใช่ container)
├── ask_patient.py               # CLI tool ทดสอบส่งคำถามให้ Dify
├── _patch_dify_graph.py         # ใส่ if-else routing เข้า Dify graph (Setup ทาง B)
├── requirements.txt
│
├── Dockerfile                   # bridge image
├── .dockerignore
├── docker-compose.bridge.yaml   # bridge + ngrok services (override Dify compose)
├── start.bat                    # Single-command launcher (Dify + bridge + monitor)
│
├── migrate_hospital_db.sql      # schema + seed (doctors/patients/reports)
├── migrate_patient_register.sql # patient_code + line_uid + dify_conversation_id
│
├── tests/
│   ├── test_full_flow.py        # end-to-end (28+ tests)
│   ├── test_patient_flow.py     # patient register/advisor/emergency
│   └── test_pdf_email.py        # email poller + PDF extraction
│
├── README.md                    # คุณกำลังอ่านอยู่
├── Setup.md                     # คู่มือลงเครื่องใหม่ (backup-restore + fresh)
├── CLAUDE.md                    # Architecture, rules, Dify state, Changelog
├── ERRORS.md                    # Bug history + root causes + fixes
├── .env.example                 # template ของ .env
└── .gitignore
```

---

## Development

### Run tests
```powershell
cd tests
python test_full_flow.py       # 28+ tests ครอบคลุม doctor + patient + edge cases
python test_patient_flow.py    # patient register/advisor/emergency (31 tests)
python test_pdf_email.py       # email + PDF parsing
```

### View logs
```powershell
docker logs hospital-bridge -f       # bridge logs
docker logs hospital-ngrok -f        # ngrok tunnel events
docker logs docker-api-1 --tail 50   # Dify api
```

### Stop services
```powershell
# Stop bridge + ngrok
cd C:\Users\<username>\line-dify-bridge
docker compose -f docker-compose.bridge.yaml down

# Stop Dify
cd C:\Users\<username>\dify\docker
docker compose down
```

### Inspect Dify graph
```powershell
# ดึง graph JSON ปัจจุบัน
docker exec docker-db_postgres-1 psql -U postgres -d dify -t -c `
  "SELECT graph FROM workflows WHERE app_id = (SELECT id FROM apps WHERE name='Patient Summary') ORDER BY created_at DESC LIMIT 1;"
```

---

## Roadmap

ดู **[CLAUDE.md → Roadmap section](CLAUDE.md#roadmap)** สำหรับรายละเอียด:

- **Phase 1 (ตอนนี้)** — CRO Assistant (auto-answer + manual queue)
- **Phase 2** — AI Triage รับ/ไม่รับ Report
- **Phase 3** — NotebookLM integration
- **Phase 4** — Unified Inbox (WhatsApp + Email + LINE) + Web dashboard

---

## License

Internal use only — ห้ามเผยแพร่/ใช้นอกโรงพญาบาล BBH โดยไม่ได้รับอณุญาติ

---

## Maintainer

maintainer — student@example.com
