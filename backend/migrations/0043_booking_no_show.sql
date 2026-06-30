-- Add no_show status + counter on patient.
-- A background job flags approved bookings as no_show 30 minutes after the
-- requested time if the booking still has status='approved' and no
-- check-in event. CRO follows up from the dashboard.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0043_booking_no_show.sql

ALTER TABLE booking_requests
    MODIFY COLUMN status ENUM('draft','pending_approval','approved','rejected','cancelled','expired','no_show')
        NOT NULL DEFAULT 'draft';

ALTER TABLE booking_requests
    ADD COLUMN flagged_no_show_at DATETIME NULL,
    ADD INDEX idx_br_no_show (status, flagged_no_show_at);

ALTER TABLE patients
    ADD COLUMN no_show_count INT UNSIGNED NOT NULL DEFAULT 0;
