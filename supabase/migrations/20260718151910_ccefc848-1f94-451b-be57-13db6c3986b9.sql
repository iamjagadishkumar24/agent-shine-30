
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS open_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS click_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_reminder_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text;

CREATE TABLE IF NOT EXISTS public.feedback_email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS feedback_email_events_feedback_id_idx ON public.feedback_email_events(feedback_id, created_at DESC);

GRANT SELECT ON public.feedback_email_events TO authenticated;
GRANT ALL ON public.feedback_email_events TO service_role;
ALTER TABLE public.feedback_email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email events readable by auth" ON public.feedback_email_events
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa admins manage email events" ON public.feedback_email_events
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'qa_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'qa_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
