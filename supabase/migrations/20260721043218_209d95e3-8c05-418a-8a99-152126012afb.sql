-- Rate limiting: sliding-window counter table + SECURITY DEFINER check function.
-- Server functions call public.check_rate_limit(bucket, key, limit, window_seconds)
-- which atomically inserts a row and returns whether the caller is over-limit.

CREATE TABLE IF NOT EXISTS public.rate_limits (
  id bigserial PRIMARY KEY,
  bucket text NOT NULL,
  key text NOT NULL,
  hit_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;
-- No grants for anon/authenticated: only accessed via SECURITY DEFINER function.

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- No policies → authenticated/anon cannot read or write directly.

CREATE INDEX IF NOT EXISTS idx_rate_limits_bucket_key_time
  ON public.rate_limits (bucket, key, hit_at DESC);

-- Housekeeping: keep table small. Not a scheduled job — pruning happens
-- opportunistically inside check_rate_limit for the queried window.

CREATE OR REPLACE FUNCTION public.check_rate_limit(
  _bucket text,
  _key text,
  _limit int,
  _window_seconds int
)
RETURNS TABLE(allowed boolean, remaining int, retry_after_seconds int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  window_start timestamptz := now() - make_interval(secs => _window_seconds);
  used int;
  oldest timestamptz;
BEGIN
  -- Prune old rows for this (bucket,key) so the table stays lean.
  DELETE FROM public.rate_limits
   WHERE bucket = _bucket AND key = _key AND hit_at < window_start;

  SELECT COUNT(*) INTO used
    FROM public.rate_limits
   WHERE bucket = _bucket AND key = _key AND hit_at >= window_start;

  IF used >= _limit THEN
    SELECT MIN(hit_at) INTO oldest
      FROM public.rate_limits
     WHERE bucket = _bucket AND key = _key AND hit_at >= window_start;
    allowed := false;
    remaining := 0;
    retry_after_seconds := GREATEST(1,
      _window_seconds - EXTRACT(EPOCH FROM (now() - oldest))::int
    );
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.rate_limits(bucket, key) VALUES (_bucket, _key);
  allowed := true;
  remaining := _limit - used - 1;
  retry_after_seconds := 0;
  RETURN NEXT;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, int, int) TO service_role;