-- Phase 2 US2 (T023): finalize the FK and retire the free-text column.
-- Run only after the backfill (000003) has populated muscle_group_id for every row.

alter table public.weekly_plan_slots
  alter column muscle_group_id set not null;

alter table public.weekly_plan_slots
  drop column if exists muscle_group;
