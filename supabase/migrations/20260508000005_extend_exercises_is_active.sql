-- Phase 2 US3 (T040): soft-delete flag on exercises (FR-012).
alter table public.exercises
  add column if not exists is_active boolean not null default true;

create index if not exists exercises_athlete_active_idx
  on public.exercises (athlete_id) where is_active;
