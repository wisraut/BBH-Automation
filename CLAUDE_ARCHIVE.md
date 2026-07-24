# CLAUDE.md - Archived Session Notes (2026-06)

Static history moved out of the root CLAUDE.md so it is NOT auto-loaded into every subagent spawn (saves tokens). Kept for reference.

## Session Note — 2026-06-16 Backend Source Of Truth + Frontend Setup

### What changed

- Made `main` the single source of truth for the repo.
  - Merged backend restructure into `main`.
  - Deleted stale local branch `feature/n8n`.
  - Deleted remote branches `origin/feature/n8n` and `origin/restructure/backend-folder`.
- Consolidated Python FastAPI bridge into `backend/`.
  - `api/`, `core/`, `flows/`, `integrations/`, `jobs/`, `ops/`, `migrations/`, `tests/`, `main.py`, `requirements.txt`, and `Dockerfile` now live under `backend/`.
  - Python imports intentionally remain root-style (`from api...`, `from core...`) because the container runs with `/app` as the backend root.
  - `docker-compose.bridge.yaml` build context now points to `backend/`.
- Refreshed `README.md` to match the current n8n + Dify + Bridge + Bot Ops MySQL architecture.
  - Added current webhook endpoints, internal API endpoints, test commands, n8n SQLite permission fix, and branch policy.
- Added `frontend/` React + TypeScript scaffold.
  - Vite + React + TypeScript build passes.
  - ESLint passes.
  - Tailwind CSS setup fixed inside `frontend/`.
  - Root-level accidental npm files were removed (`package.json`, `package-lock.json`, root `node_modules/`).
  - Frontend package now owns its own `package.json`, `package-lock.json`, and `node_modules/`.

### Verification completed

- Backend restructure:
  - `docker compose -f docker-compose.bridge.yaml build bridge` — PASS
  - `docker compose -f docker-compose.bridge.yaml up -d bridge` — PASS
  - `docker exec hospital-bridge curl -fsS http://localhost:8000/` — PASS
  - Bridge logs checked; no startup error/traceback in tail.
  - `pytest` inside bridge image could not run because `pytest` is not installed in the container.
- Git/branch cleanup:
  - Local branches now only include `main`.
  - Remote branches now only include `origin/main`.
  - `main` is synced with `origin/main` after README updates.
- Frontend:
  - `npm.cmd run build` in `frontend/` — PASS
  - `npm.cmd run lint` in `frontend/` — PASS
  - Tailwind emits a warning that no utility classes are detected yet; expected because current UI is still the Vite starter screen and does not use Tailwind utility classes yet.

### Commits created

- `f517bfa` — `wip: pre-restructure snapshot`
- `b86b93c` — `refactor: consolidate Python backend into backend/ folder`
- `853c3b3` — `docs: update README for backend folder layout`
- `49264e3` — `docs: refresh README for current n8n bridge architecture`
- `41d5238` — `feat: add React TypeScript frontend scaffold`

### Current checkpoint

- Current repo structure is:
  - `backend/` — FastAPI bridge
  - `frontend/` — React + TypeScript web app
  - `n8n/` — n8n workflows and Bot Ops MySQL schema
- Next frontend step should replace the Vite starter UI with an actual clinic operations dashboard.
- Do not recreate root-level backend folders (`api/`, `core/`, `tests/`, root `main.py`, root `Dockerfile`, root `requirements.txt`).

---

## Session Note — 2026-06-08 Repo Refactor + Launcher Hardening

### What changed

- Refactored the bridge repo from root-level runtime scripts into package folders:
  - `api/` — FastAPI routers: health, primary LINE webhook, CRO webhook
  - `core/` — config, DB helper, lifespan/startup reset
  - `integrations/` — LINE, Dify, Google Calendar clients
  - `jobs/` — Gmail/email poller
  - `ops/` — Textual monitor
- Reduced `main.py` to app wiring only: create FastAPI app, include routers, attach lifespan, run uvicorn.
- Kept existing `flows/doctor.py`, `flows/patient.py`, and `flows/cro.py` as business-flow modules to avoid changing behavior.
- Updated imports across flows/tests to use the new package paths.
- Made Google Calendar imports lazy in `integrations/calendar_client.py` so `import main` does not fail when Calendar deps/config are unused.
- Rewrote `start.bat` for more reliable startup:
  - waits for Docker Desktop up to 180s
  - starts Dify stack
  - waits for Dify API and treats 200/401 as ready, retries 502 while Dify warms up
  - validates bridge compose config
  - runs `docker compose ... up --build -d`
  - restarts Dify nginx to refresh Docker DNS/IP-shuffle issue
  - waits for bridge health before opening monitor
  - prints useful log/debug commands on failure
