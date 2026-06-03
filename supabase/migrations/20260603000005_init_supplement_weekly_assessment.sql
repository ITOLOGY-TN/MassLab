-- Phase 8 (011-phase8-supplements) T003 — supplement_weekly_assessment.
-- One row per athlete per ISO week (week_start = Monday). Four 1–5 ratings with
-- DB CHECK constraints as defense-in-depth behind the zod validator (FR-014).
-- UNIQUE enforces "at most one per week" (FR-013). RLS *_own ships in-file.
create table if not exists public.supplement_weekly_assessment (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  week_start date not null,
  energy int not null check (energy between 1 and 5),
  recovery int not null check (recovery between 1 and 5),
  sleep_quality int not null check (sleep_quality between 1 and 5),
  strength int not null check (strength between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (athlete_id, week_start)
);

alter table public.supplement_weekly_assessment enable row level security;
drop policy if exists supplement_weekly_assessment_select_own on public.supplement_weekly_assessment;
create policy supplement_weekly_assessment_select_own on public.supplement_weekly_assessment
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists supplement_weekly_assessment_modify_own on public.supplement_weekly_assessment;
create policy supplement_weekly_assessment_modify_own on public.supplement_weekly_assessment
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
