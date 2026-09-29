-- ═══════════════════════════════════════════════════════════════
-- 010 · Multi-Branch Support
-- ═══════════════════════════════════════════════════════════════
-- Adds branch grouping to stores.
-- A user with enterprise tier can have N branches under one group.
-- Basic = 1 branch, Pro = 3, Enterprise = unlimited.
-- ═══════════════════════════════════════════════════════════════

-- ── Branch groups (one per merchant chain) ──────────────────────
CREATE TABLE IF NOT EXISTS public.branch_groups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,                  -- e.g. "سلسلة البيك"
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.branch_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "branch_groups_own"
  ON public.branch_groups FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_branch_groups_user
  ON public.branch_groups (user_id);

-- ── Extend stores with branch columns ───────────────────────────
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS branch_group_id UUID
    REFERENCES public.branch_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_name  TEXT,      -- "فرع الملز"
  ADD COLUMN IF NOT EXISTS branch_order INT DEFAULT 1,
  ADD COLUMN IF NOT EXISTS city         TEXT;       -- Riyadh / Jeddah …

CREATE INDEX IF NOT EXISTS idx_stores_branch_group
  ON public.stores (branch_group_id)
  WHERE branch_group_id IS NOT NULL;

-- ── Trigger: updated_at for branch_groups ───────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_branch_groups_updated_at ON public.branch_groups;
CREATE TRIGGER trg_branch_groups_updated_at
  BEFORE UPDATE ON public.branch_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
