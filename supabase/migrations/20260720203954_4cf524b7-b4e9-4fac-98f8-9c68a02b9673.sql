
-- Allow agents to see and update their own feedback in disputed/resolved states.
DROP POLICY IF EXISTS "agents read own feedback" ON public.feedback;
CREATE POLICY "agents read own feedback" ON public.feedback
  FOR SELECT TO authenticated
  USING (
    status = ANY (ARRAY['sent'::feedback_status,'acknowledged'::feedback_status,'completed'::feedback_status,'disputed'::feedback_status,'resolved'::feedback_status])
    AND EXISTS (SELECT 1 FROM public.agents a WHERE a.id = feedback.agent_id AND a.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "agents ack own feedback" ON public.feedback;
CREATE POLICY "agents ack own feedback" ON public.feedback
  FOR UPDATE TO authenticated
  USING (
    status = ANY (ARRAY['sent'::feedback_status,'acknowledged'::feedback_status,'disputed'::feedback_status])
    AND EXISTS (SELECT 1 FROM public.agents a WHERE a.id = feedback.agent_id AND a.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.agents a WHERE a.id = feedback.agent_id AND a.user_id = auth.uid())
  );

-- Realtime for disputes + revisions so the UI updates live
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_score_revisions;
