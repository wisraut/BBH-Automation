-- Phase 2 - Doctor report uploads and NotebookLM review state (schema only)

CREATE TABLE IF NOT EXISTS doctor_reports (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id       INT UNSIGNED NULL,
    patient_name     VARCHAR(120) NULL,
    uploaded_by      INT UNSIGNED NOT NULL,
    filename         VARCHAR(255) NOT NULL,
    file_path        VARCHAR(500) NOT NULL,
    file_size        INT UNSIGNED NOT NULL,
    mime_type        VARCHAR(100) NOT NULL,
    notebooklm_url   VARCHAR(500) NULL,
    notes            TEXT NULL,
    status           ENUM('uploaded','sent_notebooklm','reviewed') NOT NULL DEFAULT 'uploaded',
    reviewed_by      INT UNSIGNED NULL,
    reviewed_at      DATETIME NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_doctor_reports_patient_id (patient_id),
    INDEX idx_doctor_reports_uploaded_status (uploaded_by, status),
    INDEX idx_doctor_reports_status (status),
    INDEX idx_doctor_reports_reviewed_by (reviewed_by),
    CONSTRAINT fk_doctor_reports_patient
        FOREIGN KEY (patient_id) REFERENCES patients(id)
        ON DELETE SET NULL,
    CONSTRAINT fk_doctor_reports_uploaded_by
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
        ON DELETE RESTRICT,
    CONSTRAINT fk_doctor_reports_reviewed_by
        FOREIGN KEY (reviewed_by) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
