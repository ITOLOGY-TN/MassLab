-- Phase 9 (012-phase9-recovery-wellbeing) — extend the Phase 0 daily recovery log
-- with the three signals this phase introduces. No new table; RLS unchanged (the
-- Phase 0 recovery_log_select_own / recovery_log_modify_own policies already key on
-- athlete_id and cover added columns). Forward-only, replayable.

-- Sleep quality stars (1–5), distinct from sleep_hours.
alter table public.recovery_log
  add column if not exists sleep_quality int
    check (sleep_quality is null or sleep_quality between 1 and 5);

-- Mood key (validated at the controller against RECOVERY_MOOD_OPTIONS).
alter table public.recovery_log
  add column if not exists mood text;

-- Set of sore muscle zones (no per-zone intensity, research D-1). Empty set = the
-- athlete reported no soreness that day (distinct from "no check-in" = no row).
alter table public.recovery_log
  add column if not exists sore_zones text[] not null default '{}';
