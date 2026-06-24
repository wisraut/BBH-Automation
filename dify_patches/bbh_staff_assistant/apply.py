"""
Recreate / update the Dify "BBH Staff Assistant" app from versioned files:
  - workflow_graph.json  (full Dify advanced-chat workflow graph)
  - system_prompt.md     (LLM system prompt — most-edited piece)

Idempotent: safe to run when the app already exists.
On re-run it overwrites the workflow graph + prompt with the file contents
so this directory is the single source of truth.

Run:
    python dify_patches/bbh_staff_assistant/apply.py

Use when:
  - Restoring on a fresh machine and the DB backup is missing the staff app
  - You edited system_prompt.md and want to push the change to Dify
  - You modified workflow_graph.json (e.g. tweak KB top_k, change model)
"""
import json
import os
import sys
from pathlib import Path

import psycopg2

sys.stdout.reconfigure(encoding="utf-8")

HERE          = Path(__file__).resolve().parent
GRAPH_FILE    = HERE / "workflow_graph.json"
PROMPT_FILE   = HERE / "system_prompt.md"

# Stable UUIDs — must match what was originally inserted so restore is idempotent.
APP_ID        = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
CONFIG_ID     = "b2c3d4e5-f6a7-8901-bcde-f12345678901"
DRAFT_WF_ID   = "e5f6a7b8-c9d0-1234-efab-345678901234"
PUB_WF_ID     = "f6a7b8c9-d0e1-2345-fabc-456789012345"
TOKEN_ID      = "d4e5f6a7-b8c9-0123-defa-234567890123"
API_KEY       = "app-BBHStaffAssistant2026BBH"

# These come from the existing Dify tenant — verified 2026-06-24.
TENANT_ID     = "fd8066e9-5ed4-4e5b-a102-a56fdb821d26"
CREATOR_ID    = "0e9491d9-5b05-4fef-8b64-50257116abbf"
DATASET_ID    = "d3621299-360a-4b04-899a-82899b4e9721"

DEFAULT_FEATURES = {
    "opening_statement": "",
    "suggested_questions": [],
    "suggested_questions_after_answer": {"enabled": False},
    "text_to_speech": {"enabled": False, "voice": "", "language": ""},
    "speech_to_text": {"enabled": False},
    "retriever_resource": {"enabled": True},
    "sensitive_word_avoidance": {"enabled": False},
    "file_upload": {
        "image": {"enabled": False, "number_limits": 3, "transfer_methods": ["local_file", "remote_url"]},
        "enabled": False,
        "allowed_file_types": ["image"],
        "allowed_file_extensions": [".JPG", ".JPEG", ".PNG", ".GIF", ".WEBP", ".SVG"],
        "allowed_file_upload_methods": ["local_file", "remote_url"],
        "number_limits": 3,
    },
}


def db() -> psycopg2.extensions.connection:
    return psycopg2.connect(
        host=os.getenv("DIFY_DB_HOST", "localhost"),
        port=int(os.getenv("DIFY_DB_PORT", 5433)),
        dbname="dify",
        user="postgres",
        password=os.getenv("DIFY_DB_PASSWORD", "difyai123456"),
    )


def load_graph_with_prompt() -> dict:
    graph = json.loads(GRAPH_FILE.read_text(encoding="utf-8"))
    prompt = PROMPT_FILE.read_text(encoding="utf-8").rstrip()
    for node in graph["nodes"]:
        if node["id"] == "llm_staff":
            node["data"]["prompt_template"][0]["text"] = prompt
            break
    else:
        raise RuntimeError("llm_staff node not found in workflow_graph.json")
    return graph


