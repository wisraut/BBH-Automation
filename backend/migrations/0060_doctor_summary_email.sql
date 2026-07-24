-- The doctor's summary/automation inbox — where BBH forwards a patient's reports
-- so the doctor's own email->summary pipeline (e.g. a "SOAP:" subject trigger on
-- their mailbox) can process them. Per-doctor, set in Account settings; NULL until
-- the doctor configures it. Distinct from their login email on purpose: the
-- automation often runs on a separate address.
ALTER TABLE doctor_settings
    ADD COLUMN summary_email VARCHAR(255) NULL AFTER notebooklm_url;
