-- Phase 1A — CRO Assistant
-- Schema สำหรับ CRO queue (ticket system) + CRO users (LINE channel ที่ 2)

BEGIN;

-- CRO team members (LINE channel ที่ 2)
CREATE TABLE IF NOT EXISTS cro_users (
  cro_id     SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  line_uid   TEXT UNIQUE,                 -- LINE user ID ใน CRO channel
  active     BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_users_line_uid ON cro_users(line_uid) WHERE line_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cro_users_active   ON cro_users(active)   WHERE active = true;

-- CRO queue (tickets) — คำถามที่ AI ตอบไม่ได้ ต้องให้ CRO ตอบ manual
CREATE TABLE IF NOT EXISTS cro_queue (
  ticket_id       SERIAL PRIMARY KEY,
  source_channel  TEXT NOT NULL,          -- 'line_cro' (เผื่อ Phase 1B/C: 'whatsapp', 'messenger')
  patient_uid     TEXT NOT NULL,          -- LINE user ID ของคนไข้ใน CRO channel
  patient_name    TEXT,                   -- ถ้า LINE profile ให้ได้
  question        TEXT NOT NULL,
  classifier      TEXT,                   -- 'unanswerable' / 'medical_diagnosis' / 'complaint' / etc.
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'claimed', 'replied', 'cancelled')),
  claimed_by      INT REFERENCES cro_users(cro_id),
  claimed_at      TIMESTAMPTZ,
  reply           TEXT,
  replied_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cro_queue_status      ON cro_queue(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cro_queue_patient_uid ON cro_queue(patient_uid);
CREATE INDEX IF NOT EXISTS idx_cro_queue_claimed_by  ON cro_queue(claimed_by) WHERE claimed_by IS NOT NULL;

-- Seed: CRO team 4 คน (line_uid = NULL จะถูก register ภายหลังผ่าน LINE)
INSERT INTO cro_users (name, active) VALUES
  ('CRO 1', true),
  ('CRO 2', true),
  ('CRO 3', true),
  ('CRO 4', true)
ON CONFLICT DO NOTHING;

-- Audit log (ใช้ table audit_log เดิมถ้ามี, ถ้าไม่มีสร้าง)
CREATE TABLE IF NOT EXISTS audit_log (
  log_id    SERIAL PRIMARY KEY,
  event     TEXT NOT NULL,                -- 'cro_auto_answered', 'cro_escalated', 'cro_claimed', 'cro_replied'
  actor     TEXT,                          -- LINE uid หรือ system
  target    TEXT,                          -- ticket_id หรือ patient_uid
  meta      JSONB,                         -- ข้อมูลเสริม
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_event      ON audit_log(event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at DESC);

COMMIT;
