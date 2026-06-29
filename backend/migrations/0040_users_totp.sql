-- TOTP 2FA support for users (especially admin per PDPA/insurance audit).
-- secret is base32 (RFC 4226). enrolled_at = when user confirmed setup.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0040_users_totp.sql

ALTER TABLE users
    ADD COLUMN totp_secret       VARCHAR(64) NULL,
    ADD COLUMN totp_enabled      TINYINT(1) NOT NULL DEFAULT 0,
    ADD COLUMN totp_enrolled_at  DATETIME NULL;
