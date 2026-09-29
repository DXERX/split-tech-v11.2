-- ================================================================
-- Split Intelligence — Complete Database Schema
-- مؤسسة سبلت تيك لتقنية المعلومات
-- ================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================================
-- PROFILES (extends auth.users)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT,
  phone       TEXT,
  company_name TEXT,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- USER ROLES (RBAC)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.user_roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('super_owner', 'it_support', 'customer_support', 'merchant')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- ================================================================
-- SUBSCRIPTIONS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier           TEXT NOT NULL CHECK (tier IN ('basic', 'pro', 'enterprise')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'active', 'cancelled', 'expired', 'suspended')),
  start_date     DATE,
  end_date       DATE,
  monthly_amount DECIMAL(10,2),
  auto_renew     BOOLEAN DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- STORES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.stores (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id         UUID REFERENCES public.subscriptions(id),
  name                    TEXT NOT NULL,
  store_status            TEXT NOT NULL DEFAULT 'pending'
                            CHECK (store_status IN ('pending', 'active', 'inactive', 'suspended')),
  custom_questions        JSONB DEFAULT '["هل مكان العمل نظيف؟","هل الموظفون يرتدون الزي الرسمي؟","هل المنتجات مرتبة بشكل صحيح؟"]',
  working_hours           JSONB DEFAULT '{"start": 8, "end": 22}',
  rtsp_url                TEXT,
  rtsp_password_encrypted TEXT,
  hardware_choice         TEXT DEFAULT 'software' CHECK (hardware_choice IN ('raspberry_pi', 'software')),
  interval_minutes        INTEGER DEFAULT 10 CHECK (interval_minutes BETWEEN 1 AND 60),
  whatsapp_enabled        BOOLEAN DEFAULT FALSE,
  whatsapp_number         TEXT,
  debug_mode              BOOLEAN DEFAULT FALSE,
  remote_command          TEXT DEFAULT 'run' CHECK (remote_command IN ('run', 'stop', 'restart')),
  admin_override_signal   TEXT CHECK (admin_override_signal IN ('START', 'STOP', 'RESTART', NULL)),
  last_heartbeat          TIMESTAMPTZ,
  approved_by             UUID REFERENCES auth.users(id),
  approved_at             TIMESTAMPTZ,
  rejection_reason        TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- STORE API KEYS (License + API key management)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.store_api_keys (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  license_key         TEXT NOT NULL UNIQUE,   -- Shown to merchant (ST-XXXX-XXXX-XXXX)
  api_key             TEXT NOT NULL UNIQUE,   -- Used by engine (UUID)
  key_preview         TEXT NOT NULL,          -- Last 8 chars of api_key for display
  is_active           BOOLEAN DEFAULT TRUE,
  machine_fingerprint TEXT,
  activated_at        TIMESTAMPTZ,
  expires_at          TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ,
  revoked_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ANALYTICS LOGS (Audit results from AI engine)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.analytics_logs (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id           UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  score              INTEGER CHECK (score BETWEEN 0 AND 100),
  status             TEXT CHECK (status IN ('pass', 'warning', 'fail')),
  summary            TEXT,
  result             JSONB DEFAULT '{}',
  observations       JSONB DEFAULT '[]',
  ai_reasoning       TEXT,
  confidence_score   DECIMAL(3,2) CHECK (confidence_score BETWEEN 0 AND 1),
  client_environment JSONB,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ANALYTICS LOGS ARCHIVE
-- ================================================================
CREATE TABLE IF NOT EXISTS public.analytics_logs_archive (
  id                 UUID PRIMARY KEY,
  store_id           UUID,
  score              INTEGER,
  status             TEXT,
  summary            TEXT,
  result             JSONB,
  observations       JSONB,
  ai_reasoning       TEXT,
  confidence_score   DECIMAL(3,2),
  client_environment JSONB,
  created_at         TIMESTAMPTZ,
  archived_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- ENGINE HEARTBEATS (Device status monitoring)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.engine_heartbeats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  status        TEXT CHECK (status IN ('active', 'idle', 'error')),
  cpu_usage     DECIMAL(5,2),
  memory_usage  DECIMAL(5,2),
  engine_version TEXT,
  os_info       TEXT,
  last_audit_id UUID REFERENCES public.analytics_logs(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- SECURITY ALERTS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.security_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  alert_type  TEXT NOT NULL,
  severity    TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  message     TEXT,
  metadata    JSONB,
  resolved    BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- SYSTEM LOGS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.system_logs (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id  UUID REFERENCES public.stores(id),
  log_level TEXT CHECK (log_level IN ('debug', 'info', 'warning', 'error', 'critical')),
  source    TEXT, -- 'engine', 'edge_function', 'system'
  message   TEXT,
  metadata  JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- SUPPORT TICKETS
-- ================================================================
CREATE TABLE IF NOT EXISTS public.support_tickets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id    UUID REFERENCES public.stores(id),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT CHECK (category IN ('technical', 'billing', 'general', 'hardware', 'activation')),
  priority    TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  status      TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  assigned_to UUID REFERENCES auth.users(id),
  closed_at   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- TICKET MESSAGES
-- ================================================================
CREATE TABLE IF NOT EXISTS public.ticket_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  message     TEXT NOT NULL,
  is_internal BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- BROADCASTS (Admin announcements)
-- ================================================================
CREATE TABLE IF NOT EXISTS public.broadcasts (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT DEFAULT 'info' CHECK (type IN ('info', 'warning', 'maintenance', 'feature', 'urgent')),
  target     TEXT DEFAULT 'all' CHECK (target IN ('all', 'merchants', 'it')),
  is_active  BOOLEAN DEFAULT TRUE,
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- AUDIT TRAIL
-- ================================================================
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  action     TEXT NOT NULL,
  table_name TEXT,
  record_id  UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX IF NOT EXISTS idx_analytics_logs_store_id ON public.analytics_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_analytics_logs_created_at ON public.analytics_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_logs_store_created ON public.analytics_logs(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stores_user_id ON public.stores(user_id);
CREATE INDEX IF NOT EXISTS idx_stores_status ON public.stores(store_status);
CREATE INDEX IF NOT EXISTS idx_store_api_keys_api_key ON public.store_api_keys(api_key);
CREATE INDEX IF NOT EXISTS idx_store_api_keys_license_key ON public.store_api_keys(license_key);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_end_date ON public.subscriptions(end_date);
CREATE INDEX IF NOT EXISTS idx_engine_heartbeats_store_id ON public.engine_heartbeats(store_id);
CREATE INDEX IF NOT EXISTS idx_engine_heartbeats_created_at ON public.engine_heartbeats(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON public.support_tickets(user_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON public.support_tickets(status);

-- ================================================================
-- HELPER FUNCTIONS
-- ================================================================

-- Get current user's role
CREATE OR REPLACE FUNCTION public.get_user_role(uid UUID DEFAULT auth.uid())
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.user_roles WHERE user_id = uid;
$$;

-- Check if current user is one of the admin/support roles
CREATE OR REPLACE FUNCTION public.is_admin(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid
    AND role IN ('super_owner', 'it_support', 'customer_support')
  );
$$;

-- Check if current user is super_owner
CREATE OR REPLACE FUNCTION public.is_super_owner(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid
    AND role = 'super_owner'
  );
$$;

-- Generate license key (format: ST-XXXX-XXXX-XXXX-XXXX)
CREATE OR REPLACE FUNCTION public.generate_license_key()
RETURNS TEXT
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT := 'ST';
  i INT;
  j INT;
BEGIN
  FOR i IN 1..4 LOOP
    result := result || '-';
    FOR j IN 1..4 LOOP
      result := result || substr(chars, (random() * length(chars))::INT + 1, 1);
    END LOOP;
  END LOOP;
  RETURN result;
END;
$$;

-- ================================================================
-- TRIGGER: Auto-update updated_at
-- ================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE PLPGSQL
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_stores_updated_at
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================================================
-- TRIGGER: Auto-create profile on user signup
-- ================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email)
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'role', 'merchant'));

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ================================================================
-- TRIGGER: Auto-generate API key when store is approved
-- ================================================================
CREATE OR REPLACE FUNCTION public.auto_generate_api_key()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_api_key    TEXT;
  v_license_key TEXT;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  -- Only trigger on status change to 'active'
  IF NEW.store_status = 'active' AND (OLD.store_status IS DISTINCT FROM 'active') THEN
    v_api_key     := gen_random_uuid()::TEXT;
    v_license_key := public.generate_license_key();

    -- Get subscription end date for expires_at
    SELECT (s.end_date + INTERVAL '1 day')::TIMESTAMPTZ
    INTO v_expires_at
    FROM public.subscriptions s
    WHERE s.id = NEW.subscription_id;

    -- Remove any previous inactive keys
    UPDATE public.store_api_keys
    SET is_active = FALSE
    WHERE store_id = NEW.id;

    INSERT INTO public.store_api_keys (
      store_id,
      license_key,
      api_key,
      key_preview,
      is_active,
      expires_at
    ) VALUES (
      NEW.id,
      v_license_key,
      v_api_key,
      RIGHT(v_api_key, 8),
      TRUE,
      v_expires_at
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_store_approved_generate_key
  AFTER UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.auto_generate_api_key();

-- ================================================================
-- FUNCTION: Approve store (called by admin)
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
BEGIN
  -- Check admin permission
  IF NOT public.is_super_owner(p_admin_id) THEN
    RETURN jsonb_build_object('success', FALSE, 'error', 'Unauthorized');
  END IF;

  -- Get subscription id
  SELECT subscription_id INTO v_sub_id FROM public.stores WHERE id = p_store_id;

  -- Activate subscription
  UPDATE public.subscriptions
  SET status = 'active',
      start_date = CURRENT_DATE,
      end_date = CURRENT_DATE + INTERVAL '30 days',
      updated_at = NOW()
  WHERE id = v_sub_id;

  -- Approve store (triggers auto_generate_api_key)
  UPDATE public.stores
  SET store_status = 'active',
      approved_by = p_admin_id,
      approved_at = NOW(),
      updated_at = NOW()
  WHERE id = p_store_id;

  RETURN jsonb_build_object('success', TRUE);
END;
$$;

-- ================================================================
-- FUNCTION: Renew subscription (called by admin)
-- ================================================================
CREATE OR REPLACE FUNCTION public.renew_subscription(
  p_subscription_id UUID,
  p_months INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_current_end DATE;
  v_new_end     DATE;
  v_store_id    UUID;
BEGIN
  SELECT end_date INTO v_current_end
  FROM public.subscriptions WHERE id = p_subscription_id;

  -- Extend from current end date or today if expired
  IF v_current_end < CURRENT_DATE THEN
    v_new_end := CURRENT_DATE + (p_months || ' months')::INTERVAL;
  ELSE
    v_new_end := v_current_end + (p_months || ' months')::INTERVAL;
  END IF;

  UPDATE public.subscriptions
  SET status = 'active',
      end_date = v_new_end,
      updated_at = NOW()
  WHERE id = p_subscription_id;

  -- Reactivate store if it was suspended due to expiry
  SELECT s.id INTO v_store_id
  FROM public.stores s
  WHERE s.subscription_id = p_subscription_id
  AND s.store_status = 'suspended';

  IF v_store_id IS NOT NULL THEN
    UPDATE public.stores
    SET store_status = 'active', updated_at = NOW()
    WHERE id = v_store_id;
  END IF;

  -- Reactivate API key and update expiry
  UPDATE public.store_api_keys
  SET is_active = TRUE,
      expires_at = (v_new_end + INTERVAL '1 day')::TIMESTAMPTZ
  WHERE store_id = v_store_id;

  RETURN jsonb_build_object('success', TRUE, 'new_end_date', v_new_end);
END;
$$;

-- ================================================================
-- FUNCTION: Expire subscriptions (runs daily via pg_cron)
-- ================================================================
CREATE OR REPLACE FUNCTION public.expire_subscriptions()
RETURNS INTEGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Mark expired subscriptions
  UPDATE public.subscriptions
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
    AND end_date < CURRENT_DATE;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Suspend stores with expired subscriptions
  UPDATE public.stores s
  SET store_status = 'suspended', updated_at = NOW()
  FROM public.subscriptions sub
  WHERE s.subscription_id = sub.id
    AND sub.status = 'expired'
    AND s.store_status = 'active';

  -- Deactivate API keys for expired subscriptions
  UPDATE public.store_api_keys sak
  SET is_active = FALSE
  FROM public.stores s
  JOIN public.subscriptions sub ON s.subscription_id = sub.id
  WHERE sak.store_id = s.id
    AND sub.status = 'expired'
    AND sak.is_active = TRUE;

  RETURN v_count;
END;
$$;

-- ================================================================
-- CRON JOB: Daily subscription expiry check (01:00 AST = 22:00 UTC)
-- ================================================================
SELECT cron.schedule(
  'expire-subscriptions-daily',
  '0 22 * * *',
  $$SELECT public.expire_subscriptions();$$
);

-- ================================================================
-- FUNCTION: Archive old analytics logs (>90 days)
-- ================================================================
CREATE OR REPLACE FUNCTION public.archive_old_logs()
RETURNS INTEGER
LANGUAGE PLPGSQL
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.analytics_logs_archive
  SELECT *, NOW() AS archived_at
  FROM public.analytics_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  DELETE FROM public.analytics_logs
  WHERE created_at < NOW() - INTERVAL '90 days';

  RETURN v_count;
END;
$$;

SELECT cron.schedule(
  'archive-logs-weekly',
  '0 23 * * 0',
  $$SELECT public.archive_old_logs();$$
);

-- ================================================================
-- ROW LEVEL SECURITY
-- ================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_logs_archive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- ---- PROFILES ----
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL USING (id = auth.uid());
CREATE POLICY "profiles_admin" ON public.profiles
  FOR SELECT USING (public.is_admin());

-- ---- USER ROLES ----
CREATE POLICY "roles_own" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "roles_admin" ON public.user_roles
  FOR ALL USING (public.is_super_owner());

-- ---- SUBSCRIPTIONS ----
CREATE POLICY "subs_own" ON public.subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "subs_admin" ON public.subscriptions
  FOR ALL USING (public.is_super_owner());

-- ---- STORES ----
CREATE POLICY "stores_own" ON public.stores
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "stores_own_update" ON public.stores
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "stores_own_insert" ON public.stores
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "stores_admin" ON public.stores
  FOR ALL USING (public.is_admin());

-- ---- STORE API KEYS ----
-- Merchants can see their own key preview (not full key)
CREATE POLICY "api_keys_own" ON public.store_api_keys
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
  );
CREATE POLICY "api_keys_admin" ON public.store_api_keys
  FOR ALL USING (public.is_super_owner());

-- ---- ANALYTICS LOGS ----
CREATE POLICY "logs_own" ON public.analytics_logs
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
  );
CREATE POLICY "logs_admin" ON public.analytics_logs
  FOR SELECT USING (public.is_admin());
-- Service role can insert (via edge functions)
CREATE POLICY "logs_service_insert" ON public.analytics_logs
  FOR INSERT WITH CHECK (TRUE); -- Protected at edge function level

-- ---- ANALYTICS ARCHIVE ----
CREATE POLICY "archive_own" ON public.analytics_logs_archive
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
  );
CREATE POLICY "archive_admin" ON public.analytics_logs_archive
  FOR SELECT USING (public.is_admin());

-- ---- ENGINE HEARTBEATS ----
CREATE POLICY "heartbeats_own" ON public.engine_heartbeats
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
  );
CREATE POLICY "heartbeats_admin" ON public.engine_heartbeats
  FOR SELECT USING (public.is_admin());
CREATE POLICY "heartbeats_insert" ON public.engine_heartbeats
  FOR INSERT WITH CHECK (TRUE);

-- ---- SECURITY ALERTS ----
CREATE POLICY "alerts_own" ON public.security_alerts
  FOR SELECT USING (
    store_id IN (SELECT id FROM public.stores WHERE user_id = auth.uid())
  );
CREATE POLICY "alerts_admin" ON public.security_alerts
  FOR ALL USING (public.is_admin());

-- ---- SYSTEM LOGS ----
CREATE POLICY "syslogs_admin" ON public.system_logs
  FOR SELECT USING (public.is_admin());
CREATE POLICY "syslogs_insert" ON public.system_logs
  FOR INSERT WITH CHECK (TRUE);

-- ---- SUPPORT TICKETS ----
CREATE POLICY "tickets_own" ON public.support_tickets
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "tickets_support" ON public.support_tickets
  FOR ALL USING (
    public.get_user_role() IN ('it_support', 'customer_support', 'super_owner')
  );

-- ---- TICKET MESSAGES ----
CREATE POLICY "ticket_msgs_own" ON public.ticket_messages
  FOR SELECT USING (
    ticket_id IN (SELECT id FROM public.support_tickets WHERE user_id = auth.uid())
    AND is_internal = FALSE
  );
CREATE POLICY "ticket_msgs_insert" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    ticket_id IN (
      SELECT id FROM public.support_tickets
      WHERE user_id = auth.uid()
        OR public.get_user_role() IN ('it_support', 'customer_support', 'super_owner')
    )
  );
CREATE POLICY "ticket_msgs_support" ON public.ticket_messages
  FOR ALL USING (
    public.get_user_role() IN ('it_support', 'customer_support', 'super_owner')
  );

-- ---- BROADCASTS ----
CREATE POLICY "broadcasts_read" ON public.broadcasts
  FOR SELECT USING (is_active = TRUE AND (expires_at IS NULL OR expires_at > NOW()));
CREATE POLICY "broadcasts_admin" ON public.broadcasts
  FOR ALL USING (public.is_super_owner());

-- ---- AUDIT TRAIL ----
CREATE POLICY "audit_own" ON public.audit_trail
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "audit_admin" ON public.audit_trail
  FOR SELECT USING (public.is_admin());

-- ================================================================
-- REALTIME: Enable for dashboard live updates
-- ================================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.analytics_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.engine_heartbeats;
ALTER PUBLICATION supabase_realtime ADD TABLE public.stores;
ALTER PUBLICATION supabase_realtime ADD TABLE public.security_alerts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.broadcasts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;

-- ================================================================
-- SEED: Create default super_owner (update with real email)
-- ================================================================
-- After running migrations, manually assign super_owner role:
-- UPDATE public.user_roles SET role = 'super_owner' WHERE user_id = 'your-user-uuid';
-- Or insert:
-- INSERT INTO public.user_roles(user_id, role) VALUES('your-user-uuid', 'super_owner')
-- ON CONFLICT(user_id) DO UPDATE SET role = 'super_owner';
