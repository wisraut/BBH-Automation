-- Mirror event id: when an approved booking is copied onto the assigned doctor's
-- OWN Google Calendar (per-doctor mirror), we keep the mirror event's id here so
-- reschedule/cancel can update/remove it. The primary event stays on the shared
-- calendar (calendar_event_id) and is unaffected — the mirror is best-effort.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0054_booking_doctor_calendar_event.sql

ALTER TABLE booking_requests
    ADD COLUMN doctor_calendar_event_id VARCHAR(255) NULL AFTER calendar_event_url;
