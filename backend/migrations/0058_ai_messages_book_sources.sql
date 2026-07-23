-- Persist textbook citations (book_sources) on the staff AI assistant's answers.
--
-- When an in-domain question routes through the Book RAG gate, the answer is
-- grounded by one or more medical-textbook chunks. Those citations were only
-- streamed live (SSE) and lost on reload. Store them on the assistant message
-- row so the footnote survives reload / shows on another device, now that chat
-- history lives on the server.
--
-- Shape: JSON array of {title, page} — answer-level grounding, de-duplicated by
-- (title, page); mirrors the `book_sources` payload built in ai_service._book_context.
-- NULL for turns with no textbook grounding (greeting / FAQ / non-medical), which
-- is the common case.
ALTER TABLE ai_messages
    ADD COLUMN book_sources JSON NULL AFTER image_thumb;
