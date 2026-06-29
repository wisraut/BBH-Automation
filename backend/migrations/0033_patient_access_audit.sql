-- HIPAA-like audit trail for patient record access.
--
-- Every read of patient data (view profile, list reports, download file,
-- run AI analyze) writes a row here so admin can answer "ใครเข้าดู patient X
-- เมื่อไหร่ จาก IP ไหน" without crawling application logs.
--
-- Denormalized actor_email/actor_role: survive user deletion + remove the
-- need for JOIN in the audit viewer (hot path).
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0033_patient_access_audit.sql

CREATE TABLE IF NOT EXISTS patient_access_audit (
    id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    actor_id        INT UNSIGNED  NULL COMMENT 'users.id (NULL for system)',
    actor_email     VARCHAR(191)  NULL COMMENT 'denormalized — survives user deletion',
    actor_role      VARCHAR(32)   NULL,
    action          VARCHAR(64)   NOT NULL
                    COMMENT 'view_patient | list_patients | view_report | download_report | list_reports | analyze_report | decide_triage',
    subject_type    VARCHAR(32)   NOT NULL COMMENT 'patient | report | analysis',
    subject_id      VARCHAR(64)   NOT NULL,
    patient_id      INT UNSIGNED  NULL COMMENT 'always linked to patient when known',
    ip_address      VARCHAR(64)   NULL,
    user_agent      TEXT          NULL,
    request_path    VARCHAR(255)  NULL,
    request_method  VARCHAR(8)    NULL,
    extra_json      JSON          NULL COMMENT 'result_count, filters, etc',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_audit_patient_time (patient_id, created_at),
    INDEX idx_audit_actor_time (actor_id, created_at),
    INDEX idx_audit_action_time (action, created_at),
    INDEX idx_audit_time (created_at),
    INDEX idx_audit_subject (subject_type, subject_id),

    CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_audit_patient FOREIGN KEY (patient_id)
        REFERENCES patients(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
