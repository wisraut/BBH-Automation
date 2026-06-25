-- Hospital scale: expand users.role ENUM to support nurse and lab_staff
-- per CLAUDE.md rule (BBH = hospital, multi-role).
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0029_users_add_nurse_lab_staff.sql

ALTER TABLE users
  MODIFY COLUMN role
    ENUM('admin','doctor','cro','nurse','lab_staff') NOT NULL;
