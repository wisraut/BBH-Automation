-- Phase 2 - HN issuance counters
-- Patients become master records only after a booking is approved.

CREATE TABLE IF NOT EXISTS patient_hn_counters (
    year_yy    CHAR(2) PRIMARY KEY,
    last_seq   INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
