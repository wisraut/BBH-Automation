-- Hospital scale: keep notification role targets aligned with users.role.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0032_notifications_hospital_roles.sql

ALTER TABLE notifications
  MODIFY COLUMN role
    ENUM('admin','doctor','cro','nurse','lab_staff') NULL;
