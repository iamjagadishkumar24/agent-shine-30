
ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounce_reason text,
  ADD COLUMN IF NOT EXISTS complained_at timestamptz,
  ADD COLUMN IF NOT EXISTS complaint_reason text,
  ADD COLUMN IF NOT EXISTS deferred_until timestamptz,
  ADD COLUMN IF NOT EXISTS defer_reason text,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_status text;

CREATE INDEX IF NOT EXISTS email_queue_provider_msg_idx
  ON public.email_queue (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.email_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_type text,
  provider_message_id text,
  recipient text,
  signature_valid boolean NOT NULL DEFAULT false,
  matched_queue_id uuid REFERENCES public.email_queue(id) ON DELETE SET NULL,
  matched_feedback_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_webhook_events_created_idx
  ON public.email_webhook_events (created_at DESC);
CREATE INDEX IF NOT EXISTS email_webhook_events_msg_idx
  ON public.email_webhook_events (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_webhook_events_provider_idx
  ON public.email_webhook_events (provider, created_at DESC);

GRANT SELECT ON public.email_webhook_events TO authenticated;
GRANT ALL ON public.email_webhook_events TO service_role;

ALTER TABLE public.email_webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "webhook events readable by admins"
  ON public.email_webhook_events FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'qa_admin'::app_role) OR has_role(auth.uid(), 'super_admin'::app_role));
