-- Phase 1, T008: extend athletes with the five-level activity factor.
-- weekly_session_count (Phase 0) describes training frequency; activity_level
-- describes daily lifestyle activity. They are independent inputs.

alter table public.athletes
  add column if not exists activity_level text not null default 'moderately_active'
    check (activity_level in (
      'sedentary',
      'lightly_active',
      'moderately_active',
      'very_active',
      'extremely_active'
    ));
