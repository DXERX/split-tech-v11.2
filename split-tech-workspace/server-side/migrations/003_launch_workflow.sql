-- ================================================================
-- 003_launch_workflow.sql
-- Launch-ready activation + IT verification workflow
-- ================================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS camera_ip TEXT,
  ADD COLUMN IF NOT EXISTS camera_username TEXT,
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'under_review', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS verification_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS network_mode TEXT NOT NULL DEFAULT 'single_network'
    CHECK (network_mode IN ('single_network'));

CREATE INDEX IF NOT EXISTS idx_stores_verification_status ON public.stores(verification_status);
CREATE INDEX IF NOT EXISTS idx_stores_verification_requested_at ON public.stores(verification_requested_at DESC);

-- IT / admin approval can now verify and activate the store in one step.
CREATE OR REPLACE FUNCTION public.approve_store(
  p_store_id UUID,
  p_admin_id UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_sub_id UUID;
BEGIN
  IF NOT public.is_admin(p_admin_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  SELECT subscription_id INTO v_sub_id
  FROM public.stores
  WHERE id = p_store_id;

  UPDATE public.subscriptions
  SET status = 'active',
      start_date = COALESCE(start_date, CURRENT_DATE),
      end_date = CASE
        WHEN end_date IS NULL OR end_date < CURRENT_DATE THEN CURRENT_DATE + INTERVAL '30 days'
        ELSE end_date
      END,
      auto_renew = TRUE,
      updated_at = NOW()
  WHERE id = v_sub_id;

  UPDATE public.stores
  SET store_status = 'active',
      verification_status = 'verified',
      network_mode = 'single_network',
      approved_by = p_admin_id,
      approved_at = NOW(),
      reviewed_by = COALESCE(reviewed_by, p_admin_id),
      reviewed_at = COALESCE(reviewed_at, NOW()),
      verification_notes = COALESCE(verification_notes, 'تم اعتماد الطلب وإصدار الرخصة الشهرية تلقائياً.'),
      updated_at = NOW()
  WHERE id = p_store_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- Auto-renew all monthly subscriptions that are flagged for renewal.
CREATE OR REPLACE FUNCTION public.process_auto_renewals()
RETURNS INTEGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  UPDATE public.subscriptions
  SET status = 'active',
      start_date = COALESCE(start_date, CURRENT_DATE),
      end_date = CASE
        WHEN end_date IS NULL OR end_date < CURRENT_DATE THEN CURRENT_DATE + INTERVAL '30 days'
        ELSE end_date + INTERVAL '30 days'
      END,
      updated_at = NOW()
  WHERE auto_renew = TRUE
    AND status IN ('active', 'expired', 'suspended')
    AND (end_date IS NULL OR end_date <= CURRENT_DATE);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.stores s
  SET store_status = 'active',
      verification_status = COALESCE(s.verification_status, 'verified'),
      updated_at = NOW()
  FROM public.subscriptions sub
  WHERE s.subscription_id = sub.id
    AND sub.auto_renew = TRUE
    AND sub.status = 'active';

  UPDATE public.store_api_keys sak
  SET is_active = TRUE,
      expires_at = (sub.end_date + INTERVAL '1 day')::TIMESTAMPTZ
  FROM public.stores s
  JOIN public.subscriptions sub ON sub.id = s.subscription_id
  WHERE sak.store_id = s.id
    AND sub.auto_renew = TRUE
    AND sub.status = 'active';

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.approve_store(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_auto_renewals() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF NOT EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'split-auto-renew-monthly'
    ) THEN
      PERFORM cron.schedule(
        'split-auto-renew-monthly',
        '5 0 * * *',
        'SELECT public.process_auto_renewals();'
      );
    END IF;
  END IF;
END $$;
