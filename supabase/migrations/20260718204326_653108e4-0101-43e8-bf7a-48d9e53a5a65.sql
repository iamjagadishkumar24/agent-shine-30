CREATE TYPE public.coaching_plan_status AS ENUM ('active','completed','archived');
CREATE TYPE public.coaching_goal_status AS ENUM ('on_track','at_risk','achieved','missed');

CREATE TABLE public.coaching_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  start_date date NOT NULL DEFAULT current_date,
  target_date date,
  status public.coaching_plan_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_plans TO authenticated;
GRANT ALL ON public.coaching_plans TO service_role;
ALTER TABLE public.coaching_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read plans" ON public.coaching_plans FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
    OR public.has_role(auth.uid(),'team_manager') OR public.has_role(auth.uid(),'read_only')
    OR coach_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = agent_id AND a.user_id = auth.uid())
  );
CREATE POLICY "manage plans" ON public.coaching_plans FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
    OR public.has_role(auth.uid(),'team_manager') OR coach_id = auth.uid()
  )
  WITH CHECK (
    public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
    OR public.has_role(auth.uid(),'team_manager') OR coach_id = auth.uid()
  );
CREATE TRIGGER coaching_plans_updated_at BEFORE UPDATE ON public.coaching_plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_coaching_plans_agent ON public.coaching_plans(agent_id);
CREATE INDEX idx_coaching_plans_coach ON public.coaching_plans(coach_id);
CREATE INDEX idx_coaching_plans_status ON public.coaching_plans(status);

CREATE TABLE public.coaching_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.coaching_plans(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  metric text,
  target_value numeric,
  current_value numeric NOT NULL DEFAULT 0,
  target_date date,
  weight int NOT NULL DEFAULT 1,
  status public.coaching_goal_status NOT NULL DEFAULT 'on_track',
  achieved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_goals TO authenticated;
GRANT ALL ON public.coaching_goals TO service_role;
ALTER TABLE public.coaching_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read goals" ON public.coaching_goals FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaching_plans p
    WHERE p.id = plan_id AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
      OR public.has_role(auth.uid(),'team_manager') OR public.has_role(auth.uid(),'read_only')
      OR p.coach_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = p.agent_id AND a.user_id = auth.uid())
    )
  ));
CREATE POLICY "manage goals" ON public.coaching_goals FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaching_plans p
    WHERE p.id = plan_id AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
      OR public.has_role(auth.uid(),'team_manager') OR p.coach_id = auth.uid()
    )
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.coaching_plans p
    WHERE p.id = plan_id AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
      OR public.has_role(auth.uid(),'team_manager') OR p.coach_id = auth.uid()
    )
  ));
CREATE TRIGGER coaching_goals_updated_at BEFORE UPDATE ON public.coaching_goals
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX idx_coaching_goals_plan ON public.coaching_goals(plan_id);
CREATE INDEX idx_coaching_goals_status ON public.coaching_goals(status);

CREATE TABLE public.goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES public.coaching_goals(id) ON DELETE CASCADE,
  value numeric,
  note text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goal_progress TO authenticated;
GRANT ALL ON public.goal_progress TO service_role;
ALTER TABLE public.goal_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read progress" ON public.goal_progress FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaching_goals g
    JOIN public.coaching_plans p ON p.id = g.plan_id
    WHERE g.id = goal_id AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
      OR public.has_role(auth.uid(),'team_manager') OR public.has_role(auth.uid(),'read_only')
      OR p.coach_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.agents a WHERE a.id = p.agent_id AND a.user_id = auth.uid())
    )
  ));
CREATE POLICY "insert progress" ON public.goal_progress FOR INSERT TO authenticated
  WITH CHECK (
    recorded_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.coaching_goals g
      JOIN public.coaching_plans p ON p.id = g.plan_id
      WHERE g.id = goal_id AND (
        public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
        OR public.has_role(auth.uid(),'team_manager') OR p.coach_id = auth.uid()
      )
    )
  );
CREATE POLICY "delete progress" ON public.goal_progress FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.coaching_goals g
    JOIN public.coaching_plans p ON p.id = g.plan_id
    WHERE g.id = goal_id AND (
      public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'qa_admin')
      OR public.has_role(auth.uid(),'team_manager') OR p.coach_id = auth.uid()
    )
  ));
CREATE INDEX idx_goal_progress_goal ON public.goal_progress(goal_id);
CREATE INDEX idx_goal_progress_recorded_at ON public.goal_progress(recorded_at DESC);

ALTER TABLE public.coaching_sessions ADD COLUMN plan_id uuid REFERENCES public.coaching_plans(id) ON DELETE SET NULL;
CREATE INDEX idx_coaching_sessions_plan ON public.coaching_sessions(plan_id);

CREATE OR REPLACE FUNCTION public.tg_goal_progress_apply()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  latest numeric;
  tgt numeric;
BEGIN
  SELECT value INTO latest FROM public.goal_progress WHERE goal_id = NEW.goal_id AND value IS NOT NULL
    ORDER BY recorded_at DESC LIMIT 1;
  SELECT target_value INTO tgt FROM public.coaching_goals WHERE id = NEW.goal_id;
  IF latest IS NOT NULL THEN
    UPDATE public.coaching_goals SET
      current_value = latest,
      status = CASE WHEN tgt IS NOT NULL AND latest >= tgt THEN 'achieved'::public.coaching_goal_status ELSE status END,
      achieved_at = CASE WHEN tgt IS NOT NULL AND latest >= tgt AND achieved_at IS NULL THEN now() ELSE achieved_at END
    WHERE id = NEW.goal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER goal_progress_apply AFTER INSERT ON public.goal_progress
  FOR EACH ROW EXECUTE FUNCTION public.tg_goal_progress_apply();