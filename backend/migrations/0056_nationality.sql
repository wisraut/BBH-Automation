-- Patient nationality — captured at booking (LINE / web) and kept on the patient
-- record. Optional, defaults NULL (no assumed nationality).
ALTER TABLE patients
    ADD COLUMN nationality VARCHAR(60) NULL AFTER gender;

ALTER TABLE booking_requests
    ADD COLUMN nationality VARCHAR(60) NULL AFTER email;
