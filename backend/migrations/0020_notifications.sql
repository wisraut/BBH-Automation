-- Phase 2 - Web Dashboard notifications and sidebar badges (schema only)

CREATE TABLE IF NOT EXISTS notifications (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NULL,
    role        ENUM('admin','doctor','cro') NULL,
    type        ENUM('new_booking','line_reply','lab_result','mention','system') NOT NULL,
    title       VARCHAR(255) NOT NULL,
    body        TEXT NULL,
    link_url    VARCHAR(500) NULL,
    is_read     TINYINT(1) NOT NULL DEFAULT 0,
    read_at     DATETIME NULL,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notifications_user_read_created (user_id, is_read, created_at),
    INDEX idx_notifications_role_read_created (role, is_read, created_at),
    INDEX idx_notifications_type (type),
    CONSTRAINT fk_notifications_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_notifications_target
        CHECK (user_id IS NOT NULL OR role IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
