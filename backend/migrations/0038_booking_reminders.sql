-- Appointment reminder tracking — 24h + 1h reminders before requested time.
-- We store the sent timestamp directly on booking_requests so the reminder
-- worker can find candidates via a single indexed query and avoid double-send.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0038_booking_reminders.sql

ALTER TABLE booking_requests
    ADD COLUMN reminder_24h_sent_at DATETIME NULL,
    ADD COLUMN reminder_1h_sent_at DATETIME NULL,
    ADD INDEX idx_br_reminder_window (status, requested_date, requested_time);
