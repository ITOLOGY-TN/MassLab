-- Phase 2 US4 (T049): drop the legacy single-column override (Decision D-3).
-- Replaced by `engine_overrides.nutrition.*`.
alter table public.app_config
  drop column if exists daily_kcal_override;
