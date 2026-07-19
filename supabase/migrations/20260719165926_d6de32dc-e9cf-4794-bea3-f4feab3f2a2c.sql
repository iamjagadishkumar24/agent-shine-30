
CREATE OR REPLACE FUNCTION public.tg_coaching_prevent_overlap()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  new_end timestamptz := NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 30));
  conflict_id uuid;
BEGIN
  IF NEW.status IN ('canceled','rescheduled','missed','completed') THEN
    RETURN NEW;
  END IF;

  SELECT s.id INTO conflict_id
  FROM public.coaching_sessions s
  WHERE s.id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND s.status NOT IN ('canceled','rescheduled','missed','completed')
    AND (s.agent_id = NEW.agent_id OR (NEW.coach_id IS NOT NULL AND s.coach_id = NEW.coach_id))
    AND s.scheduled_at < new_end
    AND (s.scheduled_at + make_interval(mins => COALESCE(s.duration_minutes, 30))) > NEW.scheduled_at
  LIMIT 1;

  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'This time overlaps another session (id=%). Pick a different slot.', conflict_id
      USING ERRCODE = 'check_violation';
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
    ELSIF NEW.status = 'completed' THEN
      PERFORM public.create_notification(agent_user, 'coaching.completed',
        'Coaching session completed',
        COALESCE(NEW.topic,'A coaching session was marked completed.'),
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
