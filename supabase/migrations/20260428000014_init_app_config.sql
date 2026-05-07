create table if not exists public.app_config (
  athlete_id uuid primary key references public.athletes(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark', 'light')),
  units text not null default 'kg' check (units in ('kg', 'lbs')),
  rest_timer_sound boolean not null default true,
  daily_kcal_override int,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;
drop policy if exists app_config_self on public.app_config;
create policy app_config_self on public.app_config
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));

drop trigger if exists app_config_set_updated_at on public.app_config;
create trigger app_config_set_updated_at
  before update on public.app_config
  for each row execute function public.set_updated_at();
