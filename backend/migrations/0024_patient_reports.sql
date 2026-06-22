-- Patient reports — uploaded by CRO/doctor via Web Dashboard or ingested
-- from email/LINE/WhatsApp/walk-in. File stored on disk, extracted_text
-- inlined for Dify analysis context.

CREATE TABLE IF NOT EXISTS patient_reports (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    patient_id      INT UNSIGNED NOT NULL,
    source          ENUM('web','line','email','whatsapp','walkin') NOT NULL DEFAULT 'web',
    report_type     ENUM('lab','imaging','history','prescription','referral','other')
                    NOT NULL DEFAULT 'other',
    title           VARCHAR(255) NOT NULL,
    file_path       VARCHAR(500) NULL COMMENT 'Relative to /app/data/reports root',
    file_mime       VARCHAR(100) NULL,
    file_size       INT UNSIGNED NULL,
    extracted_text  MEDIUMTEXT NULL COMMENT 'pypdf / OCR / plaintext body',
    notes           TEXT NULL,
    uploaded_by     INT UNSIGNED NULL COMMENT 'users.id of CRO/doctor who uploaded',
    uploaded_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patient_reports_patient (patient_id, uploaded_at DESC),
    INDEX idx_patient_reports_source (source),
    INDEX idx_patient_reports_type (report_type),
    CONSTRAINT fk_patient_reports_patient FOREIGN KEY (patient_id)
        REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_patient_reports_uploader FOREIGN KEY (uploaded_by)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
