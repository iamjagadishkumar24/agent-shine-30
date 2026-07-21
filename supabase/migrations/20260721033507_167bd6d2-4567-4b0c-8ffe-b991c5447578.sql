-- 1) Lock down SECURITY DEFINER trigger function: only postgres/service_role need EXECUTE.
REVOKE EXECUTE ON FUNCTION public.tg_feedback_scores_recalc() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_scores_recalc() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_feedback_scores_recalc() FROM authenticated;

-- 2) Replace overly permissive SELECT policy on feedback_scores.
DROP POLICY IF EXISTS fs_select ON public.feedback_scores;

CREATE POLICY "Staff can read feedback scores"
  ON public.feedback_scores
  FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'qa_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'team_manager'::public.app_role)
    OR public.has_role(auth.uid(), 'master_admin'::public.app_role)
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'qa_evaluator'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
  );

CREATE POLICY "Agents can read scores on their own feedback"
  ON public.feedback_scores
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.feedback f
      JOIN public.agents a ON a.id = f.agent_id
      WHERE f.id = feedback_scores.feedback_id
        AND a.user_id = auth.uid()
        AND f.status = ANY (ARRAY[
          'sent'::public.feedback_status,
          'acknowledged'::public.feedback_status,
          'completed'::public.feedback_status,
          'disputed'::public.feedback_status,
          'resolved'::public.feedback_status
        ])
    )
  );
