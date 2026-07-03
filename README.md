# LINE-Dify Hospital Bridge

ระบบ LINE chatbot สำหรับ **โรงพยาบาล Better Being Hospital (BBH)** สาย Functional Medicine โดยใช้ n8n เป็นตัว orchestrate, **own-RAG (Python) เป็น AI engine**, และ FastAPI bridge เป็น internal API สำหรับ session, booking, LINE fallback, Google Calendar และงาน background ของโรงพยาบาล

> **หมายเหตุ (2026-07-03): เลิกใช้ Dify แล้ว** — AI/RAG ย้ายมาเป็น Python ของเราเองใน `backend/rag/` (BGE-M3 embedding + MySQL vector store + Gemini via OpenRouter) สลับกลับ Dify ได้ด้วย `USE_OWN_RAG=false` ชื่อ repo ยังเป็น "LINE-Dify Hospital Bridge" ตามประวัติ

ตอนนี้ `main` เป็น source of truth ของ repo นี้ และ Python backend ทั้งหมดอยู่ใน `backend/`

---

## ระบบนี้คืออะไร (ฉบับเข้าใจง่าย — ไม่ต้องรู้ tech)

ระบบนี้คือ **"ผู้ช่วยอัจฉริยะของโรงพยาบาล"** ที่ทำงานผ่าน LINE

**มันทำอะไรให้บ้าง**

- คนไข้ทัก LINE มาถาม (เปิดกี่โมง ราคาเท่าไหร่ จองคิวยังไง) → ระบบตอบเองอัตโนมัติ
- คนไข้อยากจองคิว → ระบบถามข้อมูลทีละอย่าง เก็บให้ครบ แล้วส่งให้เจ้าหน้าที่กดยืนยัน
- เจ้าหน้าที่มีหน้าเว็บไว้ดูคิว จัดการข้อมูลคนไข้ และเข้ามาคุยกับคนไข้ต่อเองได้

**เปรียบเหมือนทีมงานในโรงพยาบาล**

| ส่วนของระบบ | เปรียบเหมือน |
|---|---|
| LINE | โทรศัพท์หน้าเคาน์เตอร์ (ช่องทางที่คนไข้ทักเข้ามา) |
| n8n | พนักงานรับสาย (รับข้อความ ส่งต่อ ตอบกลับ) |
| AI ของเรา (own-RAG) | ผู้ช่วยที่อ่าน "คู่มือ FAQ" ของโรงพยาบาลแล้วเรียบเรียงคำตอบ |
| ตัวแปลง (BGE-M3) | ล่ามที่ช่วยหาว่าคำถามตรงกับหน้าไหนในคู่มือ แม้พิมพ์คนละคำ |
| ฐานข้อมูล (MySQL) | ตู้เก็บเอกสาร (คิว ประวัติแชท คู่มือ FAQ) |
| หน้าเว็บ (dashboard) | แผงควบคุมของเจ้าหน้าที่ |

**พอคนไข้ทักมา 1 ข้อความ เกิดอะไรขึ้น**

1. คนไข้พิมพ์ใน LINE
2. พนักงานรับสาย (n8n) รับมา ส่งต่อให้ผู้ช่วย AI
3. AI เปิดคู่มือ FAQ หาหน้าที่ตรงคำถาม แล้วเรียบเรียงเป็นคำตอบสุภาพ
4. ตอบกลับไปใน LINE ให้คนไข้

**เรื่องความปลอดภัย (สำคัญที่สุด)**

ถ้าคนไข้พิมพ์อาการฉุกเฉิน เช่น เจ็บหน้าอก หายใจไม่ออก หมดสติ ชัก — ระบบจะ **บอกให้โทร 1669 ทันที** ไม่เดา ไม่เสี่ยง (มีตัวดักคำฉุกเฉินแบบตายตัว ทำงานก่อน AI เสมอ)

**เปลี่ยนอะไรล่าสุด (2026-07-03)**

