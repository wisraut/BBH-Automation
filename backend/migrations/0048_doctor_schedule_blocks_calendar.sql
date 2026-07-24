-- Mirror doctor schedule blocks onto the shared Google Calendar. Block events
-- are written TRANSPARENT (show + remind, but don't consume calendar-wide
-- availability, so one doctor's block can't false-block another doctor's
-- bookings — the per-doctor DB check stays the real guard). A block may also
-- carry an online-meeting link (conference / ประชุม).
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0048_doctor_schedule_blocks_calendar.sql

ALTER TABLE doctor_schedule_blocks
    ADD COLUMN calendar_event_id  VARCHAR(255) NULL AFTER reason,
    ADD COLUMN calendar_event_url VARCHAR(512) NULL AFTER calendar_event_id,
    ADD COLUMN video_link         VARCHAR(512) NULL AFTER calendar_event_id;
