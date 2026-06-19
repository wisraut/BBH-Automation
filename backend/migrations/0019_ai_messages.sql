-- Phase 2 - Messages inside BBH AI conversations (schema only)

CREATE TABLE IF NOT EXISTS ai_messages (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversation_id  INT UNSIGNED NOT NULL,
    role             ENUM('user','assistant') NOT NULL,
    content          TEXT NOT NULL,
    sources          JSON NULL,
    tokens_used      INT UNSIGNED NULL,
    latency_ms       INT UNSIGNED NULL,
    created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_ai_messages_conversation_created (conversation_id, created_at),
    CONSTRAINT fk_ai_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES ai_conversations(id)
        ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
