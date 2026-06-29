-- Soft delete for patients — same rationale as 0034 for patient_reports.
-- Hospital records must be retained even after a patient leaves the system.
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0036_patients_soft_delete.sql

ALTER TABLE patients
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN deleted_by INT UNSIGNED NULL,
    ADD INDEX idx_patients_not_deleted (deleted_at);

ALTER TABLE patients
    ADD CONSTRAINT fk_patients_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
