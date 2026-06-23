-- Add doctor assignment to patient_reports — lets CRO/staff pick which
-- doctor a report is routed to when uploading; triggers an email alert.
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0026_patient_reports_doctor.sql

ALTER TABLE patient_reports
    ADD COLUMN assigned_doctor_id INT UNSIGNED NULL COMMENT 'users.id of doctor (role=doctor) this report is routed to'
        AFTER uploaded_by,
    ADD CONSTRAINT fk_patient_reports_doctor FOREIGN KEY (assigned_doctor_id)
        REFERENCES users(id) ON DELETE SET NULL,
    ADD INDEX idx_patient_reports_doctor (assigned_doctor_id);
