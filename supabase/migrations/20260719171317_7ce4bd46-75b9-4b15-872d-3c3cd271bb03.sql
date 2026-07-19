
-- 1) Extend enum with the new lifecycle values
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'ready_to_send';
ALTER TYPE public.feedback_status ADD VALUE IF NOT EXISTS 'failed';
