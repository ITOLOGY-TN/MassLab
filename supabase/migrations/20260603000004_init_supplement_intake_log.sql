-- Phase 8 (011-phase8-supplements) T002 — supplement_intake_log.
-- Presence of a row ≡ the supplement was taken that day (research D-1). Absence on
-- an elapsed day = missed (derived, D-7). UNIQUE makes "mark taken" idempotent
-- (FR-003/SC-002). supplement_id cascades so a future catalogue deletion cannot
-- orphan adherence rows. RLS *_own ships in-file (Constitution I).
create table if not exists public.supplement_intake_log (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  supplement_id bigint not null references public.supplements(id) on delete cascade,
  logged_on date not null,
  created_at timestamptz not null default now(),
  unique (athlete_id, supplement_id, logged_on)
);
create index if not exists supplement_intake_log_athlete_day_idx
  on public.supplement_intake_log (athlete_id, logged_on);

alter table public.supplement_intake_log enable row level security;
drop policy if exists supplement_intake_log_select_own on public.supplement_intake_log;
create policy supplement_intake_log_select_own on public.supplement_intake_log
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists supplement_intake_log_modify_own on public.supplement_intake_log;
create policy supplement_intake_log_modify_own on public.supplement_intake_log
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
