-- Admin dashboard "Action Required" backing tables.
--
-- Design (see CLAUDE.md decision 2026-06-25):
--   admin_alert_rules    â€” rule definitions + thresholds + ack policy
--   admin_alerts         â€” open/acked alert instances (1 row per subject)
--   admin_alert_events   â€” audit trail of every alert state transition
--   line_push_log        â€” required for rule 'failed_line_push' (was not logged before)
--
-- All FK target users.id (INT UNSIGNED) within bbh_bot_ops.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0030_admin_alert_tables.sql

-- =====================================================================
-- 1. admin_alert_rules
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_alert_rules (
    rule_key         VARCHAR(64)   PRIMARY KEY,
    display_name     VARCHAR(255)  NOT NULL,
    description      TEXT          NULL,
    category         ENUM('operations','security','integration','data_quality') NOT NULL,
    severity         ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
    enabled          TINYINT(1)    NOT NULL DEFAULT 1,
    threshold_json   JSON          NOT NULL COMMENT 'e.g. {"minutes":5} or {"hours":24}',
    evaluator        VARCHAR(64)   NOT NULL COMMENT 'backend function name, e.g. eval_stuck_reports',
    ack_policy       ENUM('auto_close','manual','sticky') NOT NULL DEFAULT 'auto_close'
                     COMMENT 'auto_close=clears when source state OK; manual=admin must ack; sticky=ack expires (re-opens)',
    recheck_seconds  INT UNSIGNED  NOT NULL DEFAULT 60,
    notify_channels  JSON          NULL COMMENT 'e.g. ["email","line"]',
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_alert_rules_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 2. admin_alerts
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_alerts (
    alert_id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    rule_key         VARCHAR(64)   NOT NULL,
    subject_type     VARCHAR(32)   NOT NULL
                     COMMENT 'report|booking|patient|user|integration|push',
    subject_id       VARCHAR(64)   NOT NULL
                     COMMENT 'RPT-..., BK-..., HN-..., users.id, channel name, push_id',
    status           ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
    severity         ENUM('info','warning','critical') NOT NULL,
    title            VARCHAR(255)  NOT NULL,
    detail_json      JSON          NULL,
    first_seen_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
                                    ON UPDATE CURRENT_TIMESTAMP,
    ack_by           INT UNSIGNED  NULL COMMENT 'users.id of admin who acknowledged',
    ack_at           DATETIME      NULL,
    ack_note         TEXT          NULL,
    ack_expires_at   DATETIME      NULL COMMENT 'sticky policy: when ack expires, alert re-opens',
    resolved_at      DATETIME      NULL,
    resolved_reason  VARCHAR(64)   NULL
                     COMMENT 'auto_state_cleared|manual_close|rule_disabled',
    active_subject_key VARCHAR(64)
                     GENERATED ALWAYS AS (
                         CASE
                           WHEN status IN ('open', 'acknowledged') THEN subject_id
                           ELSE NULL
                         END
                     ) STORED
                     COMMENT 'NULL for resolved rows so historical repeats are allowed',

    -- Prevent duplicate active alerts per (rule, subject), while allowing
    -- multiple resolved history rows for the same subject.
    UNIQUE KEY uq_active_alert (rule_key, subject_type, active_subject_key),

    INDEX idx_alerts_status_severity (status, severity),
    INDEX idx_alerts_rule_status (rule_key, status),
    INDEX idx_alerts_last_seen (last_seen_at),
    INDEX idx_alerts_ack_by (ack_by),

    CONSTRAINT fk_alerts_rule FOREIGN KEY (rule_key)
        REFERENCES admin_alert_rules(rule_key) ON DELETE RESTRICT,
    CONSTRAINT fk_alerts_ack_user FOREIGN KEY (ack_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 3. admin_alert_events  (audit trail)
-- =====================================================================
CREATE TABLE IF NOT EXISTS admin_alert_events (
    event_id      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    alert_id      BIGINT UNSIGNED NOT NULL,
    event_type    ENUM('opened','re_triggered','acknowledged','snoozed','resolved','escalated')
                  NOT NULL,
    actor_type    ENUM('system','admin') NOT NULL,
    actor_id      INT UNSIGNED  NULL
                  COMMENT 'users.id when actor_type=admin; NULL when system',
    from_status   VARCHAR(32)   NULL,
    to_status     VARCHAR(32)   NULL,
    note          TEXT          NULL,
    detail_json   JSON          NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_alert_events_alert (alert_id, created_at),
    INDEX idx_alert_events_actor (actor_id, created_at),

    CONSTRAINT fk_alert_events_alert FOREIGN KEY (alert_id)
        REFERENCES admin_alerts(alert_id) ON DELETE CASCADE,
    CONSTRAINT fk_alert_events_actor FOREIGN KEY (actor_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================================================
-- 4. line_push_log  (source for rule 'failed_line_push')
-- =====================================================================
CREATE TABLE IF NOT EXISTS line_push_log (
    push_id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    channel          ENUM('main','cro') NOT NULL,
    to_user_id       VARCHAR(64)   NOT NULL COMMENT 'LINE U-id',
    message_type     VARCHAR(32)   NULL COMMENT 'text|flex|quick_reply|template',
    payload_preview  VARCHAR(255)  NULL COMMENT 'first 255 chars of payload for debug',
    status           ENUM('success','failed','retried') NOT NULL,
    http_status      SMALLINT UNSIGNED NULL,
    error_code       VARCHAR(64)   NULL COMMENT 'LINE error code if any',
    error_message    TEXT          NULL,
    triggered_by     VARCHAR(64)   NULL COMMENT 'booking_approve|email_report_notify|...',
    reference_id     VARCHAR(64)   NULL COMMENT 'booking_uid/report_id that triggered',
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_push_status_time (status, created_at),
    INDEX idx_push_user_time (to_user_id, created_at),
    INDEX idx_push_reference (reference_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
