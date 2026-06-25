-- Phase 2 - Link LINE bot sessions to hospital patients (schema only)

SET @sql = (
    SELECT IF(
        EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'bot_sessions'
              AND COLUMN_NAME = 'patient_id'
        ),
        'SELECT 1',
        'ALTER TABLE bot_sessions ADD COLUMN patient_id INT UNSIGNED NULL'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'bot_sessions'
              AND INDEX_NAME = 'idx_bot_sessions_patient_id'
        ),
        'SELECT 1',
        'ALTER TABLE bot_sessions ADD INDEX idx_bot_sessions_patient_id (patient_id)'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql = (
    SELECT IF(
        EXISTS (
            SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE()
              AND TABLE_NAME = 'bot_sessions'
              AND CONSTRAINT_NAME = 'fk_bot_sessions_patient'
        ),
        'SELECT 1',
        'ALTER TABLE bot_sessions ADD CONSTRAINT fk_bot_sessions_patient FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL'
    )
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
