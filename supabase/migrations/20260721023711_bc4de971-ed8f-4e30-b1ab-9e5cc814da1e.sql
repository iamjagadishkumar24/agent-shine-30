
ALTER TABLE public.feedback
  ALTER COLUMN case_number SET DEFAULT ('QA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.feedback_case_number_seq')::text, 6, '0'));
