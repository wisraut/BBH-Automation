-- Own-RAG knowledge base: FAQ chunks + their embeddings.
--
-- Vectors are stored as JSON arrays; search is brute-force cosine in Python
-- (see backend/rag/vector_store.py). Fine for a small FAQ (hundreds of
-- chunks). embed_model + dim let us re-ingest when we swap the embedding
-- model (e5-small -> BGE-M3 at cutover) without schema changes.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0045_kb_chunks.sql

CREATE TABLE IF NOT EXISTS kb_chunks (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    source VARCHAR(191) NOT NULL,           -- e.g. 'BBH_MAIN_BOT_FAQ.md'
    section VARCHAR(191) NULL,              -- nearest heading above the chunk
    title VARCHAR(500) NULL,                -- the FAQ question
    chunk_text TEXT NOT NULL,               -- question + answer
    embedding JSON NOT NULL,                -- vector as JSON array of floats
    embed_model VARCHAR(120) NOT NULL,      -- model that produced the vector
    dim INT NOT NULL,                       -- vector length (384 e5 / 1024 bge-m3)
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_kb_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
