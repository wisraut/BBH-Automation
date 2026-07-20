-- Server-side image attachments for the staff AI chat.
--
-- The full image is sent to the model transiently and never stored. Only a
-- downscaled preview (data URL, ~100-200KB) is kept so the conversation still
-- shows the attached image after reload / on another device, now that chat
-- history lives on the server instead of localStorage.
ALTER TABLE ai_messages
    ADD COLUMN image_thumb MEDIUMTEXT NULL AFTER content;
