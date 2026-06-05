-- Patient register schema migration (Task #15, 2026-06-04)
-- เพิ่ม patient_code (PT001-005) + line_uid + dify_conversation_id

BEGIN;

ALTER TABLE patients
  ADD COLUMN patient_code         TEXT UNIQUE,
  ADD COLUMN line_uid             TEXT UNIQUE,
  ADD COLUMN dify_conversation_id TEXT;

CREATE INDEX idx_patients_line_uid     ON patients(line_uid);
CREATE INDEX idx_patients_patient_code ON patients(patient_code);

UPDATE patients SET patient_code = 'PT001' WHERE patient_id = 'HN-2019-001';
UPDATE patients SET patient_code = 'PT002' WHERE patient_id = 'HN-2020-002';
UPDATE patients SET patient_code = 'PT003' WHERE patient_id = 'HN-2018-003';
UPDATE patients SET patient_code = 'PT004' WHERE patient_id = 'HN-2022-004';
UPDATE patients SET patient_code = 'PT005' WHERE patient_id = 'HN-2023-005';

COMMIT;
