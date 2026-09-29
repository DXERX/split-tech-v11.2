-- 010_remaining_columns.sql
-- Second pass: columns discovered missing during data migration from Supabase.

ALTER TABLE public.config_snapshots   ADD COLUMN IF NOT EXISTS trigger_event TEXT;
ALTER TABLE public.rollback_log        ADD COLUMN IF NOT EXISTS error_detail TEXT;
ALTER TABLE public.bot_knowledge_base  ADD COLUMN IF NOT EXISTS language TEXT NOT NULL DEFAULT 'ar';
ALTER TABLE public.bot_conversations   ADD COLUMN IF NOT EXISTS session_id TEXT;
