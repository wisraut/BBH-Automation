-- Phase 2 - Web Dashboard auth audit logs (schema only)

CREATE TABLE IF NOT EXISTS auth_audit_logs (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    event_type   ENUM('login_success','login_fail','logout','password_change') NOT NULL,
    user_id      INT UNSIGNED NULL,
    email        VARCHAR(191) NOT NULL,
    ip_address   VARCHAR(45) NOT NULL,
    user_agent   VARCHAR(255) NULL,
    fail_reason  VARCHAR(80) NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_auth_audit_email_created (email, created_at),
    INDEX idx_auth_audit_user_created (user_id, created_at),
    INDEX idx_auth_audit_ip_created (ip_address, created_at),
    CONSTRAINT fk_auth_audit_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