- Updated `docker-compose.bridge.yaml` to use `NGROK_PUBLIC_URL` and `NGROK_DOMAIN` env defaults instead of only hardcoded values.
- Updated `.env.example` with `NGROK_DOMAIN`, Google Calendar ID, and service account path.
- Updated `.gitignore` policy: local Markdown working docs are ignored except `README.md`; credentials/logs/debug artifacts stay ignored.
- Updated README project structure to match the new service layout.
- Adjusted tests to call flow modules directly instead of old private helpers from `main.py`.

### Files/folders involved

- New folders: `api/`, `core/`, `integrations/`, `jobs/`, `ops/`
- Main runtime files moved/rewired:
  - `config.py` -> `core/config.py`
  - `db.py` -> `core/db.py`
  - `line_client.py` -> `integrations/line_client.py`
  - `dify_client.py` -> `integrations/dify_client.py`
  - `calendar_client.py` -> `integrations/calendar_client.py`
  - `email_poller.py` -> `jobs/email_poller.py`
  - `monitor.py` -> `ops/monitor.py`
- Updated: `main.py`, `start.bat`, `docker-compose.bridge.yaml`, `.env.example`, `.gitignore`, `README.md`, `flows/*`, `tests/*`, `requirements.txt`

### Verification completed

- `python -m compileall main.py api core integrations jobs ops flows tests` — PASS
- Import smoke test for all new modules — PASS
- `docker compose -f docker-compose.bridge.yaml --env-file .env config` — PASS
- `python tests\test_pdf_email.py` — PASS
- `python tests\test_patient_flow.py` — PASS, 31/31
- `python tests\test_full_flow.py` — PASS, 28/28
- Bridge container rebuilt and recreated successfully.
- `hospital-bridge` container status: running + healthy.
- `hospital-ngrok` container status: running.
- `curl http://localhost:8000/` returned HTTP 200.
- Dify `/v1/info` returned HTTP 200 with auth header.
- `start.bat` was tested via CMD; fixed a batch label issue by using explicit `goto :bridge_ready` and converting the file to CRLF/ASCII for CMD label compatibility.

### Commit note

- This is ready to commit as a cohesive refactor: repo structure + launcher reliability + test alignment.
- Suggested commit message: `Refactor bridge service structure and stabilize launcher`
- `CLAUDE.md`, `ERRORS.md`, `Setup.md`, and other local Markdown working docs are intentionally ignored/untracked by `.gitignore`; keep this file as a local working note unless the user explicitly wants to track it again.
- `migrations/migrate_bookings_calendar.sql` was still untracked at the end of the session; include it only if the calendar booking migration should be part of the commit.

---

## Session Note — 2026-06-08 CRO KB Dataset + Routing Verification

### What changed

- Converted the CRO popular patient-question attachments into a Dify KB document:
  - `CRO Patient FAQ Intent Dataset - 2026-06-08`
  - Dify document id: `dfc9381a-6e10-4bf9-8c55-b2caeb241282`
  - Parsed 200 questions total from the two non-duplicate attachment sets.
  - Indexed status: `completed`, display status: `available`, tokens: 62,565.
- Added a focused correction KB document for high-risk routing:
  - `CRO Critical Routing Rules Override - 2026-06-08`
  - Dify document id: `8b11e76f-d72c-43a7-92a3-34333891860d`
  - Indexed status: `completed`, display status: `available`.
- Patched Dify node `llm_cro_decide` prompt in both runtime published workflow and draft workflow:
  - published: `8f10dd4d-de2c-44a7-92fa-8a5c05a77224`
  - draft: `e0a912fd-4153-4144-b4fd-ec22ad68ff0e`
  - Added deterministic rules for walk-in questions and personal medical document/status questions.
  - No Python runtime code was changed.

### Verification completed

