
CREATE SEQUENCE IF NOT EXISTS public.feedback_case_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS case_number text,
  ADD COLUMN IF NOT EXISTS acknowledgement_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS acknowledgement_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS agent_response_received_at timestamptz;

CREATE OR REPLACE FUNCTION public.tg_feedback_assign_case_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq bigint;
BEGIN
  IF NEW.case_number IS NULL OR NEW.case_number = '' THEN
    next_seq := nextval('public.feedback_case_number_seq');
    NEW.case_number := 'QA-' || to_char(NOW(), 'YYYY') || '-' || lpad(next_seq::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_assign_case_number ON public.feedback;
CREATE TRIGGER feedback_assign_case_number
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.tg_feedback_assign_case_number();

DO $$
DECLARE
  r record;
  n bigint;
BEGIN
  FOR r IN SELECT id, created_at FROM public.feedback WHERE case_number IS NULL OR case_number = '' ORDER BY created_at ASC LOOP
    n := nextval('public.feedback_case_number_seq');
    UPDATE public.feedback
      SET case_number = 'QA-' || to_char(r.created_at, 'YYYY') || '-' || lpad(n::text, 6, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE public.feedback ALTER COLUMN case_number SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS feedback_case_number_uniq ON public.feedback (case_number);

ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS first_reminder_after_days integer NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS second_reminder_after_days integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS overdue_after_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS max_reminders integer NOT NULL DEFAULT 3;

UPDATE public.email_settings
  SET reply_to = 'itsjack2025@gmail.com'
  WHERE singleton = true AND (reply_to IS NULL OR reply_to = '');

CREATE TABLE IF NOT EXISTS public.feedback_email_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid REFERENCES public.feedback(id) ON DELETE CASCADE,
  case_number text NOT NULL,
  sender_email text NOT NULL,
  recipient_email text,
  subject text,
  message_body text,
  provider_message_id text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feedback_email_responses TO authenticated;
GRANT ALL ON public.feedback_email_responses TO service_role;
ALTER TABLE public.feedback_email_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "responses readable by qa staff" ON public.feedback_email_responses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'qa_admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'team_manager')
  );
CREATE INDEX IF NOT EXISTS feedback_email_responses_case_number_idx ON public.feedback_email_responses (case_number);
CREATE INDEX IF NOT EXISTS feedback_email_responses_feedback_id_idx ON public.feedback_email_responses (feedback_id);

CREATE TABLE IF NOT EXISTS public.feedback_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  reminder_number integer NOT NULL,
  recipient_email text NOT NULL,
  subject text,
  delivery_status text NOT NULL DEFAULT 'queued',
  failure_reason text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.feedback_reminders TO authenticated;
GRANT ALL ON public.feedback_reminders TO service_role;
ALTER TABLE public.feedback_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reminders readable by qa staff" ON public.feedback_reminders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'qa_admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'team_manager')
  );
CREATE INDEX IF NOT EXISTS feedback_reminders_feedback_id_idx ON public.feedback_reminders (feedback_id);

CREATE OR REPLACE FUNCTION public.tg_feedback_sync_ack_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.acknowledged_at IS NOT NULL THEN
    NEW.acknowledgement_status := 'acknowledged';
  ELSIF NEW.agent_response_received_at IS NOT NULL THEN
    NEW.acknowledgement_status := 'response_received';
  ELSIF NEW.acknowledgement_due_at IS NOT NULL AND NEW.acknowledgement_due_at < now() THEN
    NEW.acknowledgement_status := 'overdue';
  ELSIF NEW.acknowledgement_status IS NULL OR NEW.acknowledgement_status = '' THEN
    NEW.acknowledgement_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS feedback_sync_ack_status ON public.feedback;
CREATE TRIGGER feedback_sync_ack_status
  BEFORE INSERT OR UPDATE OF acknowledged_at, agent_response_received_at, acknowledgement_due_at
  ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.tg_feedback_sync_ack_status();
