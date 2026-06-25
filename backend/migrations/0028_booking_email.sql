-- 0028_booking_email.sql — capture customer email in the booking flow
-- so we can seed patients.email automatically when CRO approves the
-- booking. patients.email is what email_poller matches incoming lab
-- reports against, so without this an auto-created patient has no
-- way to be matched.

-- MySQL 8 does not support "ADD COLUMN IF NOT EXISTS" — wrap in a
-- procedure so re-running is a no-op.
DROP PROCEDURE IF EXISTS _add_email_col;
DELIMITER //
CREATE PROCEDURE _add_email_col()
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'booking_requests'
      AND COLUMN_NAME = 'email'
  ) THEN
    ALTER TABLE booking_requests
      ADD COLUMN email VARCHAR(191) NULL AFTER phone;
  END IF;
END //
DELIMITER ;
CALL _add_email_col();
DROP PROCEDURE _add_email_col;
