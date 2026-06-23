-- Doctor manually uploads the report to NotebookLM themselves (no public API
-- exists for automated upload) and pastes the resulting notebook link back
-- here for the team to follow.
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0027_patient_reports_notebooklm.sql

ALTER TABLE patient_reports
    ADD COLUMN notebooklm_url VARCHAR(500) NULL COMMENT 'Manually pasted NotebookLM notebook link'
        AFTER assigned_doctor_id;
