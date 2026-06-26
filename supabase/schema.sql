-- OOXii Assist Week 7 PoC schema
-- Run in Supabase SQL editor.

create table if not exists public.testers (
  id text primary key,
  role text not null,
  experience_level text not null check (experience_level in ('beginner', 'experienced', 'trainer')),
  home_base text not null,
  preferred_language text not null,
  instruction_mode text not null check (instruction_mode in ('beginner', 'concise')),
  is_new_tester boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  age_band text not null,
  gender text not null,
  cataract_history text not null check (cataract_history in ('yes', 'no', 'unknown')),
  location_site text not null,
  currently_has_glasses text not null check (currently_has_glasses in ('yes', 'no', 'unknown')),
  created_at timestamptz not null default now()
);

create table if not exists public.language_packs (
  code text primary key,
  name text not null,
  downloaded boolean not null default false,
  prompts_json jsonb not null default '[]'::jsonb,
  audio_available boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.test_records (
  id uuid primary key,
  client_id text not null,
  tester_id text not null,
  language text not null,
  status text not null,
  sync_status text not null,
  connection_status text not null,
  audio_local_url text,
  transcript_text text,
  extracted_json jsonb not null default '{}'::jsonb,
  confidence_score numeric not null default 0,
  missing_fields text[] not null default '{}',
  qc_status text not null default 'Unreviewed',
  client_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Basic RLS for a classroom PoC. Keep restrictive by default; loosen only for demo environments.
alter table public.testers enable row level security;
alter table public.clients enable row level security;
alter table public.language_packs enable row level security;
alter table public.test_records enable row level security;

-- Demo policies: allow anonymous reads/writes when using the public anon key for Week 7.
-- For production, replace these with authenticated tester/admin policies.
drop policy if exists "demo read testers" on public.testers;
create policy "demo read testers" on public.testers for select using (true);
drop policy if exists "demo write testers" on public.testers;
create policy "demo write testers" on public.testers for insert with check (true);

drop policy if exists "demo read clients" on public.clients;
create policy "demo read clients" on public.clients for select using (true);
drop policy if exists "demo write clients" on public.clients;
create policy "demo write clients" on public.clients for insert with check (true);

drop policy if exists "demo read language packs" on public.language_packs;
create policy "demo read language packs" on public.language_packs for select using (true);
drop policy if exists "demo write language packs" on public.language_packs;
create policy "demo write language packs" on public.language_packs for all using (true) with check (true);

drop policy if exists "demo read test records" on public.test_records;
create policy "demo read test records" on public.test_records for select using (true);
drop policy if exists "demo write test records" on public.test_records;
create policy "demo write test records" on public.test_records for all using (true) with check (true);
