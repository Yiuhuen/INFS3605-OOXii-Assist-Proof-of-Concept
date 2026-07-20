-- OOXii Assist Week 7 PoC schema
-- Run in Supabase SQL editor.

create table if not exists public.testers (
  id text primary key,
  name text not null default '',
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
  tester_note text not null default '',
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
  session_id text not null default '',
  client_id text not null,
  tester_id text not null,
  deployment_site text not null default '',
  language text not null,
  status text not null,
  sync_status text not null,
  connection_status text not null,
  audio_local_url text,
  recording_status text not null default 'not_recorded' check (recording_status in ('recorded', 'failed', 'not_recorded', 'manual_override')),
  recording_started_at timestamptz,
  recording_stopped_at timestamptz,
  recording_duration_seconds numeric not null default 0,
  manual_override_reason text not null default '',
  raw_transcript_text text,
  raw_transcript_language text not null default 'en',
  english_processing_transcript text not null default '',
  transcript_segments jsonb not null default '[]'::jsonb,
  prompt_markers jsonb not null default '[]'::jsonb,
  unclear_segments jsonb not null default '[]'::jsonb,
  corrected_transcript_text text not null default '',
  extracted_json jsonb not null default '{}'::jsonb,
  edited_extracted_json jsonb,
  extraction_source text not null default 'raw_transcript' check (extraction_source in ('raw_transcript', 'corrected_transcript', 'manual_override')),
  edited_by_user boolean not null default false,
  requires_qc_verification boolean not null default false,
  confidence_score numeric not null default 0,
  missing_fields text[] not null default '{}',
  qc_status text not null default 'Unreviewed',
  needs_qc boolean not null default true,
  qc_notes text not null default '',
  processing_status text not null default 'not_processed' check (processing_status in ('not_processed', 'ready_for_review', 'needs_qc', 'processed_after_sync')),
  sync_attempts integer not null default 0,
  client_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Migration helper for databases created from an earlier version of this schema.
alter table public.testers add column if not exists name text not null default '';
alter table public.clients add column if not exists tester_note text not null default '';
alter table public.test_records add column if not exists recording_status text not null default 'not_recorded';
alter table public.test_records add column if not exists manual_override_reason text not null default '';
alter table public.test_records add column if not exists raw_transcript_text text;
alter table public.test_records add column if not exists corrected_transcript_text text not null default '';
alter table public.test_records add column if not exists edited_extracted_json jsonb;
alter table public.test_records add column if not exists extraction_source text not null default 'raw_transcript';
alter table public.test_records add column if not exists edited_by_user boolean not null default false;
alter table public.test_records add column if not exists requires_qc_verification boolean not null default false;
alter table public.test_records add column if not exists needs_qc boolean not null default true;
alter table public.test_records add column if not exists raw_transcript_language text not null default 'en';
alter table public.test_records add column if not exists english_processing_transcript text not null default '';
alter table public.test_records add column if not exists transcript_segments jsonb not null default '[]'::jsonb;
alter table public.test_records add column if not exists prompt_markers jsonb not null default '[]'::jsonb;
alter table public.test_records add column if not exists processing_status text not null default 'not_processed';
alter table public.test_records add column if not exists recording_started_at timestamptz;
alter table public.test_records add column if not exists recording_stopped_at timestamptz;
alter table public.test_records add column if not exists recording_duration_seconds numeric not null default 0;
alter table public.test_records add column if not exists unclear_segments jsonb not null default '[]'::jsonb;
alter table public.test_records add column if not exists qc_notes text not null default '';
alter table public.test_records add column if not exists sync_attempts integer not null default 0;
alter table public.test_records add column if not exists session_id text not null default '';
alter table public.test_records add column if not exists deployment_site text not null default '';
alter table public.testers add column if not exists setup_completed boolean not null default false;
alter table public.testers add column if not exists last_active_at timestamptz;

-- Basic RLS for a classroom PoC. Keep restrictive by default; loosen only for demo environments.
alter table public.testers enable row level security;
alter table public.clients enable row level security;
alter table public.language_packs enable row level security;
alter table public.test_records enable row level security;

-- Demo policies: allow authenticated reads/writes when using the anon key for Week 7.
-- For production, replace these with per-tester policies scoped to auth.uid().
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
