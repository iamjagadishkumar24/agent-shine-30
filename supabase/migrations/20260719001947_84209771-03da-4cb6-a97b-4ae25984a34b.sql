
ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS feedback_template_subject text,
  ADD COLUMN IF NOT EXISTS feedback_template_html text,
  ADD COLUMN IF NOT EXISTS feedback_template_text text,
  ADD COLUMN IF NOT EXISTS feedback_template_enabled boolean NOT NULL DEFAULT false;
