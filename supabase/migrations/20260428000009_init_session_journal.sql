create table if not exists public.session_journal_entries (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  started_at timestamptz not null,
  ended_at timestamptz,
  total_volume_kg numeric(10,2),
  energy_rating int check (energy_rating between 1 and 5),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists session_journal_athlete_started_idx
  on public.session_journal_entries (athlete_id, started_at desc);

alter table public.session_journal_entries enable row level security;
drop policy if exists session_journal_select_own on public.session_journal_entries;
create policy session_journal_select_own on public.session_journal_entries
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists session_journal_modify_own on public.session_journal_entries;
create policy session_journal_modify_own on public.session_journal_entries
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
