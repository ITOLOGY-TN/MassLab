create table if not exists public.weekly_plan_slots (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  day_of_week int not null check (day_of_week between 1 and 7),
  muscle_group text not null,
  display_color text not null,
  display_order int not null,
  created_at timestamptz not null default now(),
  unique (athlete_id, day_of_week)
);

create table if not exists public.weekly_plan_exercises (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slot_id bigint not null references public.weekly_plan_slots(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id),
  position int not null,
  target_sets int not null,
  target_reps_low int not null,
  target_reps_high int not null,
  unique (slot_id, position)
);
create index if not exists weekly_plan_exercises_athlete_idx on public.weekly_plan_exercises (athlete_id);

alter table public.weekly_plan_slots enable row level security;
drop policy if exists weekly_plan_slots_select_own on public.weekly_plan_slots;
create policy weekly_plan_slots_select_own on public.weekly_plan_slots
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists weekly_plan_slots_modify_own on public.weekly_plan_slots;
create policy weekly_plan_slots_modify_own on public.weekly_plan_slots
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));

alter table public.weekly_plan_exercises enable row level security;
drop policy if exists weekly_plan_exercises_select_own on public.weekly_plan_exercises;
create policy weekly_plan_exercises_select_own on public.weekly_plan_exercises
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists weekly_plan_exercises_modify_own on public.weekly_plan_exercises;
create policy weekly_plan_exercises_modify_own on public.weekly_plan_exercises
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
