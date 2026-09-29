-- 009_schema_fixes.sql
-- Add columns present in Supabase but missing from our initial Cloud SQL schema.
-- Also drop FK constraints that reference auth.users (GoTrue manages users externally).

ALTER TABLE public.config_snapshots     ADD COLUMN IF NOT EXISTS snapshot_label TEXT;
ALTER TABLE public.rollback_log         ADD COLUMN IF NOT EXISTS success BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.bot_knowledge_base   ADD COLUMN IF NOT EXISTS keywords TEXT[];
ALTER TABLE public.bot_conversations    ADD COLUMN IF NOT EXISTS store_id UUID;

-- Drop any FK constraint on these tables that references the auth.users / users table.
-- GoTrue is the source of truth for users; we cannot enforce referential integrity
-- from Cloud SQL to GoTrue's internal user store.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN (
    SELECT tc.constraint_name, tc.table_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
    JOIN information_schema.table_constraints tc2
      ON rc.unique_constraint_name = tc2.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND tc2.table_name IN ('users')          -- catches auth.users refs shown as "users"
  ) LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I',
                   r.table_name, r.constraint_name);
    RAISE NOTICE 'Dropped FK % on %', r.constraint_name, r.table_name;
  END LOOP;
END $$;
