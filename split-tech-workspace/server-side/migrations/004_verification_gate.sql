-- ================================================================
-- 004_verification_gate.sql
-- Require IT / owner verification before store activation
-- ================================================================

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
  v_store RECORD;
BEGIN
  IF NOT public.has_full_access(p_admin_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  SELECT
    id,
    subscription_id,
    verification_status,
    rtsp_url,
    camera_ip,
    camera_username,
    rtsp_password_encrypted
  INTO v_store
  FROM public.stores
  WHERE id = p_store_id;

  IF v_store.id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Store not found');
  END IF;

  IF COALESCE(BTRIM(v_store.rtsp_url), '') = ''
    OR COALESCE(BTRIM(v_store.camera_ip), '') = ''
    OR COALESCE(BTRIM(v_store.camera_username), '') = ''
    OR COALESCE(BTRIM(v_store.rtsp_password_encrypted), '') = '' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'يجب إدخال بيانات الكاميرا كاملة قبل التفعيل');
  END IF;

  IF COALESCE(v_store.verification_status, 'pending') <> 'verified' THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'يجب اعتماد بيانات الكاميرا من فريق الـ IT قبل التفعيل النهائي');
  END IF;

  v_sub_id := v_store.subscription_id;

  IF v_sub_id IS NULL THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'لا يوجد اشتراك مرتبط بهذا المتجر');
  END IF;

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
      rejection_reason = NULL,
      verification_notes = COALESCE(verification_notes, 'تم اعتماد بيانات الكاميرا وإصدار الرخصة الشهرية.'),
      updated_at = NOW()
  WHERE id = p_store_id;

  RETURN jsonb_build_object('success', TRUE, 'store_id', p_store_id);
END;
$$;
