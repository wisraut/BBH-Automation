-- Phase 2 - Booking attachments from LINE/staff uploads (schema only)

CREATE TABLE IF NOT EXISTS booking_attachments (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    booking_uid          CHAR(36) NOT NULL,
    uploaded_by          ENUM('patient','staff') NOT NULL,
    uploaded_by_user_id  INT UNSIGNED NULL,
    filename             VARCHAR(255) NOT NULL,
    file_path            VARCHAR(500) NOT NULL,
    file_size            INT UNSIGNED NOT NULL,
    mime_type            VARCHAR(100) NOT NULL,
    thumbnail_path       VARCHAR(500) NULL,
    created_at           DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_booking_attachments_booking_uid (booking_uid),
    INDEX idx_booking_attachments_uploaded_by_user (uploaded_by_user_id),
    CONSTRAINT fk_booking_attachments_booking
        FOREIGN KEY (booking_uid) REFERENCES booking_requests(request_uid)
        ON DELETE CASCADE,
    CONSTRAINT fk_booking_attachments_uploaded_by_user
        FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