- Dify 5-step verification before work:
  - `/v1/info` returned `Patient Summary`, `advanced-chat`.
  - `/v1/parameters` confirmed role options: `doctor`, `patient`, `public_inquiry`, retriever resource enabled.
  - Dify DB app id confirmed: `64eb590e-4b27-4b10-aca2-44355e37ff40`.
  - Workflow versions confirmed; latest published workflow is `8f10dd4d-de2c-44a7-92fa-8a5c05a77224`.
  - Graph inspection confirmed public inquiry branch routes to `llm_cro_decide` and strict output prefixes.
- Final CRO bot tests through `/chat-messages`, role `public_inquiry`: PASS 6/6.
  - `วอล์คอินได้เลยป่ะ` -> `AUTO` and includes `ไม่รับ walk-in`.
  - `อยากจองคิวตรวจ Functional Medicine` -> `BOOKING_ASK`.
  - `ส่งรูปผลเลือด ค่าตับ SGOT SGPT สูง อันตรายไหม` -> `ESCALATE:medical`.
  - `แน่นหน้าอก หายใจไม่ออก` -> `ESCALATE:emergency`.
  - `แพ้ยาเพนิซิลลิน กินตัวนี้ได้ไหม` -> `ESCALATE:medical`.
  - `ผลแล็บออกยัง ขอให้ส่งทางอีเมล` -> `ESCALATE:personal_data`.

### Local artifacts

- Dataset markdown generated for review:
  - `C:\Users\wisru\Documents\Codex\2026-06-08\functional-medicine-walk-in-online-line\outputs\cro_patient_faq_intent_dataset_20260608.md`
- Test result JSON:
  - `C:\Users\wisru\Documents\Codex\2026-06-08\functional-medicine-walk-in-online-line\outputs\cro_kb_test_results_20260608.json`
- Temporary helper scripts stayed in the Codex workspace `work/` folder, not in the project repo.

---

## Session Note - 2026-06-09 BBH Bot n8n Phase 1

### What changed

- Created/confirmed separate Dify app `BBH Bot` for the n8n product path, separate from `Patient Summary`.
- Confirmed `BBH Bot` is linked to the same `Library` KB dataset used by `Patient Summary`:
  - dataset id: `d3621299-360a-4b04-899a-82899b4e9721`
- Fixed Dify runtime private-key error by restarting runtime containers only:
  - `docker-api-1`
  - `docker-worker-1`
  - `docker-nginx-1`
- Patched only `BBH Bot` Dify graph, both draft and published workflow, to set Start `role` default to `public_inquiry`.
- Confirmed role branch wiring in `BBH Bot`:
  - `public_inquiry` -> `llm_cro_decide` -> `answer_cro`
  - `patient` -> `if_else_emergency` -> `answer_emergency` or `llm_patient_advisor` -> `answer_patient`
  - `doctor` -> `llm` -> `answer`
- No Patient Summary graph, API key, or runtime code was changed for this Phase 1 patch.

### Verification completed

- `BBH Bot` `/v1/info` returned HTTP 200: name `BBH Bot`, mode `advanced-chat`.
- `BBH Bot` `/v1/parameters` returned HTTP 200.
- Dify DB confirmed `BBH Bot` has `Library` KB linked.
- Dify graph verification confirmed `default=public_inquiry`, 12 nodes, 11 edges, and 3 role branches.
- Public inquiry runtime test through `/v1/chat-messages` passed:
  - input role: `public_inquiry`
  - query: `walk in?`
  - result: HTTP 200, answer starts with `AUTO:` and includes no walk-in acceptance.

### Current checkpoint

- Phase 1 first pass is complete for the public inquiry path.
- Remaining Phase 1 checks before moving to n8n integration:
  - test doctor path with n8n-style report context
  - test patient path with patient question context
  - test emergency path
  - adjust prompts only if any tested path fails

### Phase 1 emergency keyword update - 2026-06-09

- Patched only `BBH Bot` Dify graph, both draft and published workflow.
- Added English emergency keywords to `if_else_emergency`:
  - `chest pain`
  - `cannot breathe`
  - `shortness of breath`
  - `unconscious`
  - `seizure`
  - `heavy bleeding`
- Verification:
  - emergency condition count is now 13 in draft graph.
  - `/v1/chat-messages` with role `patient` and query `Patient question: chest pain and cannot breathe` returned HTTP 200.
  - answer routed to fixed emergency escalation and includes `โทร 1669`.
- No Patient Summary graph or runtime code was changed.

---

## Session Note - 2026-06-10 n8n Variables + Workflow Publish

