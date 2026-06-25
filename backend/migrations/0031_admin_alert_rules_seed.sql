-- Seed initial 5 alert rules for the admin dashboard "Action Required" panel.
-- Idempotent via INSERT IGNORE (rule_key is PK).
--
-- Apply: docker exec -i hospital-bot-ops-db mysql -u root -p<root_pw> bbh_bot_ops < 0031_admin_alert_rules_seed.sql

INSERT IGNORE INTO admin_alert_rules
    (rule_key, display_name, description, category, severity,
     threshold_json, evaluator, ack_policy, recheck_seconds, notify_channels)
VALUES
('stuck_report',
 'Reports stuck in analyzing',
 'patient_reports rows whose AI analyze step has been holding the lock past threshold. Usually means Dify or evaluator job died mid-run.',
 'operations', 'warning',
 JSON_OBJECT('minutes', 5),
 'eval_stuck_reports',
 'auto_close',
 60,
 NULL),

('cro_approval_stale',
 'Pending CRO approvals exceeding SLA',
 'booking_requests stuck in pending_approval longer than SLA. CRO must approve/reject so patient gets timely response.',
 'operations', 'warning',
 JSON_OBJECT('hours', 24),
 'eval_stale_cro_approvals',
 'auto_close',
 300,
 NULL),

('failed_line_push',
 'Failed LINE pushes in last hour',
 'line_push_log entries with status=failed in the recent window. Often signals invalid LINE token, deactivated user, or webhook outage.',
 'integration', 'critical',
 JSON_OBJECT('window_minutes', 60, 'min_count', 1),
 'eval_failed_line_pushes',
 'manual',
 60,
 JSON_ARRAY('email')),

('unassigned_patient',
 'Patients without primary doctor',
 'patients rows that have no doctor assigned (created_by-only) and no doctor_reports trail. Admin should triage assignment.',
 'data_quality', 'info',
 JSON_OBJECT(),
 'eval_unassigned_patients',
 'sticky',
 3600,
 NULL),

('disabled_user_active_session',
 'Disabled users still holding active sessions',
 'users.is_active=0 but bot_sessions/JWT still active. Security risk — must force-logout.',
 'security', 'critical',
 JSON_OBJECT(),
 'eval_disabled_user_sessions',
 'manual',
 300,
 JSON_ARRAY('email'));
