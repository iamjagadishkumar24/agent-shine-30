
CREATE TABLE public.feedback_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  from_status feedback_status,
  to_status feedback_status,
  comment text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.feedback_audit_log TO authenticated;
GRANT ALL ON public.feedback_audit_log TO service_role;

ALTER TABLE public.feedback_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read audit log"
  ON public.feedback_audit_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can insert their own audit entries"
  ON public.feedback_audit_log FOR INSERT TO authenticated
  WITH CHECK (actor_id = auth.uid());

CREATE INDEX idx_feedback_audit_log_feedback ON public.feedback_audit_log(feedback_id, created_at DESC);
