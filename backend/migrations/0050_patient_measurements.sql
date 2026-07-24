-- Structured numeric medical values over time (lab analytes / biomarkers).
-- One row per (patient, marker code, draw date). Powers two patient-detail
-- views off the SAME data: LabResults (latest values vs reference range) and
-- Biomarker (trend vs functional-medicine optimal zone).
--
-- Values enter as `draft` from LLM extraction of a report's extracted_text,
-- then a doctor confirms/edits (`confirmed`) or discards (`rejected`, kept for
-- audit — never hard-deleted). Only `confirmed` rows are trusted by the views.
-- `code` maps to services/measurement_catalog.MARKERS but is intentionally NOT
-- a DB FK, so extraction stays resilient to unknown markers.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0050_patient_measurements.sql

CREATE TABLE IF NOT EXISTS patient_measurements (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id    INT UNSIGNED NOT NULL,
    report_id     INT UNSIGNED NULL,                 -- source report (NULL = manual entry)
    code          VARCHAR(32) NOT NULL,              -- catalog marker code: glucose, hba1c, ldl...
    value         DECIMAL(12,4) NOT NULL,
    unit          VARCHAR(24) NULL,                  -- as extracted; normalized toward catalog on confirm
    measured_at   DATE NOT NULL,                     -- lab draw date (from report text; falls back to upload date)
    status        ENUM('draft','confirmed','rejected') NOT NULL DEFAULT 'draft',
    raw_label     VARCHAR(128) NULL,                 -- original label from report (audit/debug)
    note          VARCHAR(255) NULL,
    created_by    INT UNSIGNED NULL,                 -- extractor run = NULL; doctor on manual entry
    confirmed_by  INT UNSIGNED NULL,
    confirmed_at  DATETIME NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_pm_patient_code_time (patient_id, code, measured_at),
    INDEX idx_pm_report (report_id),
    INDEX idx_pm_status (patient_id, status),
    CONSTRAINT fk_pm_patient   FOREIGN KEY (patient_id)   REFERENCES patients(id)        ON DELETE CASCADE,
    CONSTRAINT fk_pm_report    FOREIGN KEY (report_id)    REFERENCES patient_reports(id) ON DELETE SET NULL,
    CONSTRAINT fk_pm_creator   FOREIGN KEY (created_by)   REFERENCES users(id)           ON DELETE SET NULL,
    CONSTRAINT fk_pm_confirmer FOREIGN KEY (confirmed_by) REFERENCES users(id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
