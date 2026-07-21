
-- Periodic audit of SECURITY DEFINER function grants
CREATE TABLE IF NOT EXISTS public.security_definer_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at timestamptz NOT NULL DEFAULT now(),
  function_name text NOT NULL,
  granted_role text NOT NULL,
  status text NOT NULL, -- 'unexpected_grant' | 'ok'
  details jsonb
);

GRANT SELECT ON public.security_definer_audit TO authenticated;
GRANT ALL ON public.security_definer_audit TO service_role;
ALTER TABLE public.security_definer_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins can view security audit"
  ON public.security_definer_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'master_admin'));

CREATE INDEX IF NOT EXISTS security_definer_audit_checked_at_idx
  ON public.security_definer_audit (checked_at DESC);

-- Audit function: only public.has_role may be EXECUTEd by 'authenticated'
CREATE OR REPLACE FUNCTION public.run_security_definer_audit()
RETURNS TABLE(function_name text, granted_role text, status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  offending record;
  found_count int := 0;
BEGIN
  FOR offending IN
    SELECT p.proname::text AS fname,
           (aclexplode(p.proacl)).grantee::regrole::text AS grantee,
           (aclexplode(p.proacl)).privilege_type AS priv
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
  LOOP
    IF offending.priv = 'EXECUTE'
       AND offending.grantee IN ('authenticated','anon','public')
       AND NOT (offending.fname = 'has_role' AND offending.grantee = 'authenticated')
    THEN
      INSERT INTO public.security_definer_audit(function_name, granted_role, status, details)
      VALUES (offending.fname, offending.grantee, 'unexpected_grant',
              jsonb_build_object('privilege', offending.priv));
      found_count := found_count + 1;
      function_name := offending.fname;
      granted_role := offending.grantee;
      status := 'unexpected_grant';
      RETURN NEXT;
    END IF;
  END LOOP;

  IF found_count = 0 THEN
    INSERT INTO public.security_definer_audit(function_name, granted_role, status, details)
    VALUES ('*', 'authenticated', 'ok', jsonb_build_object('message','No unexpected grants'));
  ELSE
    -- Notify all master admins
    INSERT INTO public.notifications(user_id, type, title, body, link, entity_type, entity_id)
    SELECT ur.user_id,
           'security.alert',
           'Security alert: unexpected SECURITY DEFINER grant',
           format('%s SECURITY DEFINER function(s) newly executable by non-privileged roles. Review security audit log.', found_count),
           '/health',
           'security_audit',
           NULL
    FROM public.user_roles ur
    WHERE ur.role = 'master_admin';
  END IF;

  RETURN;
END $$;

REVOKE EXECUTE ON FUNCTION public.run_security_definer_audit() FROM PUBLIC, anon, authenticated;

-- Schedule daily at 03:00 UTC
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('security-definer-audit-daily')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'security-definer-audit-daily');
    PERFORM cron.schedule(
      'security-definer-audit-daily',
      '0 3 * * *',
      $cron$ SELECT public.run_security_definer_audit(); $cron$
    );
  END IF;
END $$;

-- Run once now to seed baseline
SELECT public.run_security_definer_audit();
