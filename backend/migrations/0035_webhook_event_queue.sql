-- Durable queue for inbound LINE webhook events.
--
-- Pattern: outbox/inbox.  LINE → bridge receives event → persists here
-- BEFORE returning 200 to LINE → background task claims a row and runs the
-- handler. If the bridge crashes mid-handler the row stays in 'pending' (or
-- 'processing' with stale locked_at) and a retry loop picks it up.
--
-- Without this table, BackgroundTasks held the event in process RAM only
-- and a server restart between 200-ack and handler completion silently
-- dropped patient messages.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0035_webhook_event_queue.sql

CREATE TABLE IF NOT EXISTS webhook_event_queue (
    id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    channel             ENUM('main','cro') NOT NULL,
    webhook_event_id    VARCHAR(64)   NULL COMMENT 'LINE event id for dedup',
    event_json          JSON          NOT NULL,
    status              ENUM('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
    attempts            INT UNSIGNED  NOT NULL DEFAULT 0,
    last_error          TEXT          NULL,
    locked_at           DATETIME      NULL,
    processed_at        DATETIME      NULL,
    created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_wq_status_time (status, created_at),
    INDEX idx_wq_locked (locked_at),
    UNIQUE KEY uq_wq_event_id (webhook_event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
