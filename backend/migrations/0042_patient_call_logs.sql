-- Patient call log — record every CRO/staff outbound or returned call.
--
-- Fields chosen to match how Thai CRO actually narrates a call:
--   - outcome (answered / no_answer / voicemail / wrong_number / refused / busy)
--   - direction (out = we called them / in = they called us)
--   - duration_min (optional, often left blank)
--   - subject (booking confirm / no-show follow-up / lab result / billing)
--   - note (free text)
--   - reference_booking_uid (if call relates to a specific booking)
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0042_patient_call_logs.sql

CREATE TABLE IF NOT EXISTS patient_call_logs (
    id                      BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id              INT UNSIGNED NOT NULL,
    called_at               DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    direction               ENUM('out','in') NOT NULL DEFAULT 'out',
    outcome                 ENUM('answered','no_answer','voicemail','wrong_number','refused','busy','other')
                            NOT NULL,
    duration_min            INT UNSIGNED NULL,
    subject                 VARCHAR(80)  NULL COMMENT 'booking_confirm | no_show_followup | lab_result | billing | other',
    reference_booking_uid   CHAR(36)     NULL,
    note                    TEXT         NULL,
    called_by               INT UNSIGNED NULL COMMENT 'users.id of staff',
    created_at              DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pcl_patient (patient_id, called_at DESC),
    INDEX idx_pcl_booking (reference_booking_uid),
    CONSTRAINT fk_pcl_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_pcl_caller FOREIGN KEY (called_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