เมื่อก่อนใช้ AI สำเร็จรูปที่เช่าเขามา (ชื่อ Dify) ซึ่งเป็น "กล่องดำ" แก้เองไม่ได้และพังบ่อย → ตอนนี้เปลี่ยนมาใช้ **AI ที่เราสร้างเอง** คุมได้ 100% แก้ปรับได้ทุกอย่าง และเสถียรกว่า

---

> ส่วนด้านล่างนี้เป็นรายละเอียดเชิงเทคนิคสำหรับ developer

## Current Architecture

```text
LINE Main Bot
   |
   | webhook: /webhook/bbh-line-main
   v
hospital-n8n
   |-- reads session + USE_OWN_RAG flag from Bridge
   |-- calls Bridge for the AI answer, then replies/pushes via LINE
   |
   +--> hospital-bridge (FastAPI, http://hospital-bridge:8000)
   |       POST /internal/rag/answer  → own-RAG pipeline:
   |         1. safety gate (emergency keywords → ESCALATE:emergency + 1669)
   |         2. embed question (BGE-M3)
   |         3. search kb_chunks (MySQL, brute-force cosine, top-5)
   |         4. build prompt (AUTO/CONSULT/BOOKING/ESCALATE:class)
   |         5. Gemini via OpenRouter → parse route prefix
   |       (USE_OWN_RAG=false → falls back to Dify /chat-messages)
   |
   +--> bbh-embedder (Infinity + BGE-M3, http://bbh-embedder:7997)
   |
   +--> hospital-bot-ops-db (MySQL: bot_sessions, booking_requests, kb_chunks)

LINE CRO Bot
   |
   | webhook: /webhook/bbh-line-cro
   v
hospital-n8n
   |-- tracks CRO users
   |-- handles CONFIRM / REJECT postbacks
   |-- calls Bridge booking APIs
   |-- checks/creates Google Calendar events
   |-- notifies patient/CRO through LINE
```

Core containers:

