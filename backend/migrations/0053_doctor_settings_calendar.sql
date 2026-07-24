-- Add the doctor's own Google Calendar ID to their personal settings. The doctor
-- shares their Google Calendar with our service account (edit access) and stores
-- their calendar id here (usually their Google email, or an ...@group.calendar
-- .google.com id). Routing booking events to this calendar is a later step;
-- this migration just stores the value.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0053_doctor_settings_calendar.sql

ALTER TABLE doctor_settings
    ADD COLUMN google_calendar_id VARCHAR(255) NULL AFTER notebooklm_url;
