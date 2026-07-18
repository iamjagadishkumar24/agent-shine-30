
-- Roles enum + user_roles table
CREATE TYPE public.app_role AS ENUM ('super_admin','qa_admin','team_manager','read_only');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE(user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Auto profile + default qa_admin role for first user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'qa_admin');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department TEXT NOT NULL,
  team TEXT,
  manager_name TEXT,
  joining_date DATE,
  qa_score NUMERIC(5,2) DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agents TO authenticated;
GRANT ALL ON public.agents TO service_role;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "agents readable by auth" ON public.agents FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa admins manage agents" ON public.agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'));

-- Feedback
CREATE TYPE public.feedback_status AS ENUM ('draft','review','approved','sent','acknowledged','completed');
CREATE TYPE public.feedback_type AS ENUM ('positive','constructive','critical','compliance','coaching');
CREATE TYPE public.feedback_severity AS ENUM ('low','medium','high','critical');

CREATE TABLE public.feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  feedback_type feedback_type NOT NULL DEFAULT 'constructive',
  severity feedback_severity NOT NULL DEFAULT 'medium',
  status feedback_status NOT NULL DEFAULT 'draft',
  score NUMERIC(5,2),
  summary TEXT,
  strengths TEXT,
  improvements TEXT,
  recommended_actions TEXT,
  root_cause TEXT,
  due_date DATE,
  case_id TEXT,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  sent_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledgement_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedback TO authenticated;
GRANT ALL ON public.feedback TO service_role;
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;
CREATE POLICY "feedback readable by auth" ON public.feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "qa admins manage feedback" ON public.feedback FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER feedback_updated_at BEFORE UPDATE ON public.feedback FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed demo agents
INSERT INTO public.agents (employee_id, full_name, email, department, team, manager_name, joining_date, qa_score, status) VALUES
('EMP-1001','Ava Chen','ava.chen@acme.co','Support','Tier 1','Marcus Bell','2023-04-11',92.4,'active'),
('EMP-1002','Liam Patel','liam.patel@acme.co','Support','Tier 2','Marcus Bell','2022-11-02',87.1,'active'),
('EMP-1003','Sofia Rossi','sofia.rossi@acme.co','Sales','Enterprise','Jade Ono','2024-01-19',78.9,'active'),
('EMP-1004','Noah Kim','noah.kim@acme.co','Support','Tier 1','Marcus Bell','2023-08-05',95.6,'active'),
('EMP-1005','Maya Alvarez','maya.alvarez@acme.co','Retention','North','Priya Shah','2021-06-14',68.3,'active'),
('EMP-1006','Ethan Wolfe','ethan.wolfe@acme.co','Support','Tier 2','Marcus Bell','2020-02-27',82.0,'active'),
('EMP-1007','Zara Ahmed','zara.ahmed@acme.co','Sales','SMB','Jade Ono','2024-05-30',74.5,'active'),
('EMP-1008','Kai Nakamura','kai.nakamura@acme.co','Support','Tier 3','Marcus Bell','2019-09-16',89.7,'active');
