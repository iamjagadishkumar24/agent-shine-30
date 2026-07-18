
CREATE TYPE public.report_type AS ENUM ('agent_performance','feedback_trends','email_delivery');
CREATE TYPE public.report_format AS ENUM ('pdf','csv','both');
CREATE TYPE public.report_cadence AS ENUM ('weekly','monthly');

CREATE TABLE public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  report_type public.report_type NOT NULL,
  format public.report_format NOT NULL DEFAULT 'pdf',
  cadence public.report_cadence NOT NULL,
  day_of_week SMALLINT,       -- 0=Sun..6=Sat, for weekly
  day_of_month SMALLINT,      -- 1..28, for monthly
  hour_utc SMALLINT NOT NULL DEFAULT 13, -- 0..23
  recipients TEXT[] NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view report schedules" ON public.report_schedules
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE POLICY "Admins can manage report schedules" ON public.report_schedules
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'))
  WITH CHECK (public.has_role(auth.uid(),'qa_admin') OR public.has_role(auth.uid(),'super_admin'));

CREATE TRIGGER report_schedules_updated_at BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX report_schedules_due_idx ON public.report_schedules (next_run_at) WHERE enabled = true;
