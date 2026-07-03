-- Remove the Dify health-check alert rule.
--
-- Dify has been removed from every runtime path (LINE bot uses own RAG,
-- Web AI + pre-visit summary call rag.llm directly). The Dify containers
-- are stopped, so `bridge_dify_disconnected` would fire a critical alert on
-- every evaluator run forever. Disable the rule and resolve any alert it
-- left open. The evaluator function was also deleted in code.
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0046_remove_dify_alert_rule.sql

UPDATE admin_alert_rules
SET enabled = 0
WHERE rule_key = 'bridge_dify_disconnected';

UPDATE admin_alerts
SET status = 'resolved',
    resolved_at = NOW(),
    resolved_reason = 'rule_disabled'
WHERE rule_key = 'bridge_dify_disconnected'
  AND status IN ('open', 'acknowledged');
