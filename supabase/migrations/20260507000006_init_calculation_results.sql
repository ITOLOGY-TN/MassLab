-- Phase 1, T010: shared audit log for persisted calculator runs.
-- Constitution v1.1.1 Principle I: athlete-scoped + RLS in the same migration.
-- Append-only: enforced by reviewers (no schema-level trigger in Phase 1).

create table if not exists public.calculation_results (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  calculator text not null check (calculator in (
    'bmr',
    'tdee',
    'macros',
    'one_rep_max',
    'body_composition',
    'progression_eval',
    'program_generate'
  )),
  inputs jsonb not null,
  outputs jsonb not null,
  resolved_constants jsonb not null,
  engine_version text not null,
  produced_record_kind text,
  produced_record_id text,
  created_at timestamptz not null default now()
);

create index if not exists calculation_results_timeline_idx
  on public.calculation_results (athlete_id, created_at desc);
create index if not exists calculation_results_per_calc_idx
  on public.calculation_results (athlete_id, calculator, created_at desc);

alter table public.calculation_results enable row level security;
drop policy if exists calculation_results_select_own on public.calculation_results;
create policy calculation_results_select_own on public.calculation_results
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists calculation_results_modify_own on public.calculation_results;
create policy calculation_results_modify_own on public.calculation_results
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
