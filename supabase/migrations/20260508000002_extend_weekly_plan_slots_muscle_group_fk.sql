-- Phase 2 US2 (T021): add nullable FK to weekly_plan_slots.
-- The backfill migration populates this column; the finalize migration
-- sets it NOT NULL and drops the old text column.

alter table public.weekly_plan_slots
  add column if not exists muscle_group_id bigint
  references public.muscle_groups(id) on delete restrict;

create index if not exists weekly_plan_slots_muscle_group_idx
  on public.weekly_plan_slots (muscle_group_id);
