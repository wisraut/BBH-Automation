-- Phase 1A.5 Level A — Auto-book Google Calendar
-- เพิ่ม google_event_id + start_at (parsed datetime) ใน bookings

BEGIN;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS start_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calendar_link   TEXT;

-- expand status enum
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_status_check
  CHECK (status IN ('pending', 'booked', 'confirmed', 'cancelled', 'rescheduled', 'failed'));

CREATE INDEX IF NOT EXISTS idx_bookings_start_at ON bookings(start_at) WHERE start_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_google   ON bookings(google_event_id) WHERE google_event_id IS NOT NULL;

COMMIT;
