-- Patient intake fields the CRO fills before confirming a booking:
-- national ID / passport, blood type, up to 4 phone numbers (phone = #1),
-- address, and the staff member who did the intake. All nullable/optional at the
-- DB layer; the CRO form enforces which are required before approval.
ALTER TABLE patients
    ADD COLUMN national_id VARCHAR(30)  NULL AFTER nationality,
    ADD COLUMN blood_type  VARCHAR(6)   NULL AFTER national_id,
    ADD COLUMN phone2      VARCHAR(20)  NULL AFTER phone,
    ADD COLUMN phone3      VARCHAR(20)  NULL AFTER phone2,
    ADD COLUMN phone4      VARCHAR(20)  NULL AFTER phone3,
    ADD COLUMN address     TEXT         NULL AFTER blood_type,
    ADD COLUMN intake_by   VARCHAR(120) NULL AFTER address;