### Changelog

| Date | File | Change |
|------|------|--------|
| 2026-06-11 | `n8n/.env.n8n`, `n8n/docker-compose.n8n.yaml` | เปลี่ยน tunnel จาก ngrok → Cloudflare Tunnel: `N8N_WEBHOOK_URL=https://n8n.bbh-hospital.com`, ลบ `NGROK_AUTHTOKEN`/`NGROK_DOMAIN`/`N8N_TUNNEL`, ลบ service `ngrok` และ `hospital-ngrok-n8n` ออกจาก compose |
| 2026-06-10 | `n8n/workflows/ops-health-alert.starter.json` | เปลี่ยน `$env` → `$vars` สำหรับ `DIFY_API_KEY`, `DIFY_API_URL`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET` ใน Code nodes ทั้งหมด เพื่อหลีกเลี่ยง `N8N_BLOCK_ENV_ACCESS_IN_NODE` restriction; n8n Variables 4 ตัวสร้างใน DB แล้ว; workflow publish สำเร็จ; แก้ connections LINE #1 Webhook → Parse Events → Is Follow? (เดิมเชื่อมตรงไป Ask Dify + Reply ข้าม Parse/Follow logic) |

---

## Session Note - 2026-06-21 BBH Portal Calendar + Booking Cancellation

### What changed

- Continued Phase 2 Web Dashboard work on branch `DevFolk`.
- Wired Google Calendar into the CRO Calendar page:
  - Added JWT-protected `GET /api/calendar/events`.
  - Added backend router `backend/api/calendar_api.py`.
  - Included the calendar router in `backend/main.py`.
  - Added `calendar_client.list_events(...)` to normalize Google Calendar events for the frontend.
  - Added frontend hook `frontend/src/hooks/useCalendarEvents.ts`.
  - Calendar page now merges booking rows from MySQL with Google Calendar events for the selected month.
- Added CRO appointment cancellation flow:
  - Added backend `POST /api/bookings/{request_uid}/cancel`.
  - Added schema `CancelRequest`.
  - Added service `booking_service.cancel_booking(...)`.
  - Added repository helper `booking_repo.update_cancelled(...)`.
  - Added migration `backend/migrations/0023_booking_calendar_cancelled_status.sql` to allow `calendar_status='cancelled'`.
  - Cancel flow deletes/cancels the Google Calendar event first, then marks the booking row as `status='cancelled'` and `calendar_status='cancelled'`.
- Added frontend cancel UI on the Calendar page:
  - Confirmed/approved appointment cards expand on hover.
  - The expanded area shows a `ยกเลิกนัด` button.
  - The button asks for browser confirmation before calling the cancel API.
  - Successful cancel invalidates bookings and calendar queries so the page refreshes.
- Improved Calendar readability for CRO:
  - Reworded event counters from Google wording to appointment wording such as `1 นัด`.
  - Google Calendar cards now parse BBH event descriptions and show CRO-friendly fields: patient name, time, phone, symptom, and request UID when present.
- Refined modal/layout details from the same session:
  - `Modal.tsx` supports `size="md" | "lg"`, constrained height, scrollable body, and cleaner header/footer behavior.
  - `NewBookingModal.tsx` was compacted so inputs/buttons no longer sink below the viewport.
  - `Topbar.tsx` was reduced in height to give working pages more vertical room.
- Fixed two integration bugs found while testing:
  - `frontend/src/hooks/useAllBookings.ts` now uses page size 100 because backend max `limit` is 100.
  - `booking_repo.get_by_uid(...)` now serializes MySQL `DATE`/`TIME` values to strings before FastAPI response validation.

### Backend files touched

- `backend/api/bookings_api.py`
- `backend/api/calendar_api.py`
- `backend/integrations/calendar_client.py`
- `backend/main.py`
- `backend/repositories/booking_repo.py`
- `backend/schemas/bookings.py`
- `backend/services/booking_service.py`
- `backend/migrations/0023_booking_calendar_cancelled_status.sql`

### Frontend files touched

- `frontend/src/components/Modal.tsx`
- `frontend/src/components/Topbar.tsx`
- `frontend/src/components/bookings/NewBookingModal.tsx`
- `frontend/src/hooks/useAllBookings.ts`
- `frontend/src/hooks/useCalendarEvents.ts`
- `frontend/src/hooks/useCancelBooking.ts`
- `frontend/src/pages/Calendar.tsx`

### Verification completed

- Frontend:
  - `npm.cmd run lint` - PASS
  - `npm.cmd run build` - PASS
  - Playwright hover test - PASS:
    - Login page loaded.
    - CRO login succeeded.
    - Calendar page loaded.
    - Selected day with appointments.
    - Found 4 cancel buttons in DOM.
    - Before hover: action area `opacity=0`, `height=0`.
    - After hover: action area `opacity=1`, `height=34`.
  - Screenshots kept for visual reference:
    - `C:\Users\wisru\AppData\Local\Temp\bbh_calendar_before_hover.png`
    - `C:\Users\wisru\AppData\Local\Temp\bbh_calendar_after_hover.png`
- Backend:
  - Python compile smoke test for changed modules - PASS.
  - Bridge health `http://localhost:8000/` - PASS.
  - API smoke test - PASS:
    - Login CRO - `200`
    - Create test booking - `200`
    - Approve test booking - `200` and created a Google Calendar event.
    - Cancel test booking - `200`.
    - Detail after cancel - `status='cancelled'`, `calendar_status='cancelled'`.
    - Test booking/patient rows were cleaned up.

