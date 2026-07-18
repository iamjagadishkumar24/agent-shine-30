
-- 1) Link agents to auth users
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS agents_user_id_idx ON public.agents(user_id);

-- Backfill existing links by matching email
UPDATE public.agents a
SET user_id = u.id
FROM auth.users u
WHERE a.user_id IS NULL AND lower(a.email) = lower(u.email);

-- 2) Update new-user trigger to link + assign role appropriately
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE matched_agent uuid;
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');

  UPDATE public.agents
    SET user_id = NEW.id
    WHERE user_id IS NULL AND lower(email) = lower(NEW.email)
    RETURNING id INTO matched_agent;

  IF matched_agent IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'agent')
      ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'qa_admin')
      ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END; $$;

-- 3) Tighten SELECT on feedback (drop broad policy, add role-aware ones)
DROP POLICY IF EXISTS "feedback readable by auth" ON public.feedback;

CREATE POLICY "staff read all feedback"
ON public.feedback FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);

CREATE POLICY "agents read own feedback"
ON public.feedback FOR SELECT
TO authenticated
USING (
  status IN ('sent','acknowledged','completed')
  AND EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = feedback.agent_id AND a.user_id = auth.uid()
  )
);

-- 4) Allow agents to update acknowledgement fields on their own feedback
CREATE POLICY "agents ack own feedback"
ON public.feedback FOR UPDATE
TO authenticated
USING (
  status IN ('sent','acknowledged')
  AND EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = feedback.agent_id AND a.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = feedback.agent_id AND a.user_id = auth.uid()
  )
);

-- 5) Attachments SELECT — role aware
DROP POLICY IF EXISTS "feedback attachments readable by auth" ON public.feedback_attachments;

CREATE POLICY "staff read all attachments"
ON public.feedback_attachments FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);

CREATE POLICY "agents read own attachments"
ON public.feedback_attachments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.feedback f
    JOIN public.agents a ON a.id = f.agent_id
    WHERE f.id = feedback_attachments.feedback_id
      AND a.user_id = auth.uid()
      AND f.status IN ('sent','acknowledged','completed')
  )
);

-- 6) Audit log SELECT — role aware
DROP POLICY IF EXISTS "Authenticated users can read audit log" ON public.feedback_audit_log;

CREATE POLICY "staff read all feedback audit"
ON public.feedback_audit_log FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);

CREATE POLICY "agents read own feedback audit"
ON public.feedback_audit_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.feedback f
    JOIN public.agents a ON a.id = f.agent_id
    WHERE f.id = feedback_audit_log.feedback_id
      AND a.user_id = auth.uid()
  )
);
