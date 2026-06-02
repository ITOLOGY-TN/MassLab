-- Phase 4 (007-session-journal) — per-exercise set numbering so multiple
-- exercises in one session can each start at set 1 and extra/ad-hoc sets are
-- allowed (research D-4, FR-010/FR-011a). Safe: Phase 4 is the first writer of
-- session_sets (no production rows); Phase 3 fixtures log a single exercise and
-- satisfy the new key unchanged. RLS unaffected (keyed on athlete_id).
alter table public.session_sets
  drop constraint if exists session_sets_session_id_set_number_key;

alter table public.session_sets
  add constraint session_sets_session_exercise_set_number_key
    unique (session_id, exercise_id, set_number);
