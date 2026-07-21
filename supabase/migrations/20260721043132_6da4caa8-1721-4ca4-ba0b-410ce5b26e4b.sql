-- Phase A: Lock down SECURITY DEFINER functions.
-- Only public.has_role should be callable by authenticated users.
-- Trigger functions run as owner when triggers fire and never need EXECUTE from users.
-- Internal helpers (create_notification, recalc_agent_qa_score) are only called from
-- other SECURITY DEFINER functions or triggers. run_security_definer_audit runs from
-- pg_cron as the postgres owner. handle_new_user is an auth trigger.

REVOKE EXECUTE ON FUNCTION public.create_notification(uuid, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_agent_qa_score(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.run_security_definer_audit() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_coaching_session_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_export_job_notify() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_assign_case_number() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_notifications() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_qa_rollup() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_scores_recalc() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_sync_ack_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_goal_progress_apply() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Keep has_role executable by authenticated (used inside RLS policies).
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;