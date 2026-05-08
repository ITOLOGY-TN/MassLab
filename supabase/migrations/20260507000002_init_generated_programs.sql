-- Phase 1, T009: generated_programs (soft-archive versioned).
-- Constitution v1.1.1 Principle I: every domain table ships RLS in the same migration.
-- Invariant: at most one row per athlete carries is_active = true (partial-unique index).

create table if not exists public.generated_programs (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  payload jsonb not null,
  engine_version text not null,
  resolved_constants jsonb not null,
  is_active boolean not null default true,
  generated_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists generated_programs_one_active_per_athlete
  on public.generated_programs (athlete_id) where is_active = true;
create index if not exists generated_programs_history_idx
  on public.generated_programs (athlete_id, generated_at desc);

alter table public.generated_programs enable row level security;
drop policy if exists generated_programs_select_own on public.generated_programs;
create policy generated_programs_select_own on public.generated_programs
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists generated_programs_modify_own on public.generated_programs;
create policy generated_programs_modify_own on public.generated_programs
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
