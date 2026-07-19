
ALTER TABLE public.email_settings
  ADD COLUMN IF NOT EXISTS dev_override_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dev_override_recipient text;

ALTER TABLE public.email_queue
  ADD COLUMN IF NOT EXISTS to_email_intended text;

UPDATE public.email_settings
  SET sender_email = COALESCE(NULLIF(sender_email,''), 'itsjack2025@gmail.com'),
      dev_override_recipient = COALESCE(dev_override_recipient, 'Iamjagadishkumar@gmail.com'),
      dev_override_enabled = true
  WHERE singleton = true;
