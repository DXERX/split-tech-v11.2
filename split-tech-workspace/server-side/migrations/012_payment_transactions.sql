-- 012: Moyasar payment transactions table
-- Run this in Supabase SQL editor before enabling payment gateway

CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  moyasar_id      TEXT NOT NULL UNIQUE,
  amount          DECIMAL(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  status          TEXT NOT NULL DEFAULT 'initiated'
                    CHECK (status IN ('initiated','paid','failed','refunded','voided')),
  initiated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_subscription ON public.payment_transactions(subscription_id);
CREATE INDEX IF NOT EXISTS idx_pt_user        ON public.payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_pt_status      ON public.payment_transactions(status);

-- RLS: users see only their own transactions; admins see all
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_transactions" ON public.payment_transactions
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('super_owner', 'it_support', 'customer_support')
    )
  );

-- Only the API (service role) inserts/updates — no direct client writes
CREATE POLICY "service_role_write" ON public.payment_transactions
  FOR ALL USING (auth.role() = 'service_role');
