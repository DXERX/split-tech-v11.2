-- 015 — Fix migration error: cannot change return type of existing function
-- If attendance_heartbeat was ever created with a different return type, CREATE OR REPLACE
-- fails. Drop the (text, boolean, int) signature explicitly, then recreate as VOID.

DROP FUNCTION IF EXISTS public.attendance_heartbeat(TEXT, BOOLEAN, INT);

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

GRANT EXECUTE ON FUNCTION public.attendance_heartbeat(TEXT, BOOLEAN, INT) TO authenticated;
