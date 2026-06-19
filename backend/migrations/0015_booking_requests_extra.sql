-- Phase 2 - Extra booking request dashboard fields (schema only)

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'patient_id'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN patient_id INT UNSIGNED NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'assigned_doctor_id'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN assigned_doctor_id INT UNSIGNED NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'booking_source'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN booking_source ENUM(''line'',''phone'',''whatsapp'',''email'',''walkin'') NOT NULL DEFAULT ''line'''));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'appointment_type'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN appointment_type ENUM(''new'',''followup'',''procedure'',''consult'') NOT NULL DEFAULT ''new'''));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'duration_min'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN duration_min INT UNSIGNED NOT NULL DEFAULT 60'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'started_datetime'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN started_datetime DATETIME NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'ended_datetime'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN ended_datetime DATETIME NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'visit_outcome'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN visit_outcome ENUM(''attended'',''no_show'',''cancelled'',''rescheduled'') NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND COLUMN_NAME = 'rescheduled_to_uid'), 'SELECT 1', 'ALTER TABLE booking_requests ADD COLUMN rescheduled_to_uid CHAR(36) NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND INDEX_NAME = 'idx_booking_requests_patient_id'), 'SELECT 1', 'ALTER TABLE booking_requests ADD INDEX idx_booking_requests_patient_id (patient_id)'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND INDEX_NAME = 'idx_booking_requests_doctor_status'), 'SELECT 1', 'ALTER TABLE booking_requests ADD INDEX idx_booking_requests_doctor_status (assigned_doctor_id, status)'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND INDEX_NAME = 'idx_booking_requests_source'), 'SELECT 1', 'ALTER TABLE booking_requests ADD INDEX idx_booking_requests_source (booking_source)'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND INDEX_NAME = 'idx_booking_requests_outcome'), 'SELECT 1', 'ALTER TABLE booking_requests ADD INDEX idx_booking_requests_outcome (visit_outcome)'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND INDEX_NAME = 'idx_booking_requests_rescheduled_to_uid'), 'SELECT 1', 'ALTER TABLE booking_requests ADD INDEX idx_booking_requests_rescheduled_to_uid (rescheduled_to_uid)'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND CONSTRAINT_NAME = 'fk_booking_requests_patient'), 'SELECT 1', 'ALTER TABLE booking_requests ADD CONSTRAINT fk_booking_requests_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND CONSTRAINT_NAME = 'fk_booking_requests_assigned_doctor'), 'SELECT 1', 'ALTER TABLE booking_requests ADD CONSTRAINT fk_booking_requests_assigned_doctor FOREIGN KEY (assigned_doctor_id) REFERENCES users(id) ON DELETE SET NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (SELECT IF(EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'booking_requests' AND CONSTRAINT_NAME = 'fk_booking_requests_rescheduled_to'), 'SELECT 1', 'ALTER TABLE booking_requests ADD CONSTRAINT fk_booking_requests_rescheduled_to FOREIGN KEY (rescheduled_to_uid) REFERENCES booking_requests(request_uid) ON DELETE SET NULL'));
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
