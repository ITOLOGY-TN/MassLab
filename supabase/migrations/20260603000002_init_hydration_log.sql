create table if not exists public.hydration_log (
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  logged_on date not null,
  total_ml int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (athlete_id, logged_on)
);

alter table public.hydration_log enable row level security;
drop policy if exists hydration_log_select_own on public.hydration_log;
create policy hydration_log_select_own on public.hydration_log
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists hydration_log_modify_own on public.hydration_log;
create policy hydration_log_modify_own on public.hydration_log
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
