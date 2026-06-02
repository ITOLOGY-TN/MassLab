-- Phase 4 (007-session-journal) — record the targeted training day on a session
-- so the journal can recompose the planned exercises on resume and distinguish
-- planned vs ad-hoc sessions (research D-3). Nullable + additive; the existing
-- session_journal_* RLS (keyed on athlete_id) covers the new column unchanged.
alter table public.session_journal_entries
  add column if not exists day_of_week int
    check (day_of_week is null or day_of_week between 1 and 7);

-- Fast lookup of the athlete's single in-progress session (ended_at IS NULL), D-2.
create index if not exists session_journal_athlete_active_idx
  on public.session_journal_entries (athlete_id, ended_at)
  where ended_at is null;
