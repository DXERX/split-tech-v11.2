-- 014 — Cloud SQL alignment (mirrors splittech-api runMigrations bootstrap)
-- Apply via Supabase CLI / psql if you manage schema outside Cloud Run migrations.
-- 1) rollback_log.store_id → stores(id) for PostgREST embeds (e.g. stores(name))
-- 2) staff attendance tables + RPCs + daily_attendance_view + GRANT EXECUTE (authenticated)

DELETE FROM public.rollback_log r
WHERE NOT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = r.store_id);

DO $fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rollback_log_store_id_fkey'
  ) THEN
    ALTER TABLE public.rollback_log
      ADD CONSTRAINT rollback_log_store_id_fkey
      FOREIGN KEY (store_id) REFERENCES public.stores(id) ON DELETE CASCADE;
  END IF;
END $fk$;

-- Remainder: see supabase/migrations/006_presence_attendance.sql for full definitions.
-- Cloud Run applies the same objects from cloud-run/splittech-api/server.js (runMigrations).
