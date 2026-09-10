CREATE TABLE public.app_unlocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  stripe_session_id TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 299,
  paid_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_unlocks TO authenticated;
GRANT ALL ON public.app_unlocks TO service_role;

ALTER TABLE public.app_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own unlock"
ON public.app_unlocks
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE TRIGGER app_unlocks_set_updated_at
BEFORE UPDATE ON public.app_unlocks
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();