
DROP POLICY IF EXISTS "auth users read sessions" ON public.coaching_sessions;
CREATE POLICY "staff and participants read sessions" ON public.coaching_sessions FOR SELECT
USING (
  public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'qa_admin')
  OR public.has_role(auth.uid(), 'team_manager')
  OR coach_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = coaching_sessions.agent_id AND a.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "auth users read items" ON public.coaching_action_items;
CREATE POLICY "staff and participants read items" ON public.coaching_action_items FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.coaching_sessions s
    LEFT JOIN public.agents a ON a.id = s.agent_id
    WHERE s.id = coaching_action_items.session_id
      AND (
        public.has_role(auth.uid(), 'super_admin')
        OR public.has_role(auth.uid(), 'qa_admin')
        OR public.has_role(auth.uid(), 'team_manager')
        OR s.coach_id = auth.uid()
        OR a.user_id = auth.uid()
      )
  )
);
