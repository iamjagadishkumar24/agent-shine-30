
DROP POLICY IF EXISTS "agents readable by auth" ON public.agents;
CREATE POLICY "staff read all agents" ON public.agents FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);
CREATE POLICY "agents read own record" ON public.agents FOR SELECT
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "profiles readable by authenticated" ON public.profiles;
CREATE POLICY "users read own profile" ON public.profiles FOR SELECT
USING (id = auth.uid());
CREATE POLICY "staff read all profiles" ON public.profiles FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);

DROP POLICY IF EXISTS "email events readable by auth" ON public.feedback_email_events;
CREATE POLICY "staff read all email events" ON public.feedback_email_events FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
);
CREATE POLICY "agents read own email events" ON public.feedback_email_events FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.feedback f
    JOIN public.agents a ON a.id = f.agent_id
    WHERE f.id = feedback_email_events.feedback_id
      AND a.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "attachments read auth" ON storage.objects;
CREATE POLICY "attachments read staff" ON storage.objects FOR SELECT
USING (
  bucket_id = 'feedback-attachments'
  AND (
    public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'qa_admin')
    OR public.has_role(auth.uid(), 'team_manager')
  )
);
CREATE POLICY "attachments read own agent" ON storage.objects FOR SELECT
USING (
  bucket_id = 'feedback-attachments'
  AND EXISTS (
    SELECT 1
    FROM public.feedback_attachments fa
    JOIN public.feedback f ON f.id = fa.feedback_id
    JOIN public.agents a ON a.id = f.agent_id
    WHERE fa.storage_path = storage.objects.name
      AND a.user_id = auth.uid()
      AND f.status IN ('sent','acknowledged','completed')
  )
);
