-- Phase 1A.5 — Booking flow (multi-turn AI conversation)
-- AI ถามข้อมูลทีละข้อ → save draft booking → CRO confirm + book Google Calendar เอง

BEGIN;

CREATE TABLE IF NOT EXISTS bookings (
  booking_id      SERIAL PRIMARY KEY,
  conv_id         INT REFERENCES conversations(conv_id) ON DELETE SET NULL,
  patient_uid     TEXT NOT NULL,
  name            TEXT,
  phone           TEXT,
  preferred_date  TEXT,
  preferred_time  TEXT,
  symptom         TEXT,
  raw_data        JSONB,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'confirmed', 'cancelled', 'rescheduled')),
  confirmed_by    INT REFERENCES cro_users(cro_id),
  confirmed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bookings_patient ON bookings(patient_uid);
CREATE INDEX IF NOT EXISTS idx_bookings_status  ON bookings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bookings_conv    ON bookings(conv_id) WHERE conv_id IS NOT NULL;

-- Add dify_conversation_id เพื่อ resume session (multi-turn)
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS dify_conversation_id TEXT;

COMMIT;
