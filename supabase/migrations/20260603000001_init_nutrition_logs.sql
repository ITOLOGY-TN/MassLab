create table if not exists public.nutrition_logs (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  logged_on date not null,
  slot text not null check (slot in ('breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack')),
  food_id bigint not null references public.foods(id) on delete restrict,
  food_name text not null,
  quantity_g numeric(7, 2) not null,
  kcal numeric(7, 2) not null,
  protein_g numeric(6, 2) not null,
  carbs_g numeric(6, 2) not null,
  fat_g numeric(6, 2) not null,
  created_at timestamptz not null default now()
);
create index if not exists nutrition_logs_athlete_day_idx on public.nutrition_logs (athlete_id, logged_on);

alter table public.nutrition_logs enable row level security;
drop policy if exists nutrition_logs_select_own on public.nutrition_logs;
create policy nutrition_logs_select_own on public.nutrition_logs
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists nutrition_logs_modify_own on public.nutrition_logs;
create policy nutrition_logs_modify_own on public.nutrition_logs
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
