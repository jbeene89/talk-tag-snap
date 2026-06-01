-- ============ ROLES SYSTEM ============
CREATE TYPE public.app_role AS ENUM ('admin');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Security definer function to check roles without RLS recursion
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- ============ ORDERS TABLE ============
CREATE TYPE public.order_status AS ENUM (
  'pending_payment',
  'paid',
  'in_progress',
  'delivered',
  'cancelled'
);

CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email TEXT NOT NULL,
  site_url TEXT NOT NULL,
  app_name TEXT NOT NULL,
  package_name TEXT NOT NULL,
  icon_storage_path TEXT,
  status order_status NOT NULL DEFAULT 'pending_payment',
  stripe_session_id TEXT UNIQUE,
  amount_cents INTEGER NOT NULL DEFAULT 9900,
  aab_download_url TEXT,
  admin_notes TEXT,
  paid_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON public.orders (status);
CREATE INDEX idx_orders_created_at ON public.orders (created_at DESC);

-- Anyone (even logged-out site visitors) needs to insert a draft order before paying.
GRANT INSERT, SELECT, UPDATE ON public.orders TO anon;
GRANT SELECT, INSERT, UPDATE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Anyone can create a draft order from the public order form
CREATE POLICY "Anyone can create an order"
ON public.orders
FOR INSERT
TO anon, authenticated
WITH CHECK (status = 'pending_payment');

-- Only admins can read all orders
CREATE POLICY "Admins can view all orders"
ON public.orders
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Only admins can update orders (status changes, paste download link, etc.)
CREATE POLICY "Admins can update orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ UPDATED_AT TRIGGER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_set_updated_at
BEFORE UPDATE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- ============ STORAGE BUCKET FOR ICONS ============
INSERT INTO storage.buckets (id, name, public)
VALUES ('order-icons', 'order-icons', false)
ON CONFLICT (id) DO NOTHING;

-- Anyone can upload an icon (anonymous customers during checkout)
CREATE POLICY "Anyone can upload an order icon"
ON storage.objects
FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'order-icons');

-- Only admins can view uploaded icons
CREATE POLICY "Admins can view order icons"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'order-icons' AND public.has_role(auth.uid(), 'admin'));