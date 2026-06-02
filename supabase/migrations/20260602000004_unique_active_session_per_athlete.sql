-- Phase 4 follow-up — enforce "at most one in-progress session per athlete" at
-- the database level (SC-004 / research D-2). The controller already rejects a
-- second start with ACTIVE_SESSION_EXISTS; this UNIQUE partial index closes the
-- TOCTOU race as defense-in-depth and still serves the active-session lookup.
-- Replaces the non-unique active index from 20260602000002. Safe: no athlete
-- currently has more than one in-progress session.
drop index if exists public.session_journal_athlete_active_idx;

create unique index if not exists session_journal_one_active_per_athlete
  on public.session_journal_entries (athlete_id)
  where ended_at is null;
