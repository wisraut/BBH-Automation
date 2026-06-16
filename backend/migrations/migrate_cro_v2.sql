-- Phase 1A v2 — CRO Monitoring + Override + Public Q&A on LINE #1
-- - Alter cro_users: เพิ่ม cro_code (CRO001-004) + เปลี่ยนชื่อเป็น 4 ผู้หญิงสั้นๆ
-- - Drop cro_queue (เดิม) — เปลี่ยนเป็น conversations-based
-- - Add conversations + conversation_messages tables

BEGIN;

-- Alter cro_users: add cro_code
ALTER TABLE cro_users ADD COLUMN IF NOT EXISTS cro_code TEXT UNIQUE;

-- Reset + reseed (Phase 1A v2 — ชื่อจริง)
DELETE FROM cro_users WHERE cro_code IS NULL;
INSERT INTO cro_users (cro_code, name, active) VALUES
  ('CRO001', 'น้อง', true),
  ('CRO002', 'แนน',  true),
  ('CRO003', 'อ้อม', true),
  ('CRO004', 'ปุ๊ก', true)
ON CONFLICT (cro_code) DO UPDATE SET name = EXCLUDED.name, active = EXCLUDED.active;

CREATE INDEX IF NOT EXISTS idx_cro_users_code ON cro_users(cro_code);

-- Drop old queue table (เดิม) — เปลี่ยนเป็น conversations
DROP TABLE IF EXISTS cro_queue;

-- New: conversations — track ทุก session ของลูกค้าใน LINE #1
CREATE TABLE IF NOT EXISTS conversations (
  conv_id        SERIAL PRIMARY KEY,
  patient_uid    TEXT NOT NULL,
  channel        TEXT NOT NULL DEFAULT 'line_public',
  started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity  TIMESTAMPTZ NOT NULL DEFAULT now(),
  status         TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active', 'taken_over', 'ended', 'idle')),
  taken_by       INT REFERENCES cro_users(cro_id),
  taken_at       TIMESTAMPTZ,
  ended_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_conv_patient_uid     ON conversations(patient_uid);
CREATE INDEX IF NOT EXISTS idx_conv_status_activity ON conversations(status, last_activity DESC);
CREATE INDEX IF NOT EXISTS idx_conv_taken_by        ON conversations(taken_by) WHERE taken_by IS NOT NULL;

-- New: conversation_messages — log ทุก message
CREATE TABLE IF NOT EXISTS conversation_messages (
  msg_id      SERIAL PRIMARY KEY,
  conv_id     INT NOT NULL REFERENCES conversations(conv_id) ON DELETE CASCADE,
  sender      TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'cro', 'system')),
  cro_id      INT REFERENCES cro_users(cro_id),
  text        TEXT NOT NULL,
  classifier  TEXT,
  confidence  INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_msg_conv_created  ON conversation_messages(conv_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_created       ON conversation_messages(created_at DESC);

COMMIT;
