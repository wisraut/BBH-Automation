# BBH Staff Assistant — Dify app source

The Dify app powering web dashboard `/ai`. Lives in PostgreSQL `dify` DB
in production; these files are the version-controlled source.

## Files

| File | Purpose |
|------|---------|
| `system_prompt.md` | LLM system prompt — **edit this** when tuning behavior |
| `workflow_graph.json` | Full Dify workflow graph (start → KB → format → llm → answer) |
| `apply.py` | Idempotent UPSERT into Dify DB from the two files above |

## When to run `apply.py`

- Fresh machine restore where DB backup is missing/corrupt
- You edited `system_prompt.md` and want to push the change live
- You modified `workflow_graph.json` (KB top_k, model, etc.)

```
python dify_patches/bbh_staff_assistant/apply.py
```

After running, restart bridge so it picks up if anything changed:
```
docker compose -f docker-compose.bridge.yaml restart
```

## Stable IDs

These UUIDs are hardcoded in `apply.py` so the upsert is deterministic:

- App ID: `a1b2c3d4-e5f6-7890-abcd-ef1234567890`
- API key: `app-BBHStaffAssistant2026BBH` (set as `DIFY_STAFF_API_KEY` in `.env`)
- Tenant: `fd8066e9-5ed4-4e5b-a102-a56fdb821d26`
- KB dataset: `d3621299-360a-4b04-899a-82899b4e9721` (Library)

## Editing the prompt

1. Edit `system_prompt.md`
2. Run `apply.py`
3. Test in browser at `/ai`
4. Commit both the prompt change and any updated `workflow_graph.json`

The graph file isn't auto-regenerated from Dify UI changes — if you tweak the
flow in the Dify UI, manually export it back:

```
docker exec docker-db_postgres-1 psql -U postgres -d dify -t -c \
  "SELECT graph FROM workflows WHERE id='f6a7b8c9-d0e1-2345-fabc-456789012345';" \
  | docker exec -i docker-api-1 python3 -c "import sys, json; print(json.dumps(json.loads(sys.stdin.read().strip()), ensure_ascii=False, indent=2))" \
  > dify_patches/bbh_staff_assistant/workflow_graph.json
```
