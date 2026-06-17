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
├── docs/                          # project notes and docs
├── outputs/                       # generated outputs
├── tools/                         # local utility scripts
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
| `DIFY_API_KEY` | Dify app API key |
| `BRIDGE_INTERNAL_TOKEN` | Required for Bridge internal APIs via `X-Internal-Token` |
| `N8N_INTERNAL_BASE_URL` | Internal n8n URL used by bridge fallback |
| `BOT_OPS_DB_HOST/PORT/NAME/USER/PASSWORD` | MySQL Bot Ops DB |
| `LINE_CHANNEL_ID/SECRET` | Main LINE bot credentials |
| `LINE_CRO_CHANNEL_ID/SECRET` | CRO LINE bot credentials |
| `GOOGLE_SERVICE_ACCOUNT_FILE` | Google Calendar service account path inside container |

The bridge compose mounts:

```text
C:/Users/wisru/line-dify-bridge/credentials:/app/credentials:ro
```

So the service account file is expected under `credentials/`.

---

## Build And Start

Build and start the FastAPI bridge:

```powershell
docker compose -f docker-compose.bridge.yaml build bridge
docker compose -f docker-compose.bridge.yaml up -d bridge
curl http://localhost:8000/
```

Start n8n and Bot Ops MySQL:

```powershell
cd n8n
docker compose -f docker-compose.n8n.yaml up -d
```

If n8n crashes with SQLite readonly errors, fix the n8n data volume ownership:

```powershell
docker exec --user root hospital-n8n chown -R node:node /home/node/.n8n
docker restart hospital-n8n
```

Start the frontend dev server:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

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

maintainer — student@example.com