| Container | Purpose |
|---|---|
| `hospital-bridge` | FastAPI bridge: own-RAG (`/internal/rag/answer`), session/booking APIs, LINE fallback webhooks, Calendar |
| `hospital-n8n` | LINE workflow orchestration and LINE reply/push logic |
| `hospital-bot-ops-db` | MySQL: `bot_sessions`, `booking_requests`, `kb_chunks` (RAG FAQ vectors) |
| `bbh-embedder` | Infinity server running BGE-M3 embedding on CPU (replaces Dify's Ollama) |
| `docker-db_postgres-1` | legacy `hospital_db` (Dify's Postgres — kept until hospital_db is migrated to MySQL) |

Dify app containers (`docker-api-1`, `docker-nginx-1`, `docker-weaviate-1`, workers, …) were **stopped 2026-07-03** when own-RAG went live. They can be restarted for rollback (`docker start …` + `USE_OWN_RAG=false`).

All services join Docker network `docker_default`.

---

## Main Features

- LINE Main Bot receives public inquiry and booking conversations.
- **Own-RAG** (`backend/rag/`) returns routing prefixes such as `AUTO:`,
  `BOOKING_ASK:`, `BOOKING_DONE:`, `CONSULT:`, and `ESCALATE:*` — grounded in
  the FAQ retrieved from `kb_chunks`, with a deterministic emergency safety
  gate that forces `ESCALATE:emergency` before the LLM ever runs.
- n8n strips/handles AI prefixes and sends LINE replies.
- Bridge stores LINE session state and booking requests in Bot Ops MySQL.
- CRO LINE Bot tracks staff users and handles booking approval/rejection.
- Confirmed bookings can create Google Calendar events and notify patients.
- Emergency and personal-data requests are escalated instead of answered directly.
- Web dashboard (`frontend/`) for CRO/Doctor/Admin: Bookings inbox, Patients
  (+ per-patient LINE chat with 3-mode AI takeover: Auto/Copilot/Silent),
  Reports, Calendar, AI chat (`/ai`), Account.
- The AI pipeline (embed → retrieve → generate) is plain Python, so prompts and
  routing live in `backend/rag/prompts.py` — edit + `git commit`, no black box.
- Integration test suite covers the LINE/n8n/Bridge paths end to end.

---

## Repository Layout

```text
line-dify-bridge/
├── backend/                       # Python FastAPI bridge service
│   ├── Dockerfile                 # bridge image, build context is ./backend
│   ├── main.py                    # FastAPI app wiring
│   ├── requirements.txt
│   ├── api/                       # FastAPI routers
│   │   ├── booking.py             # internal booking API
│   │   ├── cro_webhook.py         # CRO LINE fallback webhook
│   │   ├── health.py              # root/health endpoints + internal token guard
│   │   ├── line_webhook.py        # main LINE fallback webhook
│   │   ├── rag_api.py             # POST /internal/rag/answer (own-RAG entrypoint)
│   │   └── session.py             # internal session API (+ use_own_rag flag)
│   ├── rag/                       # own-RAG engine (replaces Dify)
│   │   ├── embedder.py            # HTTP client to bbh-embedder (BGE-M3)
│   │   ├── vector_store.py        # kb_chunks on MySQL + brute-force cosine
│   │   ├── ingester.py            # FAQ markdown → chunks → embed → store
│   │   ├── memory.py              # recent turns from booking_messages
│   │   ├── llm.py                 # Gemini via OpenRouter
│   │   ├── prompts.py             # BBH routing prompt + prefix parser
│   │   ├── safety.py              # deterministic emergency gate
│   │   └── service.py             # answer() — the whole pipeline
│   ├── core/                      # config, DB helpers, lifespan startup
│   ├── flows/                     # doctor / patient / CRO fallback logic
│   ├── integrations/              # LINE, Google Calendar clients (Dify legacy)
│   ├── jobs/                      # background jobs, including email poller
│   ├── migrations/                # DB migration SQL
│   ├── ops/                       # operational helpers
│   └── tests/                     # backend and integration tests
│
├── n8n/                           # n8n service, workflows, MySQL init schema
│   ├── docker-compose.n8n.yaml
│   ├── mysql/init/
│   └── workflows/
│
├── frontend/                      # React + TypeScript web app (Vite)
│   ├── src/
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── credentials/                   # local credentials mounted into backend container
├── dify_patches/                  # Dify prompt/workflow patch utilities
│   └── bbh_staff_assistant/       # versioned source of the Staff Assistant Dify app
├── docs/                          # project notes and docs
├── outputs/                       # generated outputs
├── tools/                         # backup.py, restore.py, ask_patient.py
├── backups/                       # backup tar.gz files (gitignored)
├── work/                          # temporary/manual debugging scripts and artifacts
├── _legacy/                       # archived pre-pivot code (do not import)
├── docker-compose.bridge.yaml     # bridge compose, build context = ./backend
├── .env.example                   # environment template
└── README.md
```

Important convention: Python imports still use root-style module names such as `from api...` and `from core...`. This works because the bridge container runs with `/app` as the backend root.

---

## Environment

The bridge and n8n read configuration from `.env`.

Important variables:

| Variable | Purpose |
|---|---|
| `DIFY_API_URL` | Dify API URL used by bridge/n8n |
| `DIFY_API_KEY` | Dify **Patient Summary** app API key (LINE bot) |
| `DIFY_STAFF_API_KEY` | Dify **BBH Staff Assistant** app API key (web `/ai`) |
| `BRIDGE_INTERNAL_TOKEN` | Required for Bridge internal APIs via `X-Internal-Token` |
| `N8N_INTERNAL_BASE_URL` | Internal n8n URL used by bridge fallback |
| `BOT_OPS_DB_HOST/PORT/NAME/USER/PASSWORD` | MySQL Bot Ops DB |
| `LINE_CHANNEL_ID/SECRET` | Main LINE bot credentials |
| `LINE_CRO_CHANNEL_ID/SECRET` | CRO LINE bot credentials |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Google Calendar service account path inside container |

The bridge compose mounts:

```text
./credentials:/app/credentials:ro
```

So the service account file is expected under `credentials/`.

---

## Daily Operation

`start.bat` is the unified 7-step launcher (Docker → Dify → nginx
restart → Bot Ops MySQL → Bridge → n8n → Frontend). `stop.bat` tears
everything down in reverse order. Cloudflared runs as a Windows
service and is not touched.

Manual start of individual stacks:

```powershell
# bridge only
docker compose -f docker-compose.bridge.yaml up -d --build

# n8n + Bot Ops MySQL only
cd n8n
docker compose -f docker-compose.n8n.yaml up -d

# frontend dev server
cd frontend
npm.cmd install
npm.cmd run dev
```

If n8n crashes with SQLite readonly errors, fix the n8n data volume
ownership:

```powershell
docker exec --user root hospital-n8n chown -R node:node /home/node/.n8n
docker restart hospital-n8n
```

---

## Backup And Restore

The entire system state lives outside git: Postgres `dify` (apps, KB
metadata, workflows), MySQL `bbh_bot_ops` (bookings, patients,
sessions, users), Docker volumes (`docker_dify_app_storage`,
`n8n_hospital_n8n_data`), the Weaviate bind-mount, `.env` files, and
the cloudflared tunnel token. Lose any of these and the system is not
recoverable from git alone.

Run a full backup before risky changes or before leaving the machine
unattended:

```powershell
python tools\backup.py
```

This produces a single timestamped archive in `backups/`:

```text
backups\bbh-backup-YYYYMMDD-HHMMSS.tar.gz   (~130 MB)
```

Upload the archive to off-machine storage (e.g. Google Drive). The
archive itself is gitignored on purpose — only the scripts are
tracked.

Restore on a fresh machine:

```powershell
python tools\restore.py backups\bbh-backup-YYYYMMDD-HHMMSS.tar.gz
```

The script will prompt for confirmation before overwriting databases,
volumes, and env files. After restore it prints follow-up commands
(cloudflared service install + container restart).

If only the Dify `BBH Staff Assistant` app is missing (DB backup lost
or corrupt for that app only), re-create it from the versioned
sources:

```powershell
python dify_patches\bbh_staff_assistant\apply.py
```

This is idempotent and reads `system_prompt.md` +
`workflow_graph.json` from the same directory.

---

## Setup On A Fresh Machine

Assuming you have the latest `bbh-backup-*.tar.gz` from off-machine
storage.

1. Install prerequisites: Docker Desktop + WSL2, Git, Python 3.12+,
   Node.js 20+, cloudflared.
2. Clone repositories:

   ```powershell
   git clone https://github.com/wisraut/BBH-Automation.git line-dify-bridge
   git clone https://github.com/langgenius/dify.git
   ```

3. Start Dify so its Postgres and storage volume exist:

   ```powershell
   cd dify\docker
   docker compose up -d
   ```

   Wait for `docker-db_postgres-1` and `docker-api-1` to be healthy.

4. Start the Bot Ops MySQL container (so the restore has a target):

   ```powershell
   cd ..\..\line-dify-bridge\n8n
   docker compose -f docker-compose.n8n.yaml up -d hospital-bot-ops-db
   ```

5. Run the restore against the backup archive:

   ```powershell
   cd ..
   python tools\restore.py <path to bbh-backup-*.tar.gz>
   ```

6. Re-install the cloudflared Windows service with the saved tunnel
   token (printed by `restore.py`).
7. Start the rest of the stack via `start.bat`.
8. Smoke test:

   ```powershell
   curl http://localhost:8000/
   curl http://localhost/v1/info -H "Authorization: Bearer %DIFY_API_KEY%"
   ```

If you have no backup, fall back to seeding from migrations + creating
Dify apps manually (LINE Patient Summary in the Dify UI, then
`dify_patches\bbh_staff_assistant\apply.py` for the staff app).

---

## Webhook Endpoints

n8n public webhook endpoints:

```text
POST http://hospital-n8n:5678/webhook/bbh-line-main
POST http://hospital-n8n:5678/webhook/bbh-line-cro
```

Bridge fallback webhook endpoints:

```text
POST http://localhost:8000/webhook
POST http://localhost:8000/webhook/cro
```

Bridge internal API endpoints:

```text
GET  /internal/session/{channel}/{user_id}
POST /internal/session/{channel}/{user_id}
POST /internal/booking
GET  /internal/booking/{request_uid}
POST /internal/booking/{request_uid}/approve
POST /internal/booking/{request_uid}/reject
```

Internal API calls require:

```text
X-Internal-Token: <BRIDGE_INTERNAL_TOKEN>
```

---

## Tests

Run the LINE feature integration test inside `hospital-bridge` to avoid Windows Thai/UTF-8 issues and to reach Docker internal services:

```powershell
docker cp backend\tests\test_line_features.py hospital-bridge:/tmp/test_line_features.py
docker exec hospital-bridge python3 /tmp/test_line_features.py
```

Expected output format:

```text
[PASS] T01 - ...
[FAIL] T13 - ...
Results: X/14 passed
Cleanup: removed N sessions, M bookings
```

Backend unit/integration tests live under `backend/tests/`. If `pytest` is not installed in the image, install it in the backend development environment before running:

```powershell
cd backend
python -m pytest tests/ -x
```

---

## Logs And Diagnostics

```powershell
docker logs hospital-bridge --tail=100
docker logs hospital-n8n --tail=100
docker logs hospital-bot-ops-db --tail=100
docker logs docker-api-1 --tail=100
```

Smoke test bridge health:

```powershell
docker exec hospital-bridge curl -fsS http://localhost:8000/
```

Check n8n status:

```powershell
docker ps --filter name=hospital-n8n
docker logs --tail 80 hospital-n8n
```

---

## Branch Policy

`main` is the single source of truth.

Rules:

- Start new work from `main`.
- Do not recreate old root-level backend folders such as `api/`, `core/`, `tests/`, or root `main.py`.
- Backend code belongs in `backend/`.
- n8n workflows and Bot Ops DB schema belong in `n8n/`.
- Temporary debugging artifacts belong in `work/` and should be reviewed before committing.

Recommended flow:

```powershell
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

---

## Current Known Notes

- `hospital-bridge` builds from `backend/`.
- n8n owns LINE reply/push orchestration for the main workflows.
- Bridge is still responsible for internal APIs and fallback LINE webhook handling.
- Calendar verification depends on valid Google service account credentials and workflow execution in n8n.
- The LINE integration test is the best smoke test for end-to-end booking/CRO behavior.

### Own-RAG status (2026-07-03)

- **Live**: `USE_OWN_RAG=true`, embedder = **BGE-M3** via `bbh-embedder` (Infinity, CPU).
- Dify app containers are **stopped** (own-RAG replaces them); `docker-db_postgres-1`
  is kept only for legacy `hospital_db`.
- FAQ knowledge base lives in MySQL `kb_chunks` — rebuild with
  `python -m rag.ingester /app/docs/BBH_MAIN_BOT_FAQ.md` inside the bridge after editing the FAQ.
- Swapping the embedding model is config-only: set `EMBED_MODEL`, recreate
  `bbh-embedder` with the matching `--model-id`, and re-ingest (dimension may change).
- Open follow-ups: migrate `hospital_db` (Postgres) → MySQL then drop Postgres;
  add a retrieval score threshold + reranker (Phase 2); fully purge stopped Dify
  once confident; re-open the public web (Cloudflare WAF rule currently blocks it for dev).

---

## License

Internal use only. Do not publish or use outside the BBH hospital project without permission.

---

## Maintainer

Wisarut — wisrutyaemprayur@gmail.com
