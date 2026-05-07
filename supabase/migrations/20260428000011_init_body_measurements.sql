create table if not exists public.body_measurements (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  measured_on date not null,
  weight_kg numeric(5,2),
  arm_cm numeric(5,2),
  chest_cm numeric(5,2),
  thigh_cm numeric(5,2),
  shoulder_cm numeric(5,2),
  waist_cm numeric(5,2),
  note text,
  unique (athlete_id, measured_on)
);

alter table public.body_measurements enable row level security;
drop policy if exists body_measurements_select_own on public.body_measurements;
create policy body_measurements_select_own on public.body_measurements
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists body_measurements_modify_own on public.body_measurements;
create policy body_measurements_modify_own on public.body_measurements
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
