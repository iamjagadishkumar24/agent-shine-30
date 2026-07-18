
DROP POLICY IF EXISTS "auth users write sessions" ON public.coaching_sessions;
DROP POLICY IF EXISTS "auth users write items" ON public.coaching_action_items;

CREATE POLICY "qa staff manage sessions" ON public.coaching_sessions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager') OR coach_id = auth.uid())
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager') OR coach_id = auth.uid());

CREATE POLICY "qa staff manage action items" ON public.coaching_action_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.coaching_sessions s WHERE s.id = session_id AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager') OR s.coach_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.coaching_sessions s WHERE s.id = session_id AND (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager') OR s.coach_id = auth.uid())));
