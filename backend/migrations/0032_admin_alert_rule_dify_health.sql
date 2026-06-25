-- Add rule: bridge_dify_disconnected
--
-- Critical/integration alert that fires when bridge cannot reach Dify
-- (GET /v1/info) for `consecutive_fails` evaluator runs in a row
-- (default 2 runs × 60s recheck = ~2 minutes downtime).
--
-- ack_policy=auto_close: clears automatically once Dify is reachable again.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0032_admin_alert_rule_dify_health.sql

INSERT IGNORE INTO admin_alert_rules
    (rule_key, display_name, description, category, severity,
     threshold_json, evaluator, ack_policy, recheck_seconds, notify_channels)
VALUES
('bridge_dify_disconnected',
 'Bridge ติดต่อ Dify ไม่ได้',
 'GET /v1/info ของ Dify ตอบ timeout หรือ non-2xx/401 ต่อเนื่อง — แปลว่า AI ของระบบใช้งานไม่ได้ ทุก LINE/Web request ที่ไป Dify จะ fail. ตรวจ docker logs docker-api-1 หรือ restart docker-nginx-1 (IP shuffle)',
 'integration', 'critical',
 JSON_OBJECT('consecutive_fails', 2, 'timeout_seconds', 5),
 'eval_bridge_dify_disconnected',
 'auto_close',
 60,
 JSON_ARRAY('email'));
