
-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, created_at DESC) WHERE read_at IS NULL;

GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Helper to notify a user
CREATE OR REPLACE FUNCTION public.create_notification(
  _user_id uuid, _type text, _title text, _body text, _link text,
  _entity_type text, _entity_id uuid
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RETURN; END IF;
  INSERT INTO public.notifications(user_id, type, title, body, link, entity_type, entity_id)
  VALUES (_user_id, _type, _title, _body, _link, _entity_type, _entity_id);
END $$;

-- Trigger on feedback status transitions
CREATE OR REPLACE FUNCTION public.tg_feedback_notifications()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  agent_user uuid;
  agent_name text;
  reviewer_ids uuid[];
  uid uuid;
BEGIN
  SELECT a.user_id, a.full_name INTO agent_user, agent_name
    FROM public.agents a WHERE a.id = NEW.agent_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'pending_review' THEN
    -- notify all qa_managers and qa_admins
    SELECT array_agg(user_id) INTO reviewer_ids FROM public.user_roles
      WHERE role IN ('qa_manager','qa_admin');
    IF reviewer_ids IS NOT NULL THEN
      FOREACH uid IN ARRAY reviewer_ids LOOP
        PERFORM public.create_notification(uid, 'feedback.pending_review',
          'Feedback awaiting review',
          COALESCE(NEW.title,'New feedback') || ' — ' || COALESCE(agent_name,'agent'),
          '/approvals', 'feedback', NEW.id);
      END LOOP;
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'pending_review' THEN
      SELECT array_agg(user_id) INTO reviewer_ids FROM public.user_roles
        WHERE role IN ('qa_manager','qa_admin');
      IF reviewer_ids IS NOT NULL THEN
        FOREACH uid IN ARRAY reviewer_ids LOOP
          PERFORM public.create_notification(uid, 'feedback.pending_review',
            'Feedback awaiting review',
            COALESCE(NEW.title,'Feedback') || ' — ' || COALESCE(agent_name,'agent'),
            '/approvals', 'feedback', NEW.id);
        END LOOP;
      END IF;
    ELSIF NEW.status = 'approved' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.approved',
        'Feedback approved',
        COALESCE(NEW.title,'Your feedback') || ' was approved.',
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'rejected' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.rejected',
        'Feedback rejected',
        COALESCE(NEW.reviewer_notes,'Reviewer requested changes.'),
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'revision_required' THEN
      PERFORM public.create_notification(NEW.created_by, 'feedback.revision_required',
        'Revisions requested',
        COALESCE(NEW.reviewer_notes,'Reviewer requested revisions.'),
        '/feedback/' || NEW.id::text, 'feedback', NEW.id);
    ELSIF NEW.status = 'sent' THEN
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
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER trg_feedback_notifications
AFTER INSERT OR UPDATE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.tg_feedback_notifications();

-- Trigger on coaching session assignment
CREATE OR REPLACE FUNCTION public.tg_coaching_session_notifications()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE agent_user uuid;
BEGIN
  SELECT a.user_id INTO agent_user FROM public.agents a WHERE a.id = NEW.agent_id;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.create_notification(agent_user, 'coaching.scheduled',
      'Coaching session scheduled',
      COALESCE(NEW.title,'A new coaching session was scheduled.'),
      '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    IF NEW.coach_id IS NOT NULL AND NEW.coach_id <> COALESCE(NEW.created_by, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.create_notification(NEW.coach_id, 'coaching.assigned',
        'You have been assigned as coach',
        COALESCE(NEW.title,'New coaching assignment'),
        '/coaching/' || NEW.id::text, 'coaching_session', NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_coaching_session_notifications
AFTER INSERT ON public.coaching_sessions
FOR EACH ROW EXECUTE FUNCTION public.tg_coaching_session_notifications();
