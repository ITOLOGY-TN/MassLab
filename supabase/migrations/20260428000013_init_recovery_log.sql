create table if not exists public.recovery_log (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  logged_on date not null,
  sleep_hours numeric(3,1),
  soreness int check (soreness between 0 and 10),
  energy int check (energy between 0 and 10),
  stress int check (stress between 0 and 10),
  note text,
  created_at timestamptz not null default now(),
  unique (athlete_id, logged_on)
);

alter table public.recovery_log enable row level security;
drop policy if exists recovery_log_select_own on public.recovery_log;
create policy recovery_log_select_own on public.recovery_log
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists recovery_log_modify_own on public.recovery_log;
create policy recovery_log_modify_own on public.recovery_log
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
