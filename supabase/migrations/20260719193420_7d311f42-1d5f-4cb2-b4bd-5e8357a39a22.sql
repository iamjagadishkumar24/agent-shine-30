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
        'New feedback assigned',
        COALESCE(NEW.title,'You have new feedback to review.'),
        '/portal/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'acknowledged' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.acknowledged',
        'Feedback acknowledged',
        COALESCE(agent_name,'Agent') || ' acknowledged the feedback.',
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

CREATE OR REPLACE FUNCTION public.tg_coaching_session_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE agent_user uuid;
BEGIN
  SELECT a.user_id INTO agent_user FROM public.agents a WHERE a.id = NEW.agent_id;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(agent_user, 'coaching.scheduled',
      'Coaching session scheduled',
      COALESCE(NEW.topic,'A new coaching session was scheduled.'),
      '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.create_notification(NEW.coach_id, 'coaching.assigned',
        'You have been assigned as coach',
        COALESCE(NEW.topic,'New coaching assignment'),
        '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'canceled' THEN
      PERFORM public.create_notification(agent_user, 'coaching.cancelled',
        'Coaching session cancelled',
        COALESCE(NEW.cancelled_reason, NEW.topic, 'A coaching session was cancelled.'),
        '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    ELSIF NEW.status = 'rescheduled' THEN
      PERFORM public.create_notification(agent_user, 'coaching.rescheduled',
        'Coaching session rescheduled',
        COALESCE(NEW.topic,'A coaching session was rescheduled.'),
        '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.scheduled_at IS DISTINCT FROM OLD.scheduled_at OR NEW.duration_minutes IS DISTINCT FROM OLD.duration_minutes)
     AND NEW.status = OLD.status
     AND agent_user IS NOT NULL THEN
    PERFORM public.create_notification(agent_user, 'coaching.rescheduled',
      'Coaching session time changed',
      COALESCE(NEW.topic,'The time of your coaching session changed.'),
      '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
  END IF;

  RETURN NEW;
END $function$;

-- Retroactively hide any previously-created routine notification rows.
UPDATE public.notifications
   SET read_at = COALESCE(read_at, now())
 WHERE type IN ('feedback.completed', 'coaching.completed')
   AND read_at IS NULL;