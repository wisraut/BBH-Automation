-- Phase 2 - PDPA patient access audit logs (schema only)

CREATE TABLE IF NOT EXISTS patient_consent_logs (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id  INT UNSIGNED NOT NULL,
    viewed_by   INT UNSIGNED NOT NULL,
    action      ENUM('view','export','share','edit') NOT NULL,
    ip_address  VARCHAR(45) NOT NULL,
    reason      VARCHAR(255) NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_patient_consent_patient_created (patient_id, created_at),
    INDEX idx_patient_consent_viewed_created (viewed_by, created_at),
    CONSTRAINT fk_patient_consent_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_patient_consent_viewed_by
        FOREIGN KEY (viewed_by) REFERENCES users(id)
        ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
