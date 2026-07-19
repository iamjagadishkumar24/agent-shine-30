-- 1. Extend coaching_status enum
ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'pending_approval';
ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'confirmed';
ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'in_progress';
ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'missed';
ALTER TYPE public.coaching_status ADD VALUE IF NOT EXISTS 'rescheduled';

-- 2. Priority enum
DO $$ BEGIN
  CREATE TYPE public.coaching_priority AS ENUM ('low','medium','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Session type enum
DO $$ BEGIN
  CREATE TYPE public.coaching_session_type AS ENUM ('coaching','review','one_on_one','training','follow_up');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. New columns
ALTER TABLE public.coaching_sessions
  ADD COLUMN IF NOT EXISTS priority public.coaching_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS session_type public.coaching_session_type NOT NULL DEFAULT 'coaching',
  ADD COLUMN IF NOT EXISTS meeting_link text,
  ADD COLUMN IF NOT EXISTS meeting_location text,
  ADD COLUMN IF NOT EXISTS agenda text,
  ADD COLUMN IF NOT EXISTS follow_up_date date,
  ADD COLUMN IF NOT EXISTS reminder_minutes integer,
  ADD COLUMN IF NOT EXISTS rescheduled_from_id uuid REFERENCES public.coaching_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_reason text;

CREATE INDEX IF NOT EXISTS idx_coaching_sessions_status ON public.coaching_sessions(status);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_coach ON public.coaching_sessions(coach_id);

-- 5. Overlap prevention trigger
CREATE OR REPLACE FUNCTION public.tg_coaching_prevent_overlap()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  new_end timestamptz := NEW.scheduled_at + make_interval(mins => COALESCE(NEW.duration_minutes, 30));
  conflict_id uuid;
BEGIN
  IF NEW.status IN ('cancelled','canceled','rescheduled','missed','completed') THEN
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
END $$;

DROP TRIGGER IF EXISTS trg_coaching_prevent_overlap ON public.coaching_sessions;
CREATE TRIGGER trg_coaching_prevent_overlap
  BEFORE INSERT OR UPDATE OF scheduled_at, duration_minutes, agent_id, coach_id, status
  ON public.coaching_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_coaching_prevent_overlap();

-- 6. Cancel/reschedule notifications extension
CREATE OR REPLACE FUNCTION public.tg_coaching_session_notifications()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NEW.status = 'canceled' OR NEW.status = 'cancelled' THEN
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
END $$;

DROP TRIGGER IF EXISTS trg_coaching_session_notifications ON public.coaching_sessions;
CREATE TRIGGER trg_coaching_session_notifications
  AFTER INSERT OR UPDATE ON public.coaching_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_coaching_session_notifications();

-- 7. Realtime
ALTER TABLE public.coaching_sessions REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.coaching_sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
