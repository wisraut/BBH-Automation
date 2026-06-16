CREATE TABLE IF NOT EXISTS bot_sessions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  channel VARCHAR(40) NOT NULL,
  external_user_id VARCHAR(191) NOT NULL,
  dify_conversation_id VARCHAR(191) NULL,
  current_intent VARCHAR(80) NULL,
  current_state VARCHAR(80) NOT NULL DEFAULT 'idle',
  last_message_at DATETIME NULL,
  metadata JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bot_sessions_channel_user (channel, external_user_id),
  KEY idx_bot_sessions_state (current_state),
  KEY idx_bot_sessions_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_uid CHAR(36) NOT NULL,
  channel VARCHAR(40) NOT NULL DEFAULT 'line_main',
  external_user_id VARCHAR(191) NOT NULL,
  session_id BIGINT UNSIGNED NULL,
  status ENUM('draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'expired') NOT NULL DEFAULT 'draft',
  patient_name VARCHAR(191) NULL,
  phone VARCHAR(80) NULL,
  requested_date DATE NULL,
  requested_time TIME NULL,
  requested_datetime_text VARCHAR(191) NULL,
  symptom TEXT NULL,
  service_type VARCHAR(120) NULL,
  doctor_code VARCHAR(80) NULL,
  calendar_provider VARCHAR(40) NOT NULL DEFAULT 'google',
  calendar_id VARCHAR(191) NULL,
  calendar_event_id VARCHAR(191) NULL,
  calendar_event_url TEXT NULL,
  calendar_status ENUM('not_created', 'pending_event', 'created', 'failed') NOT NULL DEFAULT 'not_created',
  raw_summary JSON NULL,
  notes TEXT NULL,
  created_by VARCHAR(80) NOT NULL DEFAULT 'bot',
  approved_by VARCHAR(191) NULL,
  approved_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_booking_requests_uid (request_uid),
  KEY idx_booking_requests_user_status (channel, external_user_id, status),
  KEY idx_booking_requests_status_updated (status, updated_at),
  KEY idx_booking_requests_requested_date (requested_date, requested_time),
  CONSTRAINT fk_booking_requests_session
    FOREIGN KEY (session_id) REFERENCES bot_sessions(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_request_id BIGINT UNSIGNED NULL,
  session_id BIGINT UNSIGNED NULL,
  direction ENUM('in', 'out', 'system') NOT NULL,
  message_type VARCHAR(40) NOT NULL DEFAULT 'text',
  message_text TEXT NULL,
  dify_answer TEXT NULL,
  route_prefix VARCHAR(80) NULL,
  raw_payload JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_booking_messages_booking (booking_request_id, created_at),
  KEY idx_booking_messages_session (session_id, created_at),
  CONSTRAINT fk_booking_messages_request
    FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id)
    ON DELETE SET NULL,
  CONSTRAINT fk_booking_messages_session
    FOREIGN KEY (session_id) REFERENCES bot_sessions(id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS booking_audit_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_request_id BIGINT UNSIGNED NOT NULL,
  actor_type ENUM('bot', 'cro', 'system') NOT NULL,
  actor_id VARCHAR(191) NULL,
  action VARCHAR(80) NOT NULL,
  from_status VARCHAR(40) NULL,
  to_status VARCHAR(40) NULL,
  detail JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_booking_audit_request (booking_request_id, created_at),
  CONSTRAINT fk_booking_audit_request
    FOREIGN KEY (booking_request_id) REFERENCES booking_requests(id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
