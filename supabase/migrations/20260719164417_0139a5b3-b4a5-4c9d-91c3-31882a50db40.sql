
ALTER TABLE public.feedback_audit_log ALTER COLUMN actor_id DROP NOT NULL;

-- RLS: allow authenticated users to insert their own entries OR system entries (actor_id null via service role only — RLS bypassed for service role).
DROP POLICY IF EXISTS "Users can insert their own audit entries" ON public.feedback_audit_log;
CREATE POLICY "Users can insert audit entries"
  ON public.feedback_audit_log
  FOR INSERT
  TO authenticated
  WITH CHECK (actor_id = auth.uid());

-- Backfill: mark delivered_at for Gmail-sent rows where provider accepted (sent_at present, no error, delivered_at null).
UPDATE public.feedback
SET delivered_at = sent_at
WHERE sent_at IS NOT NULL
  AND delivered_at IS NULL
  AND (email_error IS NULL OR email_error = '')
  AND status IN ('sent','acknowledged','completed');

UPDATE public.email_queue
SET delivered_at = sent_at
WHERE sent_at IS NOT NULL
  AND delivered_at IS NULL
  AND status = 'sent'
  AND provider = 'gmail';
