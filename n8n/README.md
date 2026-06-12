# n8n Automation Layer

This branch adds n8n as an optional automation layer around the existing bridge.
It does not replace the FastAPI bridge or Dify.

## Intended ownership

- FastAPI bridge: LINE security, internal API, DB transactions, report locks, LINE push.
- Dify: AI conversation flow, prompts, RAG, Knowledge Base, Gemini calls.
- n8n: Gmail intake experiments, health checks, retries, alerts, manual ops workflows.

## Start n8n

From the repo root:

```powershell
Copy-Item .\n8n\.env.n8n.example .\n8n\.env.n8n
notepad .\n8n\.env.n8n
docker compose --env-file .\n8n\.env.n8n -f .\n8n\docker-compose.n8n.yaml up -d
```

Open:

```text
http://localhost:5678
```

## Required .env values

Add these to `n8n/.env.n8n` before starting n8n:

```text
N8N_ENCRYPTION_KEY=<long-random-string>
N8N_BASIC_AUTH_PASSWORD=<strong-password>
BRIDGE_INTERNAL_TOKEN=<shared-token-for-n8n-to-bridge>
```

Optional:

```text
N8N_HOST=localhost
N8N_PORT=5678
N8N_PROTOCOL=http
N8N_EDITOR_BASE_URL=http://localhost:5678
N8N_WEBHOOK_URL=http://localhost:5678
N8N_BASIC_AUTH_USER=admin
N8N_SECURE_COOKIE=false
BRIDGE_INTERNAL_URL=http://hospital-bridge:8000
```

## Workflow starters

The JSON files in `n8n/workflows/` are starter blueprints. Import them into n8n,
then wire credentials and endpoints before activating.

- `gmail-report-intake.starter.json`: Gmail to bridge report intake experiment.
- `ops-health-alert.starter.json`: scheduled bridge/Dify health check.
- `manual-review-queue.starter.json`: webhook entry point for future manual review queue.

## Safety rules

- Keep workflows inactive until credentials, auth headers, and test data are configured.
- Do not point LINE production webhooks directly to n8n until signature verification is implemented and tested.
- Keep `email_poller.py` enabled until n8n intake has been tested in parallel and report rows match expected DB behavior.
- n8n should call internal bridge endpoints with `X-Internal-Token`; the bridge should validate it before accepting automation requests.
