-- ================================================================
-- 006 — STAFF PRESENCE + ATTENDANCE + ACTION AUDIT
-- ================================================================
--   * staff_attendance         (one row per user per work day)
--   * staff_presence_events    (login / page change / logout)
--   * staff_action_logs        (admin action audit)
--   * RPCs: punch / heartbeat / punch_out / log_staff_action
--   * View: daily_attendance_view
--   * RLS: own row visible to user; super_owner + it_support see all
-- ================================================================

-- ---------------------------------------------------------------
-- Helper: is_super_or_it()
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_or_it(uid UUID DEFAULT auth.uid())
RETURNS BOOLEAN LANGUAGE SQL SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = uid
      AND role IN ('super_owner', 'it_support')
  );
$$;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

-- One row per user per day. Heartbeats update last_active_at + counters.
CREATE TABLE IF NOT EXISTS public.staff_attendance (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            TEXT,
  work_date       DATE NOT NULL DEFAULT (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE,
  check_in_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_out_at    TIMESTAMPTZ,
  active_seconds  INT NOT NULL DEFAULT 0,
  idle_seconds    INT NOT NULL DEFAULT 0,
  heartbeat_count INT NOT NULL DEFAULT 0,
  current_page    TEXT,
  first_ip        INET,
  last_ip         INET,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, work_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_user_date
  ON public.staff_attendance (user_id, work_date DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_active
  ON public.staff_attendance (last_active_at DESC);
ALTER TABLE public.staff_attendance ENABLE ROW LEVEL SECURITY;

-- Append-only timeline of presence transitions
CREATE TABLE IF NOT EXISTS public.staff_presence_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT,
  event       TEXT NOT NULL CHECK (event IN ('login', 'logout', 'page_change')),
  page        TEXT,
  ip          INET,
  user_agent  TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_presence_events_user
  ON public.staff_presence_events (user_id, occurred_at DESC);
ALTER TABLE public.staff_presence_events ENABLE ROW LEVEL SECURITY;

-- Admin action audit
CREATE TABLE IF NOT EXISTS public.staff_action_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT,
  action      TEXT NOT NULL,
  target_type TEXT,
  target_id   TEXT,
  page        TEXT,
  ip          INET,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_action_logs_user
  ON public.staff_action_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_action_logs_action
  ON public.staff_action_logs (action, created_at DESC);
ALTER TABLE public.staff_action_logs ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------
-- RLS — own row to user, full access to super_owner + it_support
-- ---------------------------------------------------------------

DROP POLICY IF EXISTS "attendance_self_select" ON public.staff_attendance;
DROP POLICY IF EXISTS "attendance_admin_all"   ON public.staff_attendance;
CREATE POLICY "attendance_self_select" ON public.staff_attendance
  FOR SELECT USING (auth.uid() = user_id OR public.is_super_or_it());
CREATE POLICY "attendance_admin_all" ON public.staff_attendance
  FOR ALL USING (public.is_super_or_it())
  WITH CHECK (public.is_super_or_it());

DROP POLICY IF EXISTS "presence_self_select" ON public.staff_presence_events;
DROP POLICY IF EXISTS "presence_admin_all"   ON public.staff_presence_events;
CREATE POLICY "presence_self_select" ON public.staff_presence_events
  FOR SELECT USING (auth.uid() = user_id OR public.is_super_or_it());
CREATE POLICY "presence_admin_all" ON public.staff_presence_events
  FOR ALL USING (public.is_super_or_it())
  WITH CHECK (public.is_super_or_it());

DROP POLICY IF EXISTS "actions_self_select" ON public.staff_action_logs;
DROP POLICY IF EXISTS "actions_admin_all"   ON public.staff_action_logs;
CREATE POLICY "actions_self_select" ON public.staff_action_logs
  FOR SELECT USING (auth.uid() = user_id OR public.is_super_or_it());
CREATE POLICY "actions_admin_all" ON public.staff_action_logs
  FOR ALL USING (public.is_super_or_it())
  WITH CHECK (public.is_super_or_it());

GRANT SELECT ON public.staff_attendance        TO authenticated;
GRANT SELECT ON public.staff_presence_events   TO authenticated;
GRANT SELECT ON public.staff_action_logs       TO authenticated;

-- ---------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------

-- First heartbeat of the day. Idempotent — reuses today's row.
CREATE OR REPLACE FUNCTION public.attendance_punch(
  _page TEXT DEFAULT NULL,
  _ua   TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_role  TEXT;
  v_id    UUID;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.staff_attendance (user_id, role, work_date, current_page, user_agent)
  VALUES (v_uid, v_role, v_today, _page, _ua)
  ON CONFLICT (user_id, work_date) DO UPDATE
    SET last_active_at = NOW(),
        current_page   = COALESCE(EXCLUDED.current_page, public.staff_attendance.current_page),
        user_agent     = COALESCE(EXCLUDED.user_agent,   public.staff_attendance.user_agent),
        updated_at     = NOW()
  RETURNING id INTO v_id;

  INSERT INTO public.staff_presence_events (user_id, role, event, page, user_agent)
  VALUES (v_uid, v_role, 'login', _page, _ua);

  RETURN v_id;
END;
$$;

-- Periodic heartbeat from the client.
-- _delta_seconds is the elapsed window since the last heartbeat (typically 300 = 5 min).
CREATE OR REPLACE FUNCTION public.attendance_heartbeat(
  _page          TEXT    DEFAULT NULL,
  _is_active     BOOLEAN DEFAULT TRUE,
  _delta_seconds INT     DEFAULT 60
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_role  TEXT;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.staff_attendance (user_id, role, work_date, current_page)
  VALUES (v_uid, v_role, v_today, _page)
  ON CONFLICT (user_id, work_date) DO NOTHING;

  UPDATE public.staff_attendance
     SET last_active_at  = NOW(),
         current_page    = COALESCE(_page, current_page),
         heartbeat_count = heartbeat_count + 1,
         active_seconds  = active_seconds
                          + CASE WHEN _is_active     THEN GREATEST(_delta_seconds, 0) ELSE 0 END,
         idle_seconds    = idle_seconds
                          + CASE WHEN NOT _is_active THEN GREATEST(_delta_seconds, 0) ELSE 0 END,
         updated_at      = NOW()
   WHERE user_id = v_uid AND work_date = v_today;
END;
$$;

CREATE OR REPLACE FUNCTION public.attendance_punch_out()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_role  TEXT;
  v_today DATE := (NOW() AT TIME ZONE 'Asia/Riyadh')::DATE;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  UPDATE public.staff_attendance
     SET check_out_at = NOW(), updated_at = NOW()
   WHERE user_id = v_uid AND work_date = v_today;

  INSERT INTO public.staff_presence_events (user_id, role, event)
  VALUES (v_uid, v_role, 'logout');
END;
$$;

-- Generic "I performed an action" audit hook for admin pages.
CREATE OR REPLACE FUNCTION public.log_staff_action(
  _action      TEXT,
  _target_type TEXT  DEFAULT NULL,
  _target_id   TEXT  DEFAULT NULL,
  _page        TEXT  DEFAULT NULL,
  _metadata    JSONB DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  UUID := auth.uid();
  v_role TEXT;
  v_id   UUID;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  SELECT role INTO v_role FROM public.user_roles WHERE user_id = v_uid LIMIT 1;

  INSERT INTO public.staff_action_logs (user_id, role, action, target_type, target_id, page, metadata)
  VALUES (v_uid, v_role, _action, _target_type, _target_id, _page, _metadata)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.attendance_punch(TEXT, TEXT)              TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_heartbeat(TEXT, BOOLEAN, INT)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.attendance_punch_out()                    TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_staff_action(TEXT, TEXT, TEXT, TEXT, JSONB) TO authenticated;

-- ---------------------------------------------------------------
-- Reporting view (joins profile + derived totals)
-- ---------------------------------------------------------------
CREATE OR REPLACE VIEW public.daily_attendance_view
WITH (security_invoker = true) AS
SELECT
  a.id,
  a.user_id,
  a.role,
  a.work_date,
  a.check_in_at,
  a.check_out_at,
  a.last_active_at,
  a.active_seconds,
  a.idle_seconds,
  (a.active_seconds + a.idle_seconds) AS total_seconds,
  a.heartbeat_count,
  a.current_page,
  a.first_ip,
  a.last_ip,
  p.full_name
FROM public.staff_attendance a
LEFT JOIN public.profiles p ON p.id = a.user_id;

GRANT SELECT ON public.daily_attendance_view TO authenticated;

-- ---------------------------------------------------------------
-- Realtime publication — admin live view subscribes to changes
-- ---------------------------------------------------------------
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_attendance;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
