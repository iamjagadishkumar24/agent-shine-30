
-- 1. Rename department
UPDATE public.agents SET department = 'Customer Success' WHERE department = 'QA';

-- 2. Personal iCal feed tokens
CREATE TABLE public.calendar_feed_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

GRANT SELECT, INSERT, DELETE ON public.calendar_feed_tokens TO authenticated;
GRANT ALL ON public.calendar_feed_tokens TO service_role;

ALTER TABLE public.calendar_feed_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own feed tokens"
  ON public.calendar_feed_tokens
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX calendar_feed_tokens_token_idx ON public.calendar_feed_tokens(token);
CREATE INDEX calendar_feed_tokens_user_idx ON public.calendar_feed_tokens(user_id);
