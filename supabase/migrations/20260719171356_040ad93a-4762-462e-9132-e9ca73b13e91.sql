
-- Backfill legacy statuses into the simplified lifecycle
UPDATE public.feedback SET status = 'ready_to_send'
  WHERE status IN ('review','approved','queued','revision_required');
UPDATE public.feedback SET status = 'draft'
  WHERE status = 'rejected';

-- Rewrite notifications trigger for the new lifecycle
CREATE OR REPLACE FUNCTION public.tg_feedback_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  agent_user uuid;
  agent_name text;
BEGIN
  SELECT a.user_id, a.full_name INTO agent_user, agent_name
    FROM public.agents a WHERE a.id = NEW.agent_id;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'sent' THEN
      PERFORM public.create_notification(agent_user, 'feedback.sent',
        'New feedback received',
        COALESCE(NEW.title,'You have new feedback to review.'),
        '/portal/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'acknowledged' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.acknowledged',
        'Feedback acknowledged',
        COALESCE(agent_name,'Agent') || ' acknowledged the feedback.',
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.completed',
        'Feedback completed',
        COALESCE(NEW.title,'Feedback') || ' marked completed.',
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'failed' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.failed',
        'Feedback email failed to send',
        COALESCE(NEW.email_error, COALESCE(NEW.title,'Feedback') || ' could not be delivered — retry from the feedback page.'),
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END $function$;
