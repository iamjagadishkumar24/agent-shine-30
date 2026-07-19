
-- Auto-rollup agents.qa_score from feedback.score so the Quality Score
-- widget reflects real scored feedback instead of a hardcoded 0.

CREATE OR REPLACE FUNCTION public.recalc_agent_qa_score(_agent_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  avg_score numeric;
BEGIN
  IF _agent_id IS NULL THEN RETURN; END IF;
  SELECT AVG(score) INTO avg_score
    FROM public.feedback
    WHERE agent_id = _agent_id AND score IS NOT NULL;
  UPDATE public.agents
    SET qa_score = COALESCE(avg_score, 0)
    WHERE id = _agent_id;
END; $$;

CREATE OR REPLACE FUNCTION public.tg_feedback_qa_rollup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_agent_qa_score(OLD.agent_id);
    RETURN OLD;
  END IF;
  PERFORM public.recalc_agent_qa_score(NEW.agent_id);
  IF TG_OP = 'UPDATE' AND OLD.agent_id IS DISTINCT FROM NEW.agent_id THEN
    PERFORM public.recalc_agent_qa_score(OLD.agent_id);
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS feedback_qa_rollup ON public.feedback;
CREATE TRIGGER feedback_qa_rollup
AFTER INSERT OR UPDATE OF score, agent_id OR DELETE ON public.feedback
FOR EACH ROW EXECUTE FUNCTION public.tg_feedback_qa_rollup();

-- Backfill existing agents from their current feedback averages.
UPDATE public.agents a
   SET qa_score = COALESCE(sub.avg_score, 0)
  FROM (
    SELECT agent_id, AVG(score) AS avg_score
      FROM public.feedback
     WHERE score IS NOT NULL
     GROUP BY agent_id
  ) sub
 WHERE sub.agent_id = a.id;
