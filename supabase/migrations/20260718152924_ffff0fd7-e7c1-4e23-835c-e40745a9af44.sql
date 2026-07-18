
-- =========================================================
-- Email settings (singleton)
-- =========================================================
CREATE TABLE public.email_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton boolean NOT NULL DEFAULT true,
  provider text NOT NULL DEFAULT 'gmail',
  sender_name text NOT NULL DEFAULT 'QA Feedback',
  sender_email text,
  reply_to text,
  signature_html text,
  logo_url text,
  confidentiality_notice text DEFAULT 'This message contains confidential quality assurance information. If received in error, please delete and notify the sender.',
  enabled boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_settings_singleton_uniq UNIQUE (singleton)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;
ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email settings readable by admins"
  ON public.email_settings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "email settings manage by admins"
  ON public.email_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER email_settings_set_updated_at
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

INSERT INTO public.email_settings (singleton) VALUES (true);

-- =========================================================
-- Email queue
-- =========================================================
CREATE TABLE public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid REFERENCES public.feedback(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'feedback',
  to_email text NOT NULL,
  to_name text,
  subject text NOT NULL,
  html text NOT NULL,
  text_body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority smallint NOT NULL DEFAULT 5,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  provider text,
  provider_message_id text,
  created_by uuid REFERENCES auth.users(id),
  sent_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_queue_drain_idx
  ON public.email_queue (status, priority, next_attempt_at)
  WHERE status IN ('queued','failed');

CREATE INDEX email_queue_feedback_idx ON public.email_queue (feedback_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_queue TO authenticated;
GRANT ALL ON public.email_queue TO service_role;
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email queue readable by admins"
  ON public.email_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "email queue manage by admins"
  ON public.email_queue FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'));

CREATE TRIGGER email_queue_set_updated_at
  BEFORE UPDATE ON public.email_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- Feedback attachments
-- =========================================================
CREATE TABLE public.feedback_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX feedback_attachments_feedback_idx ON public.feedback_attachments (feedback_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_attachments TO authenticated;
GRANT ALL ON public.feedback_attachments TO service_role;
ALTER TABLE public.feedback_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feedback attachments readable by auth"
  ON public.feedback_attachments FOR SELECT TO authenticated USING (true);

CREATE POLICY "feedback attachments manage by admins"
  ON public.feedback_attachments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'qa_admin') OR public.has_role(auth.uid(), 'super_admin'));

-- =========================================================
-- Cron: drain email queue every minute
-- =========================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove prior job if it exists (idempotent re-run safety)
DO $$
BEGIN
  PERFORM cron.unschedule('drain-email-queue');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'drain-email-queue',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ee9ab798-a4f8-4621-a924-2bc91cf49061.lovable.app/api/public/hooks/drain-email-queue',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlheGdibmxwandzcmd1cGN3YWNsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzODMyMjIsImV4cCI6MjA5OTk1OTIyMn0.M9oaUHnyQFeSLdZ_hswUsTz8SZS7PsAGgsfT00LUjOU"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);
