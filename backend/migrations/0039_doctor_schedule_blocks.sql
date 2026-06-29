-- Doctor schedule blocks: vacation, off-hours, conference, etc.
-- CRO booking flow should refuse a slot if it overlaps a block.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0039_doctor_schedule_blocks.sql

CREATE TABLE IF NOT EXISTS doctor_schedule_blocks (
    id             INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    doctor_id      INT UNSIGNED NOT NULL,
    block_type     ENUM('vacation','off_hours','conference','sick','other') NOT NULL DEFAULT 'vacation',
    start_at       DATETIME NOT NULL,
    end_at         DATETIME NOT NULL,
    reason         VARCHAR(255) NULL,
    created_by     INT UNSIGNED NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_dsb_doctor_time (doctor_id, start_at, end_at),
    INDEX idx_dsb_window (start_at, end_at),
    CONSTRAINT fk_dsb_doctor FOREIGN KEY (doctor_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_dsb_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
