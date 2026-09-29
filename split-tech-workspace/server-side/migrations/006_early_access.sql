-- ═══════════════════════════════════════════════════════════════
-- 006 · Early Access Requests
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.early_access_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Contact
  full_name       text not null,
  store_name      text not null,
  business_type   text not null,          -- retail | restaurant | logistics | laundry | other
  phone           text not null,
  email           text not null,
  city            text not null,
  notes           text,

  -- Meta
  lang            text default 'ar',      -- ar | en
  source          text default 'website', -- website | social | referral
  status          text default 'new',     -- new | contacted | converted | rejected

  -- Duplicate guard
  unique (email)
);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.early_access_requests enable row level security;

-- Anyone can submit (unauthenticated / public website)
create policy "public_insert_early_access"
  on public.early_access_requests for insert
  to anon, authenticated
  with check (true);

-- Only authenticated admins can read
create policy "admin_read_early_access"
  on public.early_access_requests for select
  to authenticated
  using (true);

-- ── Index ─────────────────────────────────────────────────────
create index if not exists idx_early_access_created_at
  on public.early_access_requests (created_at desc);

create index if not exists idx_early_access_status
  on public.early_access_requests (status);
