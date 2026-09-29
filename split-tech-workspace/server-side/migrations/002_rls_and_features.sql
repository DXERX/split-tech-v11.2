-- ================================================================
-- Migration 002: RLS Policies + Admin Super-Powers
-- مؤسسة سبلت تيك لتقنية المعلومات
-- ================================================================

-- Add is_banned flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS banned_reason TEXT;

-- ================================================================
-- ENABLE RLS on all tables
-- ================================================================
ALTER TABLE public.profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_api_keys    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_logs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engine_heartbeats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_alerts   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcasts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_trail       ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- DROP old policies if they exist (safe re-run)
-- ================================================================
DO $$ DECLARE r RECORD;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname
           FROM pg_policies WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ================================================================
-- PROFILES
-- ================================================================
-- Everyone sees their own profile; admins see all
CREATE POLICY "profiles_select" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id OR public.is_admin()
  );

CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id OR public.is_admin());

-- Admins can update ban status
CREATE POLICY "profiles_admin_ban" ON public.profiles
  FOR UPDATE USING (public.is_admin());

-- ================================================================
-- USER ROLES
-- ================================================================
CREATE POLICY "roles_select" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "roles_admin_upsert" ON public.user_roles
  FOR ALL USING (public.is_super_owner());

-- ================================================================
-- SUBSCRIPTIONS
-- ================================================================
CREATE POLICY "subs_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "subs_insert_own" ON public.subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "subs_admin_update" ON public.subscriptions
  FOR UPDATE USING (public.is_admin());

-- ================================================================
-- STORES
-- ================================================================
CREATE POLICY "stores_own" ON public.stores
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "stores_insert_own" ON public.stores
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "stores_update_own" ON public.stores
  FOR UPDATE USING (auth.uid() = user_id OR public.is_admin());

-- ================================================================
-- STORE API KEYS
-- ================================================================
CREATE POLICY "keys_own" ON public.store_api_keys
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "keys_admin_manage" ON public.store_api_keys
  FOR ALL USING (public.is_admin());

-- ================================================================
-- ANALYTICS LOGS
-- ================================================================
CREATE POLICY "logs_own" ON public.analytics_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "logs_insert_api" ON public.analytics_logs
  FOR INSERT WITH CHECK (TRUE); -- Edge functions use service role

-- ================================================================
-- ENGINE HEARTBEATS
-- ================================================================
CREATE POLICY "heartbeats_own" ON public.engine_heartbeats
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "heartbeats_insert_api" ON public.engine_heartbeats
  FOR INSERT WITH CHECK (TRUE);

-- ================================================================
-- SECURITY ALERTS
-- ================================================================
CREATE POLICY "alerts_own" ON public.security_alerts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.user_id = auth.uid())
    OR public.is_admin()
  );

CREATE POLICY "alerts_admin_manage" ON public.security_alerts
  FOR ALL USING (public.is_admin());

-- ================================================================
-- SYSTEM LOGS
-- ================================================================
CREATE POLICY "syslogs_admin" ON public.system_logs
  FOR SELECT USING (public.is_admin());

CREATE POLICY "syslogs_insert_api" ON public.system_logs
  FOR INSERT WITH CHECK (TRUE);

-- ================================================================
-- SUPPORT TICKETS
-- ================================================================
CREATE POLICY "tickets_own" ON public.support_tickets
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "tickets_insert_own" ON public.support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "tickets_update_admin" ON public.support_tickets
  FOR UPDATE USING (public.is_admin());

-- ================================================================
-- TICKET MESSAGES
-- ================================================================
CREATE POLICY "tmsg_select" ON public.ticket_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

CREATE POLICY "tmsg_insert" ON public.ticket_messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id AND
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = ticket_id AND (t.user_id = auth.uid() OR public.is_admin())
    )
  );

-- ================================================================
-- BROADCASTS
-- ================================================================
CREATE POLICY "broadcasts_read" ON public.broadcasts
  FOR SELECT USING (
    is_active = TRUE AND (
      target = 'all'
      OR (target = 'merchants' AND public.get_user_role() = 'merchant')
      OR (target = 'it' AND public.is_admin())
      OR public.is_admin()
    )
  );

CREATE POLICY "broadcasts_admin_manage" ON public.broadcasts
  FOR ALL USING (public.is_super_owner());

-- ================================================================
-- AUDIT TRAIL
-- ================================================================
CREATE POLICY "audit_admin" ON public.audit_trail
  FOR SELECT USING (public.is_admin());

CREATE POLICY "audit_insert" ON public.audit_trail
  FOR INSERT WITH CHECK (TRUE);

-- ================================================================
-- GRANT anon/authenticated roles access
-- ================================================================
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.stores TO authenticated;
GRANT SELECT ON public.store_api_keys TO authenticated;
GRANT SELECT ON public.analytics_logs TO authenticated;
GRANT SELECT ON public.engine_heartbeats TO authenticated;
GRANT SELECT ON public.security_alerts TO authenticated;
GRANT SELECT ON public.system_logs TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT SELECT, INSERT ON public.ticket_messages TO authenticated;
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT INSERT ON public.broadcasts TO authenticated;
GRANT UPDATE ON public.broadcasts TO authenticated;
GRANT SELECT, INSERT ON public.audit_trail TO authenticated;
