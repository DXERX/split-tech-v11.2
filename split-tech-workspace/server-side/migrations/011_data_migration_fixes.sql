-- 011_data_migration_fixes.sql
-- Columns present in Supabase but missing from Cloud SQL schema.
-- Discovered during Phase 8 data migration import run.

-- stores
ALTER TABLE public.stores ADD COLUMN IF NOT EXISTS remote_command_at TIMESTAMPTZ;

-- support_tickets
ALTER TABLE public.support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ;

-- config_snapshots
ALTER TABLE public.config_snapshots ADD COLUMN IF NOT EXISTS reason TEXT;

-- bot_knowledge_base
ALTER TABLE public.bot_knowledge_base ADD COLUMN IF NOT EXISTS created_by UUID;

-- bot_conversations — stores the full message array (Supabase used a JSONB column)
ALTER TABLE public.bot_conversations ADD COLUMN IF NOT EXISTS messages JSONB;

-- user_roles: drop the role check constraint so Supabase role values import cleanly.
-- The app enforces valid roles at the application layer; the DB constraint can be
-- re-added once we confirm the full set of role values in production.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
