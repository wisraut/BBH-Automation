-- 0031_kb_book_chunks.sql
-- Reference-book chunks for the medical/CONSULT + patient-summary RAG lane.
--
-- Kept in a SEPARATE table from kb_chunks (customer FAQ) on purpose: a patient
-- asking an FAQ ("what time do you open") must never retrieve a textbook page.
-- The FAQ lane keeps searching kb_chunks untouched; the medical lane searches
-- this table. Same embedding model + dim as FAQ (BAAI/bge-m3, 1024) so the
-- vectors are directly comparable.
CREATE TABLE IF NOT EXISTS kb_book_chunks (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source      VARCHAR(191)  NOT NULL,            -- book filename (ingest unit)
  title       VARCHAR(500)  DEFAULT NULL,        -- book display title
  section     VARCHAR(191)  DEFAULT NULL,        -- heading (markdown) or NULL
  page        INT           DEFAULT NULL,        -- source page (PDF) for citation
  chunk_text  TEXT          NOT NULL,
  embedding   JSON          NOT NULL,
  embed_model VARCHAR(120)  NOT NULL,
  dim         INT           NOT NULL,
  created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_kbbook_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
