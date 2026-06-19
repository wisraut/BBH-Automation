-- Phase 2 - Staff conversations with BBH AI (schema only)

CREATE TABLE IF NOT EXISTS ai_conversations (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id               INT UNSIGNED NOT NULL,
    dify_conversation_id  VARCHAR(191) NULL,
    title                 VARCHAR(255) NULL,
    context_patient_id    INT UNSIGNED NULL,
    created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ai_conversations_user_created (user_id, created_at),
    INDEX idx_ai_conversations_context_patient (context_patient_id),
    CONSTRAINT fk_ai_conversations_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ai_conversations_context_patient
        FOREIGN KEY (context_patient_id) REFERENCES patients(id)
        ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
