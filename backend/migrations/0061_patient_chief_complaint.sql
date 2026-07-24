-- อาการที่ต้องการปรึกษา / เพิ่มเติม (Chief complaint) บน patient record — ให้ CRO/พยาบาล
-- พิมพ์ในฟอร์มกรอกประวัติได้ และใบพิมพ์ "บันทึกประวัติ / Health Record" pre-fill ช่องนี้.
-- Nullable (optional): NULL = ยังไม่บันทึก.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0060_patient_chief_complaint.sql

ALTER TABLE patients
    ADD COLUMN chief_complaint TEXT NULL AFTER food_allergy;
