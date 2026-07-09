-- Patient care team (many-to-many, "empanelment"): a patient has a set of
-- doctors with roles. Exactly one `primary` (PCP / เจ้าของไข้) is expected per
-- patient; the rest are specialist/consultant. Drives the doctor "my patients"
-- panel and lab-report routing. Auto-seeded from booking approvals + managed
-- manually on the patient page.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0049_patient_doctors.sql

CREATE TABLE IF NOT EXISTS patient_doctors (
    id          INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    patient_id  INT UNSIGNED NOT NULL,
    doctor_id   INT UNSIGNED NOT NULL,
    role        ENUM('primary','specialist','consultant') NOT NULL DEFAULT 'specialist',
    is_active   TINYINT(1) NOT NULL DEFAULT 1,
    added_by    INT UNSIGNED NULL,
    added_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_patient_doctor (patient_id, doctor_id),
    INDEX idx_pd_doctor (doctor_id, is_active),
    INDEX idx_pd_patient (patient_id, is_active),
    CONSTRAINT fk_pd_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE,
    CONSTRAINT fk_pd_doctor  FOREIGN KEY (doctor_id)  REFERENCES users(id)    ON DELETE CASCADE,
    CONSTRAINT fk_pd_addedby FOREIGN KEY (added_by)   REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
