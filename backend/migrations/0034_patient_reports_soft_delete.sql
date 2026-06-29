-- HIPAA-like: never hard-delete patient_reports.
--
-- Medical records have a legal retention window (7+ years). Hard delete
-- removes the audit trail of what existed and who saw it. Soft delete keeps
-- the row + file on disk but hides them from default queries.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0034_patient_reports_soft_delete.sql

ALTER TABLE patient_reports
    ADD COLUMN deleted_at DATETIME NULL,
    ADD COLUMN deleted_by INT UNSIGNED NULL,
    ADD INDEX idx_patient_reports_not_deleted (deleted_at);

ALTER TABLE patient_reports
    ADD CONSTRAINT fk_patient_reports_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE SET NULL;
