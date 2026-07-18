
REVOKE ALL ON FUNCTION public.create_notification(uuid,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_feedback_notifications() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tg_coaching_session_notifications() FROM PUBLIC, anon, authenticated;
