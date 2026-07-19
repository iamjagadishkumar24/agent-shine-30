CREATE OR REPLACE FUNCTION public.tg_feedback_notifications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  agent_user uuid;
  agent_name text;
  reviewer_ids uuid[];
  uid uuid;
BEGIN
  SELECT a.user_id, a.full_name INTO agent_user, agent_name
    FROM public.agents a WHERE a.id = NEW.agent_id;

  IF TG_OP = 'INSERT' AND NEW.status = 'review' THEN
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
    IF NEW.status = 'review' THEN
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
END $function$;