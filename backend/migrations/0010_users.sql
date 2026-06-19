-- Phase 1 — Web Dashboard users (schema only)
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0010_users.sql
--
-- IMPORTANT: This file contains schema only. Seed admin via:
--   python work/_create_admin.py
-- (script is gitignored, prompts for password securely, uses parameterized query)

CREATE TABLE IF NOT EXISTS users (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email           VARCHAR(191) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    display_name    VARCHAR(120) NOT NULL,
    role            ENUM('admin','doctor','cro') NOT NULL,
    specialty       VARCHAR(120) NULL COMMENT 'doctor only',
    avatar_url      VARCHAR(500) NULL,
    is_active       TINYINT(1) NOT NULL DEFAULT 1,
    last_login_at   DATETIME NULL,
    created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_role (role),
    INDEX idx_users_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
