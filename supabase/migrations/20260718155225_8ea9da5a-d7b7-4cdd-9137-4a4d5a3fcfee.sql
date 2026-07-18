
-- Coaching sessions
CREATE TYPE public.coaching_status AS ENUM ('scheduled','completed','canceled','no_show');
CREATE TYPE public.action_item_status AS ENUM ('open','in_progress','done','blocked');

CREATE TABLE public.coaching_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  coach_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  feedback_id uuid REFERENCES public.feedback(id) ON DELETE SET NULL,
  topic text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  duration_minutes int NOT NULL DEFAULT 30,
  status public.coaching_status NOT NULL DEFAULT 'scheduled',
  notes text,
  outcome text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_sessions TO authenticated;
GRANT ALL ON public.coaching_sessions TO service_role;
ALTER TABLE public.coaching_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read sessions" ON public.coaching_sessions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users write sessions" ON public.coaching_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER coaching_sessions_updated_at BEFORE UPDATE ON public.coaching_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_coaching_sessions_agent ON public.coaching_sessions(agent_id);
CREATE INDEX idx_coaching_sessions_feedback ON public.coaching_sessions(feedback_id);
CREATE INDEX idx_coaching_sessions_scheduled ON public.coaching_sessions(scheduled_at DESC);

-- Action items
CREATE TABLE public.coaching_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.coaching_sessions(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date date,
  status public.action_item_status NOT NULL DEFAULT 'open',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coaching_action_items TO authenticated;
GRANT ALL ON public.coaching_action_items TO service_role;
ALTER TABLE public.coaching_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users read items" ON public.coaching_action_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users write items" ON public.coaching_action_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER coaching_action_items_updated_at BEFORE UPDATE ON public.coaching_action_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_action_items_session ON public.coaching_action_items(session_id);
CREATE INDEX idx_action_items_status ON public.coaching_action_items(status);
