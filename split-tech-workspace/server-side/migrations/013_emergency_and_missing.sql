-- 013_emergency_and_missing.sql
-- Creates tables that are used by the frontend but missing from earlier migrations.

-- ── emergency_broadcasts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emergency_broadcasts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  message            TEXT NOT NULL,
  severity           TEXT NOT NULL DEFAULT 'info'
                       CHECK (severity IN ('info','warning','critical','killswitch')),
  target_scope       TEXT NOT NULL DEFAULT 'all'
                       CHECK (target_scope IN ('all','region','store_ids','subscription_tier')),
  target_value       TEXT,
  sent_by            UUID,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  acknowledged_count INTEGER NOT NULL DEFAULT 0,
  total_targets      INTEGER,
  expires_at         TIMESTAMPTZ,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.emergency_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_eb_active   ON public.emergency_broadcasts (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eb_severity ON public.emergency_broadcasts (severity) WHERE is_active = TRUE;
DROP POLICY IF EXISTS "eb_admin_all"  ON public.emergency_broadcasts;
DROP POLICY IF EXISTS "eb_read_active" ON public.emergency_broadcasts;
CREATE POLICY "eb_admin_all"   ON public.emergency_broadcasts FOR ALL     USING (public.is_admin());
CREATE POLICY "eb_read_active" ON public.emergency_broadcasts FOR SELECT  USING (is_active = TRUE);
GRANT SELECT, INSERT, UPDATE ON public.emergency_broadcasts TO authenticated;

-- ── global_kill_switches ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.global_kill_switches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  switch_key  TEXT UNIQUE NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT FALSE,
  activated_by UUID,
  activated_at TIMESTAMPTZ,
  reason      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.global_kill_switches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gks_admin" ON public.global_kill_switches FOR ALL USING (public.is_admin());
GRANT SELECT ON public.global_kill_switches TO authenticated;

-- ── store_change_requests ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.store_change_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  field_name      TEXT NOT NULL,
  current_value   TEXT,
  requested_value TEXT NOT NULL,
  reason          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected')),
  reviewed_by     UUID,
  reviewed_at     TIMESTAMPTZ,
  review_note     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.store_change_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_change_req_store  ON public.store_change_requests (store_id, status);
CREATE INDEX IF NOT EXISTS idx_change_req_status ON public.store_change_requests (status) WHERE status = 'pending';
CREATE POLICY "cr_own"   ON public.store_change_requests FOR ALL USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "cr_ins"   ON public.store_change_requests FOR INSERT WITH CHECK (TRUE);
GRANT SELECT, INSERT ON public.store_change_requests TO authenticated;

-- ── payment_transactions (if not exists from 012) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.payment_transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID,
  subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  store_id        UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  amount          DECIMAL(10,2) NOT NULL,
  currency        TEXT NOT NULL DEFAULT 'SAR',
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','paid','failed','refunded','captured')),
  payment_id      TEXT,
  payment_method  TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.payment_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pt_user ON public.payment_transactions (user_id, created_at DESC);
CREATE POLICY "pt_own"   ON public.payment_transactions FOR SELECT USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY "pt_ins"   ON public.payment_transactions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "pt_admin" ON public.payment_transactions FOR UPDATE USING (public.is_admin());
GRANT SELECT ON public.payment_transactions TO authenticated;

-- ── Add is_active column to emergency_broadcasts if missing (already in CREATE above) ─
-- ── Ensure broadcasts table has needed columns ────────────────────────────────
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS target_scope TEXT DEFAULT 'all';
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS severity TEXT DEFAULT 'info';
ALTER TABLE public.broadcasts ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
