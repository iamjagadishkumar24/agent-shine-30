
DO $$
DECLARE tpl uuid;
BEGIN
  SELECT id INTO tpl FROM public.scorecard_templates WHERE is_active = true LIMIT 1;
  IF tpl IS NULL THEN
    INSERT INTO public.scorecard_templates (name, is_active, version) VALUES ('QualiPulse Scorecard v3', true, 1) RETURNING id INTO tpl;
  END IF;
  DELETE FROM public.scorecard_parameters WHERE template_id = tpl;
  INSERT INTO public.scorecard_parameters (template_id, name, max_points, display_order) VALUES
    (tpl, 'Accuracy', 20, 1),
    (tpl, 'Understanding Customer Issues', 25, 2),
    (tpl, 'Customer Satisfaction', 5, 3),
    (tpl, 'Product Knowledge & Resolution', 20, 4),
    (tpl, 'Average Handling Time', 10, 5),
    (tpl, 'Compliance', 10, 6),
    (tpl, 'Technical Accuracy / IHD', 10, 7);
  UPDATE public.scorecard_templates SET name = 'QualiPulse Scorecard v3' WHERE id = tpl;
END $$;
