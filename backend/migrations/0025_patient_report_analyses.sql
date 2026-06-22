-- AI-generated analyses of patient reports. Triage decision is recorded
-- here so Phase 2 (AI accept/reject suggestion) plugs in directly.

CREATE TABLE IF NOT EXISTS patient_report_analyses (
    id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    report_id               INT UNSIGNED NOT NULL,
    requested_by            INT UNSIGNED NULL COMMENT 'users.id of doctor/cro who triggered analyze',
    dify_conversation_id    VARCHAR(100) NULL,
    summary_text            MEDIUMTEXT NOT NULL,
    raw_response            JSON NULL,
    triage_decision         ENUM('accept','reject','review','pending') NOT NULL DEFAULT 'pending'
                            COMMENT 'AI suggestion: accept/reject/review (doctor confirms via decided_by)',
    decided_by              INT UNSIGNED NULL COMMENT 'users.id of doctor who confirmed AI suggestion',
    decided_at              DATETIME NULL,
    created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_analyses_report (report_id, created_at DESC),
    INDEX idx_analyses_triage (triage_decision),
    CONSTRAINT fk_analyses_report FOREIGN KEY (report_id)
        REFERENCES patient_reports(id) ON DELETE CASCADE,
    CONSTRAINT fk_analyses_requester FOREIGN KEY (requested_by)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_analyses_decider FOREIGN KEY (decided_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
