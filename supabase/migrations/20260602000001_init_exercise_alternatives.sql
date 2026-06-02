-- Phase 3 (006-training-program-library) — exercise alternatives.
-- One-directional, athlete-owned link from a source exercise to an alternative.
-- research D-6 / D-7; data-model.md §1. Forward-only; RLS ships in this file.

create table if not exists public.exercise_alternatives (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  alternative_exercise_id bigint not null references public.exercises(id) on delete cascade,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint exercise_alternatives_no_self check (exercise_id <> alternative_exercise_id),
  unique (athlete_id, exercise_id, alternative_exercise_id)
);

create index if not exists exercise_alternatives_athlete_source_idx
  on public.exercise_alternatives (athlete_id, exercise_id, display_order);

alter table public.exercise_alternatives enable row level security;

drop policy if exists exercise_alternatives_select_own on public.exercise_alternatives;
create policy exercise_alternatives_select_own on public.exercise_alternatives
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));

drop policy if exists exercise_alternatives_modify_own on public.exercise_alternatives;
create policy exercise_alternatives_modify_own on public.exercise_alternatives
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
