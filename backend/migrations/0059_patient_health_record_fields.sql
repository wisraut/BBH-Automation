-- Health-record fields to match the hospital's paper "บันทึกประวัติ / Health Record"
-- intake form, so the CRO can fill them in-app and the printable record pre-fills.
-- Two groups, all nullable (optional at the DB layer):
--   1) demographics: english name, religion, marital status, occupation,
--      parents (name+phone), emergency contact (name/relation/phone/address)
--   2) health/social history: past illness, congenital disease, drugs/supplements,
--      drug allergy, food allergy, smoking (+years), drinking (+years)
-- Smoking/drinking are tri-state: NULL = not recorded, 0 = no, 1 = yes.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0059_patient_health_record_fields.sql

ALTER TABLE patients
    ADD COLUMN english_name                VARCHAR(120) NULL AFTER intake_by,
    ADD COLUMN religion                    VARCHAR(60)  NULL AFTER english_name,
    ADD COLUMN marital_status              VARCHAR(30)  NULL AFTER religion,
    ADD COLUMN occupation                  VARCHAR(120) NULL AFTER marital_status,
    ADD COLUMN father_name                 VARCHAR(120) NULL AFTER occupation,
    ADD COLUMN father_phone                VARCHAR(20)  NULL AFTER father_name,
    ADD COLUMN mother_name                 VARCHAR(120) NULL AFTER father_phone,
    ADD COLUMN mother_phone                VARCHAR(20)  NULL AFTER mother_name,
    ADD COLUMN emergency_contact_name      VARCHAR(120) NULL AFTER mother_phone,
    ADD COLUMN emergency_contact_relation  VARCHAR(60)  NULL AFTER emergency_contact_name,
    ADD COLUMN emergency_contact_phone     VARCHAR(20)  NULL AFTER emergency_contact_relation,
    ADD COLUMN emergency_contact_address   VARCHAR(500) NULL AFTER emergency_contact_phone,
    ADD COLUMN past_illness                TEXT         NULL AFTER emergency_contact_address,
    ADD COLUMN congenital_disease          TEXT         NULL AFTER past_illness,
    ADD COLUMN drugs_supplements           TEXT         NULL AFTER congenital_disease,
    ADD COLUMN drug_allergy                TEXT         NULL AFTER drugs_supplements,
    ADD COLUMN food_allergy                TEXT         NULL AFTER drug_allergy,
    ADD COLUMN smoking                     TINYINT(1)   NULL AFTER food_allergy,
    ADD COLUMN smoking_years               SMALLINT     NULL AFTER smoking,
    ADD COLUMN drinking                    TINYINT(1)   NULL AFTER smoking_years,
    ADD COLUMN drinking_years              SMALLINT     NULL AFTER drinking;
