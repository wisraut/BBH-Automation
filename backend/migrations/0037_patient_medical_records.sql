-- Patient medical records: conditions / allergies / medications / treatments.
-- Ported from the legacy Postgres hospital_db schema (which was mock-only)
-- into MySQL bot_ops where the rest of the app lives.
--
-- Each table is FK'd to patients(id) with ON DELETE CASCADE — when a patient
-- row is hard-deleted (rare; we soft-delete normally) sub-records go with it.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0037_patient_medical_records.sql

CREATE TABLE IF NOT EXISTS medical_conditions (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id      INT UNSIGNED NOT NULL,
    condition_name  VARCHAR(255) NOT NULL,
    icd10           VARCHAR(20)  NULL,
    diagnosed_year  SMALLINT     NULL,
    status          ENUM('active','controlled','resolved') NOT NULL DEFAULT 'active',
    notes           TEXT         NULL,
    created_by      INT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_mc_patient (patient_id, status),
    CONSTRAINT fk_mc_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_mc_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS patient_allergies (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id    INT UNSIGNED NOT NULL,
    allergen      VARCHAR(255) NOT NULL,
    reaction      VARCHAR(255) NULL,
    severity      ENUM('mild','moderate','severe','life_threatening') NULL,
    notes         TEXT         NULL,
    created_by    INT UNSIGNED NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pa_patient (patient_id),
    CONSTRAINT fk_pa_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_pa_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS current_medications (
    id            INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id    INT UNSIGNED NOT NULL,
    drug_name     VARCHAR(255) NOT NULL,
    dose          VARCHAR(100) NULL,
    frequency     VARCHAR(100) NULL,
    indication    VARCHAR(255) NULL,
    started_year  SMALLINT     NULL,
    is_active     TINYINT(1)   NOT NULL DEFAULT 1,
    notes         TEXT         NULL,
    created_by    INT UNSIGNED NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_cm_patient (patient_id, is_active),
    CONSTRAINT fk_cm_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_cm_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS treatment_history (
    id              INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id      INT UNSIGNED NOT NULL,
    treatment_type  VARCHAR(100) NOT NULL COMMENT 'surgery | procedure | therapy | other',
    description     TEXT         NOT NULL,
    hospital        VARCHAR(255) NULL,
    treated_date    DATE         NULL,
    outcome         VARCHAR(255) NULL,
    notes           TEXT         NULL,
    created_by      INT UNSIGNED NULL,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_th_patient (patient_id, treated_date),
    CONSTRAINT fk_th_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_th_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
