-- Normalized-phone column for format-insensitive patient identity matching.
-- Written by patient_repo (create/update) via utils.phone.normalize_phone.
-- Backfill of existing rows is done by a one-off Python pass that reuses the
-- SAME normalize_phone(), so runtime and historical values can't drift.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0047_patients_phone_normalized.sql

ALTER TABLE patients
    ADD COLUMN phone_normalized VARCHAR(20) NULL AFTER phone,
    ADD INDEX idx_patients_phone_norm (phone_normalized);
