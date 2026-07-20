
-- Phase 1: QA Platform data model additions

-- 1. Extend enums (Postgres: ADD VALUE must be its own statement, no IF NOT EXISTS in older versions but we can use it here)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'agent';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'submitted';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'finalized';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'disputed';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'resolved';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'archived';

-- 2. Teams
CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  leader_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teams TO authenticated;
GRANT ALL ON public.teams TO service_role;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
CREATE POLICY "teams_read_all_auth" ON public.teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_admin_write" ON public.teams FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin'));
CREATE TRIGGER trg_teams_updated_at BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. Agents: team_id link
ALTER TABLE public.agents ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_agents_team_id ON public.agents(team_id);

-- 4. Scorecard templates + parameters
CREATE TABLE IF NOT EXISTS public.scorecard_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scorecard_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.scorecard_templates TO authenticated;
GRANT ALL ON public.scorecard_templates TO service_role;
ALTER TABLE public.scorecard_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sct_read_all_auth" ON public.scorecard_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "sct_admin_write" ON public.scorecard_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));
CREATE TRIGGER trg_sct_updated_at BEFORE UPDATE ON public.scorecard_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS idx_scorecard_templates_active
  ON public.scorecard_templates(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.scorecard_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.scorecard_templates(id) ON DELETE CASCADE,
  name text NOT NULL,
  max_points numeric NOT NULL CHECK (max_points >= 0),
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(template_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scorecard_parameters TO authenticated;
GRANT ALL ON public.scorecard_parameters TO service_role;
ALTER TABLE public.scorecard_parameters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scp_read_all_auth" ON public.scorecard_parameters FOR SELECT TO authenticated USING (true);
CREATE POLICY "scp_admin_write" ON public.scorecard_parameters FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin'));

-- 5. Feedback: new columns
ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS interaction_type text CHECK (interaction_type IN ('chat','case')),
  ADD COLUMN IF NOT EXISTS interaction_reference text,
  ADD COLUMN IF NOT EXISTS interaction_date date,
  ADD COLUMN IF NOT EXISTS evaluator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS agent_visible_notes text,
  ADD COLUMN IF NOT EXISTS overall_score numeric,
  ADD COLUMN IF NOT EXISTS overall_percentage numeric,
  ADD COLUMN IF NOT EXISTS performance_label text;
CREATE INDEX IF NOT EXISTS idx_feedback_evaluator_id ON public.feedback(evaluator_id);
CREATE INDEX IF NOT EXISTS idx_feedback_team_id ON public.feedback(team_id);
CREATE INDEX IF NOT EXISTS idx_feedback_interaction_date ON public.feedback(interaction_date);
CREATE INDEX IF NOT EXISTS idx_feedback_overall_score ON public.feedback(overall_score);

-- 6. Feedback scores (snapshot)
CREATE TABLE IF NOT EXISTS public.feedback_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  parameter_name text NOT NULL,
  max_points numeric NOT NULL CHECK (max_points >= 0),
  selected_percentage numeric NOT NULL CHECK (selected_percentage >= 0 AND selected_percentage <= 100),
  earned_points numeric NOT NULL CHECK (earned_points >= 0),
  evaluator_note text,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(feedback_id, parameter_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_scores TO authenticated;
GRANT ALL ON public.feedback_scores TO service_role;
ALTER TABLE public.feedback_scores ENABLE ROW LEVEL SECURITY;

-- feedback_scores follow the parent feedback's visibility
CREATE POLICY "fs_select" ON public.feedback_scores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.feedback f WHERE f.id = feedback_scores.feedback_id));
CREATE POLICY "fs_write_staff" ON public.feedback_scores FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'team_manager'));

CREATE INDEX IF NOT EXISTS idx_feedback_scores_feedback_id ON public.feedback_scores(feedback_id);

-- 7. Disputes
CREATE TABLE IF NOT EXISTS public.feedback_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  raised_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','rejected')),
  resolution_note text,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback_disputes TO authenticated;
GRANT ALL ON public.feedback_disputes TO service_role;
ALTER TABLE public.feedback_disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fd_select" ON public.feedback_disputes FOR SELECT TO authenticated
  USING (
    raised_by = auth.uid()
    OR public.has_role(auth.uid(),'super_admin')
    OR public.has_role(auth.uid(),'qa_admin')
    OR public.has_role(auth.uid(),'team_manager')
  );
