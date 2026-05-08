-- Phase 2, foundational: add a `reason` column to calculation_results so the
-- Phase 2 audit invariant (FR-003a) can attach semantic context to each row
-- (e.g. profile_save, override_set, override_cleared) without overloading the
-- existing `calculator` column whose CHECK constraint enumerates engine kinds.
--
-- Forward-only and idempotent. The column is nullable so Phase 0/1 rows
-- (which don't carry a reason) remain valid.

alter table public.calculation_results
  add column if not exists reason text;

-- Drop the old CHECK constraint to allow Phase 2 calculator values
-- (e.g. profile_save) without breaking Phase 0/1 rows. The reason column now
-- carries the semantic distinction; the calculator column stays free-form.
alter table public.calculation_results
  drop constraint if exists calculation_results_calculator_check;

create index if not exists calculation_results_reason_idx
  on public.calculation_results (athlete_id, reason)
  where reason is not null;
