-- Per-user personal integration settings (one row per user). Starts with a
-- personal NotebookLM notebook link — each doctor has their own — so the report
-- viewer can "forward" a report to that doctor's own notebook. Typed columns
-- (not key-value) so more personal integrations can be added later with clear
-- schema. Keyed by users.id; named doctor_settings since doctors are the primary
-- users, but any staff row may exist.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0052_doctor_settings.sql

CREATE TABLE IF NOT EXISTS doctor_settings (
    doctor_id      INT UNSIGNED NOT NULL PRIMARY KEY,
    notebooklm_url VARCHAR(512) NULL,
    updated_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_ds_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