CREATE POLICY "fd_agent_insert" ON public.feedback_disputes FOR INSERT TO authenticated
  WITH CHECK (raised_by = auth.uid());
CREATE POLICY "fd_staff_update" ON public.feedback_disputes FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin'))
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin'));
CREATE TRIGGER trg_fd_updated_at BEFORE UPDATE ON public.feedback_disputes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_feedback_disputes_feedback_id ON public.feedback_disputes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_disputes_status ON public.feedback_disputes(status);

-- 8. Score revisions
CREATE TABLE IF NOT EXISTS public.feedback_score_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES public.feedback_disputes(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES public.feedback(id) ON DELETE CASCADE,
  parameter_name text NOT NULL,
  original_percentage numeric NOT NULL,
  revised_percentage numeric NOT NULL,
  original_earned numeric NOT NULL,
  revised_earned numeric NOT NULL,
  max_points numeric NOT NULL,
  revised_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.feedback_score_revisions TO authenticated;
GRANT ALL ON public.feedback_score_revisions TO service_role;
ALTER TABLE public.feedback_score_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fsr_select" ON public.feedback_score_revisions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.feedback_disputes d WHERE d.id = dispute_id
      AND (d.raised_by = auth.uid()
        OR public.has_role(auth.uid(),'super_admin')
        OR public.has_role(auth.uid(),'qa_admin')
        OR public.has_role(auth.uid(),'team_manager')))
  );
CREATE POLICY "fsr_staff_insert" ON public.feedback_score_revisions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin'));

-- 9. Score recalc trigger: aggregate feedback_scores -> feedback.overall_*
CREATE OR REPLACE FUNCTION public.tg_feedback_scores_recalc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  fid uuid := COALESCE(NEW.feedback_id, OLD.feedback_id);
  total_earned numeric;
  total_max numeric;
  pct numeric;
  label text;
BEGIN
  SELECT COALESCE(SUM(earned_points),0), COALESCE(SUM(max_points),0)
    INTO total_earned, total_max
    FROM public.feedback_scores WHERE feedback_id = fid;

  IF total_max = 0 THEN
    pct := NULL;
  ELSE
    pct := ROUND((total_earned / total_max) * 100, 2);
  END IF;

  IF pct IS NULL THEN
    label := NULL;
  ELSIF pct >= 90 THEN label := 'Excellent';
  ELSIF pct >= 80 THEN label := 'Good';
  ELSIF pct >= 70 THEN label := 'Needs Improvement';
  ELSE label := 'Critical Improvement Required';
  END IF;

  UPDATE public.feedback
    SET overall_score = total_earned,
        overall_percentage = pct,
        performance_label = label,
        score = pct
    WHERE id = fid;

  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_feedback_scores_recalc ON public.feedback_scores;
CREATE TRIGGER trg_feedback_scores_recalc
AFTER INSERT OR UPDATE OR DELETE ON public.feedback_scores
FOR EACH ROW EXECUTE FUNCTION public.tg_feedback_scores_recalc();

-- 10. Seed default active scorecard
DO $$
DECLARE tpl uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.scorecard_templates WHERE is_active) THEN
    INSERT INTO public.scorecard_templates(name, version, is_active)
      VALUES ('Default Scorecard v1', 1, true) RETURNING id INTO tpl;
    INSERT INTO public.scorecard_parameters(template_id, name, max_points, display_order) VALUES
      (tpl, 'Accuracy', 20, 1),
      (tpl, 'Understanding Customer Issues', 25, 2),
      (tpl, 'Customer Satisfaction', 5, 3),
      (tpl, 'Product Knowledge & Resolution', 20, 4),
      (tpl, 'Average Handling Time', 10, 5),
      (tpl, 'Compliance', 10, 6),
      (tpl, 'Technical Accuracy / IHD', 10, 7);
  END IF;
END $$;

-- 11. Enable realtime for new tables
ALTER TABLE public.feedback_scores REPLICA IDENTITY FULL;
ALTER TABLE public.feedback_disputes REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.feedback_disputes;
