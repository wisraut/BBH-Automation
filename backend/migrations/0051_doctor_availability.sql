-- Doctor "open for booking" hours as a recurring WEEKLY TEMPLATE. This is the
-- POSITIVE inverse of doctor_schedule_blocks (0039), which stays the negative
-- time-off / exceptions layer. Effective availability = template hours MINUS
-- time-off blocks. A template is O(7) rows per doctor and composes with the
-- existing block machinery instead of replacing it.
--
-- day_of_week convention: 0=Mon, 1=Tue, ... 6=Sun (matches Python
-- datetime.weekday()). Multiple ranges per (doctor, day) are allowed
-- (e.g. a morning + an afternoon block). The booking constraint is OPT-IN:
-- a doctor with zero template rows is treated as "unconstrained" (today's
-- behaviour), so this never regresses existing doctors.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0051_doctor_availability.sql

CREATE TABLE IF NOT EXISTS doctor_availability (
    id           INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    doctor_id    INT UNSIGNED NOT NULL,
    day_of_week  TINYINT UNSIGNED NOT NULL,   -- 0=Mon .. 6=Sun
    start_time   TIME NOT NULL,
    end_time     TIME NOT NULL,
    created_by   INT UNSIGNED NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_da_doctor_dow (doctor_id, day_of_week),
    CONSTRAINT fk_da_doctor  FOREIGN KEY (doctor_id)  REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_da_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
