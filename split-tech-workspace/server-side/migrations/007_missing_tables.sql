-- ================================================================
-- 007_missing_tables.sql
-- Tables and functions referenced by Edge Functions
-- that were not included in earlier migrations
-- ================================================================

-- ── has_full_access (referenced by 004_verification_gate.sql) ────────────────
CREATE OR REPLACE FUNCTION public.has_full_access(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT public.is_admin(uid);
$$;

-- ── hardware_lock_log (referenced by v1-activate) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.hardware_lock_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_api_key_id UUID REFERENCES public.store_api_keys(id) ON DELETE SET NULL,
  store_id         UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  event_type       TEXT NOT NULL,
  old_fingerprint  TEXT,
  new_fingerprint  TEXT,
  platform         TEXT,
  ip_address       TEXT,
  user_agent       TEXT,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hardware_lock_store ON public.hardware_lock_log(store_id, created_at DESC);
ALTER TABLE public.hardware_lock_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "hwlock_admin" ON public.hardware_lock_log FOR SELECT USING (public.is_admin());
CREATE POLICY "hwlock_insert" ON public.hardware_lock_log FOR INSERT WITH CHECK (TRUE);

-- ── activation_request_attempts (referenced by v1-license-request) ───────────
CREATE TABLE IF NOT EXISTS public.activation_request_attempts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  store_id      UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  ip_address    TEXT,
  action        TEXT,
  blocked_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_act_req_user ON public.activation_request_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_act_req_ip ON public.activation_request_attempts(ip_address, created_at DESC);
ALTER TABLE public.activation_request_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "act_req_admin" ON public.activation_request_attempts FOR ALL USING (public.is_admin());
CREATE POLICY "act_req_insert" ON public.activation_request_attempts FOR INSERT WITH CHECK (TRUE);

-- ── network_speed_tests (referenced by v1-network-speed-report) ──────────────
CREATE TABLE IF NOT EXISTS public.network_speed_tests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  source        TEXT DEFAULT 'local_merchant'
                  CHECK (source IN ('local_merchant', 'remote_admin')),
  download_mbps DECIMAL(8,2),
  latency_ms    INTEGER,
  upload_ok     BOOLEAN,
  verdict       TEXT,
  raw_payload   JSONB,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_speed_tests_store ON public.network_speed_tests(store_id, created_at DESC);
ALTER TABLE public.network_speed_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "speed_own" ON public.network_speed_tests
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()) OR public.is_admin()
  );
CREATE POLICY "speed_insert" ON public.network_speed_tests FOR INSERT WITH CHECK (TRUE);
GRANT SELECT ON public.network_speed_tests TO authenticated;

-- ── config_snapshots (referenced by v1-rollback) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.config_snapshots (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  config_data JSONB,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_snapshots_store ON public.config_snapshots(store_id, created_at DESC);
ALTER TABLE public.config_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "snapshots_own" ON public.config_snapshots
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid()) OR public.is_admin()
  );
CREATE POLICY "snapshots_admin" ON public.config_snapshots FOR ALL USING (public.is_admin());

-- ── rollback_log (referenced by v1-rollback) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rollback_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID REFERENCES public.stores(id) ON DELETE CASCADE,
  snapshot_id      UUID REFERENCES public.config_snapshots(id) ON DELETE SET NULL,
  rolled_back_by   UUID REFERENCES auth.users(id),
  reason           TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.rollback_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rollback_admin" ON public.rollback_log FOR ALL USING (public.is_admin());
CREATE POLICY "rollback_insert" ON public.rollback_log FOR INSERT WITH CHECK (TRUE);

-- ── bot_knowledge_base (referenced by v1-smart-bot) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_knowledge_base (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.bot_knowledge_base ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kb_read" ON public.bot_knowledge_base FOR SELECT USING (is_active = TRUE OR public.is_admin());
CREATE POLICY "kb_admin" ON public.bot_knowledge_base FOR ALL USING (public.is_admin());
GRANT SELECT ON public.bot_knowledge_base TO authenticated;

-- Seed basic knowledge base entries
INSERT INTO public.bot_knowledge_base (question, answer, category) VALUES
  ('ما هي Split Intelligence؟', 'Split Intelligence هي منصة ذكاء اصطناعي لمراقبة جودة المتاجر وتحليل الأداء عبر الكاميرات وتقارير تفصيلية دورية.', 'general'),
  ('كيف أفعّل الترخيص؟', 'أدخل رمز الترخيص في إعدادات التطبيق. إذا واجهت مشكلة تواصل مع فريق الدعم الفني.', 'activation'),
  ('كيف أجدد اشتراكي؟', 'تواصل مع مؤسسة سبلت تيك عبر البريد الإلكتروني support@splittech.sa أو أنشئ تذكرة دعم من لوحة التحكم.', 'billing'),
  ('ماذا أفعل إذا توقف الجهاز عن العمل؟', 'تأكد من اتصال الإنترنت وتشغيل الكاميرا، ثم أعد تشغيل التطبيق. إذا استمرت المشكلة أنشئ تذكرة دعم.', 'technical')
ON CONFLICT DO NOTHING;

-- ── bot_conversations (referenced by v1-smart-bot) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.bot_conversations (
  id           UUID PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_message TEXT,
  bot_reply    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bot_conv_user ON public.bot_conversations(user_id, created_at DESC);
ALTER TABLE public.bot_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bot_conv_own" ON public.bot_conversations
  FOR ALL USING (user_id = auth.uid() OR public.is_admin());
GRANT SELECT, INSERT ON public.bot_conversations TO authenticated;

-- ── Realtime for network speed tests ─────────────────────────────────────────
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.network_speed_tests;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
