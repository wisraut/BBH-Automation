# LINE-Dify Hospital Bridge

ระบบ LINE chatbot สำหรับคลินิก Functional Medicine โดยใช้ n8n เป็นตัว orchestrate, Dify เป็น AI/RAG engine, และ FastAPI bridge เป็น internal API สำหรับ session, booking, LINE fallback, Google Calendar และงาน background ของคลินิก

ตอนนี้ `main` เป็น source of truth ของ repo นี้ และ Python backend ทั้งหมดอยู่ใน `backend/`

---

## Current Architecture

```text
LINE Main Bot
   |
   | webhook: /webhook/bbh-line-main
   v
hospital-n8n
   |-- calls Dify advanced-chat for public inquiry / booking / escalation
   |-- calls Bridge internal APIs for sessions and booking requests
   |-- replies or pushes via LINE Messaging API
   |
   +--> Dify API (http://api:5001/v1 or http://nginx/v1)
   |
   +--> hospital-bridge (FastAPI, http://hospital-bridge:8000)
   |
   +--> hospital-bot-ops-db (MySQL)

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
| `hospital-bridge` | FastAPI bridge, internal session/booking APIs, LINE fallback webhooks, Calendar integration |
| `hospital-n8n` | LINE workflow orchestration and LINE reply/push logic |
| `hospital-bot-ops-db` | MySQL database for `bot_sessions` and `booking_requests` |
| `docker-api-1` / `docker-nginx-1` | Dify API and reverse proxy |
| `docker-db_postgres-1` | Dify PostgreSQL and legacy hospital DB data |

All services join Docker network `docker_default`.

---

## Main Features

- LINE Main Bot receives public inquiry and booking conversations.
- Dify returns routing prefixes such as `AUTO:`, `BOOKING_ASK:`, `BOOKING_DONE:`, `CONSULT:`, and `ESCALATE:*`.
- n8n strips/handles AI prefixes and sends LINE replies.
- Bridge stores LINE session state and booking requests in Bot Ops MySQL.
- CRO LINE Bot tracks staff users and handles booking approval/rejection.
- Confirmed bookings can create Google Calendar events and notify patients.
- Emergency and personal-data requests are escalated instead of answered directly.
- Web dashboard (`frontend/`) for CRO/Doctor/Admin: Bookings inbox, Patients,
  Reports, Calendar, AI chat (`/ai`), Account.
- Two separate Dify apps power the AI:
  - **Patient Summary** (`DIFY_API_KEY`) — LINE customer routing classifier
  - **BBH Staff Assistant** (`DIFY_STAFF_API_KEY`) — free-form CRO assistant
    on the web `/ai` page, source of truth in
    `dify_patches/bbh_staff_assistant/`
- Integration test suite covers the LINE/n8n/Dify/Bridge paths end to end.

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
│   │   └── session.py             # internal Dify session API
│   ├── core/                      # config, DB helpers, lifespan startup
│   ├── flows/                     # doctor / patient / CRO fallback logic
│   ├── integrations/              # Dify, LINE, Google Calendar clients
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

---

## License

Internal use only. Do not publish or use outside the BBH hospital project without permission.

---

## Maintainer

Wisarut — wisrutyaemprayur@gmail.com
