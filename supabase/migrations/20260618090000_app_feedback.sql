CREATE TABLE IF NOT EXISTS public.app_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 10 AND 2000),
  email TEXT,
  diagnostics JSONB,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_feedback_created_at
  ON public.app_feedback (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_app_feedback_status
  ON public.app_feedback (status);

ALTER TABLE public.app_feedback ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_feedback FROM anon, authenticated;
GRANT ALL ON public.app_feedback TO service_role;
