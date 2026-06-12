-- Create an isolated Dify app for n8n without touching Patient Summary.
-- Idempotent: re-runs keep the existing BBH Bot app and only create missing links/key.

DO $$
DECLARE
    src_app_id uuid := '64eb590e-4b27-4b10-aca2-44355e37ff40';
    library_dataset_id uuid := 'd3621299-360a-4b04-899a-82899b4e9721';
    src_published workflowS%ROWTYPE;
    src_draft workflows%ROWTYPE;
    src_app apps%ROWTYPE;
    dst_app_id uuid;
    dst_published_id uuid;
    dst_draft_id uuid;
    dst_token text;
BEGIN
    SELECT * INTO src_app FROM apps WHERE id = src_app_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source app Patient Summary not found: %', src_app_id;
    END IF;

    SELECT * INTO src_published
    FROM workflows
    WHERE app_id = src_app_id AND version <> 'draft'
    ORDER BY created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source published workflow not found for app %', src_app_id;
    END IF;

    SELECT * INTO src_draft
    FROM workflows
    WHERE app_id = src_app_id AND version = 'draft'
    ORDER BY created_at DESC
    LIMIT 1;

    SELECT id INTO dst_app_id FROM apps WHERE name = 'BBH Bot' LIMIT 1;

    IF dst_app_id IS NULL THEN
        dst_app_id := uuid_generate_v4();
        INSERT INTO apps (
            id, tenant_id, name, mode, icon, icon_background, app_model_config_id,
            status, enable_site, enable_api, api_rpm, api_rph, is_demo, is_public,
            created_at, updated_at, is_universal, workflow_id, description, tracing,
            max_active_requests, icon_type, created_by, updated_by, use_icon_as_answer_icon
        )
        VALUES (
            dst_app_id, src_app.tenant_id, 'BBH Bot', src_app.mode,
            src_app.icon, src_app.icon_background, src_app.app_model_config_id,
            src_app.status, src_app.enable_site, true, src_app.api_rpm, src_app.api_rph,
            false, false, now(), now(), src_app.is_universal, NULL,
            'n8n product app cloned from Patient Summary; uses Library KB.',
            src_app.tracing, src_app.max_active_requests, src_app.icon_type,
            src_app.created_by, src_app.updated_by, src_app.use_icon_as_answer_icon
        );
    END IF;

    SELECT id INTO dst_published_id
    FROM workflows
    WHERE app_id = dst_app_id AND version <> 'draft'
    ORDER BY created_at DESC
    LIMIT 1;

    IF dst_published_id IS NULL THEN
        dst_published_id := uuid_generate_v4();
        INSERT INTO workflows (
            id, tenant_id, app_id, type, version, graph, features, created_by,
            created_at, updated_by, updated_at, environment_variables,
            conversation_variables, marked_name, marked_comment, rag_pipeline_variables
        )
        VALUES (
            dst_published_id, src_published.tenant_id, dst_app_id, src_published.type,
            now()::text, src_published.graph, src_published.features,
            src_published.created_by, now(), src_published.updated_by, now(),
            src_published.environment_variables, src_published.conversation_variables,
            'BBH Bot initial clone', 'Created for n8n BBH product',
            src_published.rag_pipeline_variables
        );
    END IF;

    IF src_draft.id IS NOT NULL THEN
        SELECT id INTO dst_draft_id
        FROM workflows
        WHERE app_id = dst_app_id AND version = 'draft'
        LIMIT 1;

        IF dst_draft_id IS NULL THEN
            dst_draft_id := uuid_generate_v4();
            INSERT INTO workflows (
                id, tenant_id, app_id, type, version, graph, features, created_by,
                created_at, updated_by, updated_at, environment_variables,
                conversation_variables, marked_name, marked_comment, rag_pipeline_variables
            )
            VALUES (
                dst_draft_id, src_draft.tenant_id, dst_app_id, src_draft.type,
                'draft', src_draft.graph, src_draft.features,
                src_draft.created_by, now(), src_draft.updated_by, now(),
                src_draft.environment_variables, src_draft.conversation_variables,
                'BBH Bot draft clone', 'Created for n8n BBH product',
                src_draft.rag_pipeline_variables
            );
        END IF;
    END IF;

    UPDATE apps
    SET workflow_id = dst_published_id,
        enable_api = true,
        updated_at = now()
    WHERE id = dst_app_id;

    INSERT INTO app_dataset_joins (id, app_id, dataset_id, created_at)
    SELECT uuid_generate_v4(), dst_app_id, library_dataset_id, now()
    WHERE NOT EXISTS (
        SELECT 1 FROM app_dataset_joins
        WHERE app_id = dst_app_id AND dataset_id = library_dataset_id
    );

    SELECT token INTO dst_token
    FROM api_tokens
    WHERE app_id = dst_app_id AND type = 'app'
    ORDER BY created_at DESC
    LIMIT 1;

    IF dst_token IS NULL THEN
        dst_token := 'app-' || substr(replace(uuid_generate_v4()::text, '-', ''), 1, 24);
        INSERT INTO api_tokens (id, app_id, type, token, created_at, tenant_id)
        VALUES (uuid_generate_v4(), dst_app_id, 'app', dst_token, now(), src_app.tenant_id);
    END IF;

    RAISE NOTICE 'BBH Bot app_id=% published_workflow_id=% api_key=<created-or-existing>', dst_app_id, dst_published_id;
END $$;
