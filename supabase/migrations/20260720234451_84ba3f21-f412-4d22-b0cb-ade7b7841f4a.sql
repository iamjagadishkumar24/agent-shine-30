
DO $$
DECLARE tpl uuid;
BEGIN
  SELECT id INTO tpl FROM public.scorecard_templates WHERE is_active = true ORDER BY created_at DESC LIMIT 1;
  IF tpl IS NULL THEN
    INSERT INTO public.scorecard_templates (name, is_active)
    VALUES ('QualiPulse Scorecard v2', true) RETURNING id INTO tpl;
  ELSE
    UPDATE public.scorecard_templates SET name = 'QualiPulse Scorecard v2' WHERE id = tpl;
    DELETE FROM public.scorecard_parameters WHERE template_id = tpl;
  END IF;

  INSERT INTO public.scorecard_parameters (template_id, name, max_points, display_order) VALUES
    (tpl, 'Greeting and Introduction',        100, 1),
    (tpl, 'Communication Clarity',            100, 2),
    (tpl, 'Product or Process Knowledge',     100, 3),
    (tpl, 'Issue Resolution',                 100, 4),
    (tpl, 'Empathy and Professionalism',      100, 5),
    (tpl, 'Accuracy and Compliance',          100, 6),
    (tpl, 'Closing and Next Steps',           100, 7);
END $$;

UPDATE public.email_settings
   SET sender_name = 'QualiPulse Feedback Team',
       signature_html = '<p style="margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">Regards,<br/><strong>QualiPulse Team</strong><br/><span style="color:#475569;">Quality Feedback and Performance Management</span></p>'
 WHERE singleton = true;