### Current checkpoint

- The cancellation feature is implemented and locally verified end-to-end.
- Docker Desktop must be running for bridge/database tests.
- `backend/migrations/0023_booking_calendar_cancelled_status.sql` must be applied in any environment before using cancel flow, otherwise MySQL enum will reject `calendar_status='cancelled'`.
- No commit was made for this session.

### Bugfix follow-up - 2026-06-21

Fixed review issues found after the initial Calendar cancellation implementation:

- Fixed `cancel_booking` race/leak risk:
  - Old flow cancelled Google Calendar before DB update.
  - New flow updates DB from `approved` to `cancelled` first.
  - Only the request that wins the DB transition cancels the Google Calendar event.
  - Calendar cleanup is best-effort and logs exceptions instead of rolling DB state back.
- Fixed reject/cancel audit semantics:
  - `update_rejected` and `update_cancelled` no longer write to `approved_by`.
  - Both transitions now write `booking_audit_logs` rows with `actor_type='cro'`, `actor_id`, action, from/to status, and JSON detail reason.
- Added LAN dev CORS support in `backend/main.py`:
  - `allow_origin_regex` now accepts private network origins for office testing (`192.168.*`, `10.*`, `172.16-31.*`).
- Refactored AI endpoint to follow backend layered rules:
  - Added `backend/schemas/ai.py`.
  - Added `backend/services/ai_service.py`.
  - `backend/api/ai.py` is now a thin router that imports schemas + service only.
- Fixed TanStack Query hook guardrail:
  - Removed `select` from `frontend/src/hooks/useCalendarEvents.ts`.
  - Added the required one-line hook comment.
  - `Calendar.tsx` now reads `googleQ.data?.data` explicitly.

Verification for this follow-up:

- Backend compile smoke test - PASS.
- Frontend `npm.cmd run lint` - PASS.
- Frontend `npm.cmd run build` - PASS.
- Bridge rebuilt with Docker - PASS.
- Cancel API smoke test - PASS:
  - Create booking `200`.
  - Approve booking `200` and create Google Calendar event.
  - Cancel booking `200`.
  - Cancel same booking again `409`.
  - DB row reached `status='cancelled'`, `calendar_status='cancelled'`.
  - `booking_audit_logs` contained action `cancelled`, `from_status='approved'`, `to_status='cancelled'`, actor `folkcro@gmail.com`.
  - Test booking/patient rows were cleaned up.
- Reject API smoke test - PASS:
  - Create booking `200`.
  - Reject booking `200`.
  - DB row reached `status='rejected'`, `approved_by=NULL`.
  - `booking_audit_logs` contained action `rejected`, `from_status='pending_approval'`, `to_status='rejected'`, actor `folkcro@gmail.com`.
  - Test booking row was cleaned up.
- LAN CORS preflight from `http://192.168.1.50:5173` - PASS, returned matching `Access-Control-Allow-Origin`.
- `/api/ai/chat` smoke test after refactor - PASS, returned answer + conversation_id.

Remaining minor note:

- `_serialize_booking_row` still lives in `booking_repo.py`; it is a small API serialization helper and can be moved to `utils/` later if repo purity becomes stricter.

