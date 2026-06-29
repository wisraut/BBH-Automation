-- Roll back 0040 — 2FA feature parked.
-- Drops the three TOTP columns that 0040 added to users. Safe because
-- no user had totp_enabled = 1 (verified before drop).
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0041_drop_users_totp.sql

ALTER TABLE users
    DROP COLUMN totp_enrolled_at,
    DROP COLUMN totp_enabled,
    DROP COLUMN totp_secret;
