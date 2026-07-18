
ALTER TYPE feedback_status ADD VALUE IF NOT EXISTS 'rejected';
ALTER TYPE feedback_status ADD VALUE IF NOT EXISTS 'revision_required';

ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS review_note text;

CREATE INDEX IF NOT EXISTS feedback_reviewer_idx ON public.feedback(reviewer_id) WHERE reviewer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS feedback_status_idx ON public.feedback(status);