def upsert_app(cur) -> None:
    cur.execute("""
        INSERT INTO apps (
            id, tenant_id, name, mode, icon, icon_background,
            enable_site, enable_api, is_demo, is_public, is_universal, description,
            created_by, updated_by, workflow_id, app_model_config_id
        )
        VALUES (%s, %s, 'BBH Staff Assistant', 'advanced-chat', 'robot', '#D1FAE5',
                false, true, false, false, false, 'CRO internal assistant',
                %s, %s, %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            name                = EXCLUDED.name,
            description         = EXCLUDED.description,
            enable_api          = EXCLUDED.enable_api,
            workflow_id         = EXCLUDED.workflow_id,
            app_model_config_id = EXCLUDED.app_model_config_id,
            updated_by          = EXCLUDED.updated_by
    """, (APP_ID, TENANT_ID, CREATOR_ID, CREATOR_ID, PUB_WF_ID, CONFIG_ID))


def upsert_model_config(cur) -> None:
    cur.execute("""
        INSERT INTO app_model_configs (
            id, app_id, provider, model_id, prompt_type, created_by, updated_by
        )
        VALUES (%s, %s, 'openrouter', 'google/gemini-2.5-flash-lite', 'advanced', %s, %s)
        ON CONFLICT (id) DO UPDATE SET
            provider   = EXCLUDED.provider,
            model_id   = EXCLUDED.model_id,
            updated_by = EXCLUDED.updated_by
    """, (CONFIG_ID, APP_ID, CREATOR_ID, CREATOR_ID))


def upsert_dataset_join(cur) -> None:
    cur.execute(
        "SELECT id FROM app_dataset_joins WHERE app_id=%s AND dataset_id=%s",
        (APP_ID, DATASET_ID),
    )
    if cur.fetchone():
        return
    cur.execute(
        "INSERT INTO app_dataset_joins (id, app_id, dataset_id) VALUES (gen_random_uuid(), %s, %s)",
        (APP_ID, DATASET_ID),
    )


def upsert_api_token(cur) -> None:
    cur.execute("""
        INSERT INTO api_tokens (id, app_id, type, token, tenant_id)
        VALUES (%s, %s, 'app', %s, %s)
        ON CONFLICT (id) DO UPDATE SET token = EXCLUDED.token
    """, (TOKEN_ID, APP_ID, API_KEY, TENANT_ID))


def upsert_workflows(cur, graph: dict) -> None:
    graph_str    = json.dumps(graph, ensure_ascii=False)
    features_str = json.dumps(DEFAULT_FEATURES, ensure_ascii=False)
    now_sql      = "CURRENT_TIMESTAMP(0)"

    for wf_id, version in [(DRAFT_WF_ID, "draft"), (PUB_WF_ID, "published")]:
        cur.execute(f"""
            INSERT INTO workflows (
                id, tenant_id, app_id, type, version, graph, features,
                created_by, updated_at
            )
            VALUES (%s, %s, %s, 'chat', %s, %s, %s, %s, {now_sql})
            ON CONFLICT (id) DO UPDATE SET
                graph      = EXCLUDED.graph,
                features   = EXCLUDED.features,
                updated_at = {now_sql}
        """, (wf_id, TENANT_ID, APP_ID, version, graph_str, features_str, CREATOR_ID))


def main() -> int:
    if not GRAPH_FILE.exists():
        print(f"missing: {GRAPH_FILE}")
        return 2
    if not PROMPT_FILE.exists():
        print(f"missing: {PROMPT_FILE}")
        return 2

    graph = load_graph_with_prompt()
    print(f"Loaded graph: {len(graph['nodes'])} nodes, {len(graph['edges'])} edges")
    print(f"Loaded prompt: {len(PROMPT_FILE.read_text(encoding='utf-8'))} chars")

    with db() as conn:
        with conn.cursor() as cur:
            upsert_app(cur)
            upsert_model_config(cur)
            # Re-link app -> config + workflow in case of fresh insert
            cur.execute(
                "UPDATE apps SET app_model_config_id=%s, workflow_id=%s WHERE id=%s",
                (CONFIG_ID, PUB_WF_ID, APP_ID),
            )
            upsert_dataset_join(cur)
            upsert_api_token(cur)
            upsert_workflows(cur, graph)
        conn.commit()

    print(f"\nDone. App is live at API key: {API_KEY}")
    print(f"Add to .env: DIFY_STAFF_API_KEY={API_KEY}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
