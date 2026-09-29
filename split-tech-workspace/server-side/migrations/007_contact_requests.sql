-- ═══════════════════════════════════════════════════════════════
-- 007 · Contact / Sales Requests
-- ═══════════════════════════════════════════════════════════════

create table if not exists public.contact_requests (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),

  -- Contact
  full_name       text not null,
  company         text,
  phone           text not null,
  email           text not null,
  subject         text not null,
  message         text not null,

  -- Meta
  lang            text default 'ar',      -- ar | en
  source          text default 'website', -- website | social | referral
  status          text default 'new'      -- new | in_progress | resolved | closed
);

-- ── RLS ──────────────────────────────────────────────────────
alter table public.contact_requests enable row level security;

-- Anyone can submit (unauthenticated / public website)
create policy "public_insert_contact_requests"
  on public.contact_requests for insert
  to anon, authenticated
  with check (true);

-- Only authenticated admins can read
create policy "admin_read_contact_requests"
  on public.contact_requests for select
  to authenticated
  using (true);

-- ── Index ─────────────────────────────────────────────────────
create index if not exists idx_contact_requests_created_at
  on public.contact_requests (created_at desc);

create index if not exists idx_contact_requests_status
  on public.contact_requests (status);
