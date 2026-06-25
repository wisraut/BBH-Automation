-- Phase 2 - Hospital patient records (schema only)

CREATE TABLE IF NOT EXISTS patients (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    hn            VARCHAR(20) NULL UNIQUE,
    display_name  VARCHAR(120) NOT NULL,
    phone         VARCHAR(20) NULL,
    email         VARCHAR(191) NULL,
    dob           DATE NULL,
    gender        ENUM('male','female','other','unknown') NULL,
    notes         TEXT NULL,
    created_by    INT UNSIGNED NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_patients_display_name (display_name),
    INDEX idx_patients_phone (phone),
    INDEX idx_patients_hn (hn),
    INDEX idx_patients_created_by (created_by),
    CONSTRAINT fk_patients_created_by
        FOREIGN KEY (created_by) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
