-- AI Takeover: 3-mode toggle + auto-pause + audit trail.
--
-- ai_mode (sticky per-session): auto | copilot | silent — set by CRO or auto-escalation
-- ai_pause_until (transient): sliding window auto-pause after CRO reply (30 min default)
--
-- Effective mode logic (computed at read time, not stored):
--   1. If NOW() outside business hours (09:00-18:00 Asia/Bangkok) → force 'auto'
--   2. Else if ai_pause_until > NOW() → treat as 'silent' (temporary)
--   3. Else → ai_mode
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0044_bot_ai_mode.sql

ALTER TABLE bot_sessions
    ADD COLUMN ai_mode ENUM('auto','copilot','silent') NOT NULL DEFAULT 'auto' AFTER current_state,
    ADD COLUMN ai_pause_until DATETIME NULL AFTER ai_mode,
    ADD COLUMN mode_changed_by BIGINT UNSIGNED NULL AFTER ai_pause_until,
    ADD COLUMN mode_changed_at DATETIME NULL AFTER mode_changed_by,
    ADD INDEX idx_bot_sessions_ai_mode (ai_mode);

CREATE TABLE IF NOT EXISTS bot_mode_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    session_id BIGINT UNSIGNED NOT NULL,
    from_mode ENUM('auto','copilot','silent','paused') NULL,
    to_mode ENUM('auto','copilot','silent','paused') NOT NULL,
    actor_type ENUM('cro','admin','system','keyword','intent','auto_pause','auto_release') NOT NULL,
    actor_id BIGINT UNSIGNED NULL,
    trigger_reason VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_bmev_session (session_id, created_at),
    CONSTRAINT fk_bmev_session
        FOREIGN KEY (session_id) REFERENCES bot_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
