
-- ============================================================
-- AUTHORISED USERS
-- ============================================================
CREATE TABLE public.authorised_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text,
  role public.app_role NOT NULL DEFAULT 'viewer',
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','suspended','revoked')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  invited_at timestamptz,
  invitation_accepted_at timestamptz,
  invitation_expires_at timestamptz,
  last_login_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX authorised_users_email_lower_idx ON public.authorised_users (lower(email));
CREATE INDEX authorised_users_user_id_idx ON public.authorised_users (user_id);
CREATE INDEX authorised_users_status_idx ON public.authorised_users (status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorised_users TO authenticated;
GRANT ALL ON public.authorised_users TO service_role;
ALTER TABLE public.authorised_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage authorised users" ON public.authorised_users
  FOR ALL USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));
CREATE POLICY "Users read own authorised record" ON public.authorised_users
  FOR SELECT USING (user_id = auth.uid() OR lower(email) = lower((auth.jwt()->>'email')));

CREATE TRIGGER authorised_users_updated_at BEFORE UPDATE ON public.authorised_users
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- USER INVITATIONS
-- ============================================================
CREATE TABLE public.user_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'viewer',
  token text NOT NULL UNIQUE,
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_invitations_email_idx ON public.user_invitations (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_invitations TO authenticated;
GRANT ALL ON public.user_invitations TO service_role;
ALTER TABLE public.user_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins manage invitations" ON public.user_invitations
  FOR ALL USING (public.has_role(auth.uid(), 'master_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- ACCESS AUDIT LOGS
-- ============================================================
CREATE TABLE public.access_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_user_id uuid,
  target_email text,
  old_value jsonb,
  new_value jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_audit_logs_created_at_idx ON public.access_audit_logs (created_at DESC);

GRANT SELECT, INSERT ON public.access_audit_logs TO authenticated;
GRANT ALL ON public.access_audit_logs TO service_role;
ALTER TABLE public.access_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master admins read audit" ON public.access_audit_logs
  FOR SELECT USING (public.has_role(auth.uid(), 'master_admin'));
CREATE POLICY "System writes audit" ON public.access_audit_logs
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'master_admin'));

-- ============================================================
-- GRANDFATHER: copy existing users -> authorised_users as Active
-- ============================================================
INSERT INTO public.authorised_users (email, full_name, role, status, user_id, invitation_accepted_at, last_login_at, is_active)
SELECT
  u.email,
  COALESCE(p.full_name, split_part(u.email, '@', 1)),
  COALESCE(
    (SELECT role FROM public.user_roles WHERE user_id = u.id ORDER BY
      CASE role
        WHEN 'super_admin' THEN 1
        WHEN 'qa_admin' THEN 2
        WHEN 'team_manager' THEN 3
        WHEN 'agent' THEN 4
        ELSE 5
      END LIMIT 1),
    'viewer'::public.app_role
  ),
  'active',
  u.id,
  u.created_at,
  u.last_sign_in_at,
  true
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE u.email IS NOT NULL
ON CONFLICT (lower(email)) DO NOTHING;

-- Promote itsjack2025@gmail.com to master_admin
UPDATE public.authorised_users
  SET role = 'master_admin', status = 'active', is_active = true
  WHERE lower(email) = 'itsjack2025@gmail.com';

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'master_admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'itsjack2025@gmail.com'
ON CONFLICT (user_id, role) DO NOTHING;

-- ============================================================
-- UPDATED SIGNUP TRIGGER: enforce invitation-only access
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_row public.authorised_users%ROWTYPE;
  matched_agent uuid;
BEGIN
  -- Profile insert (always safe)
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;

  -- Look up authorised record by email
  SELECT * INTO auth_row FROM public.authorised_users
    WHERE lower(email) = lower(NEW.email) LIMIT 1;

  IF auth_row.id IS NULL THEN
    RAISE EXCEPTION 'Access restricted: your email address has not been authorised for this application. Please contact the Master Admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF auth_row.status IN ('suspended','revoked') OR auth_row.is_active = false THEN
    RAISE EXCEPTION 'Access restricted: your account has been % by the administrator.', auth_row.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Link user_id + activate
  UPDATE public.authorised_users
    SET user_id = NEW.id,
        status = 'active',
        invitation_accepted_at = COALESCE(invitation_accepted_at, now()),
        last_login_at = now()
    WHERE id = auth_row.id;

  -- Assign role
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, auth_row.role)
    ON CONFLICT (user_id, role) DO NOTHING;

  -- Preserve legacy agent-linking behaviour
  UPDATE public.agents
    SET user_id = NEW.id
    WHERE user_id IS NULL AND lower(email) = lower(NEW.email)
    RETURNING id INTO matched_agent;
  IF matched_agent IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
      ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
