create table if not exists public.one_rep_max_records (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id),
  source_weight_kg numeric(6,2) not null,
  source_reps int not null,
  primary_estimate_kg numeric(6,2) not null,
  epley_kg numeric(6,2) not null,
  brzycki_kg numeric(6,2) not null,
  lander_kg numeric(6,2) not null,
  lombardi_kg numeric(6,2) not null,
  percentage_table jsonb not null,
  reduced_confidence boolean not null,
  engine_version text not null,
  resolved_constants jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists one_rep_max_records_per_exercise_idx
  on public.one_rep_max_records (athlete_id, exercise_id, created_at desc);

alter table public.one_rep_max_records enable row level security;
drop policy if exists one_rep_max_records_select_own on public.one_rep_max_records;
create policy one_rep_max_records_select_own on public.one_rep_max_records
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists one_rep_max_records_modify_own on public.one_rep_max_records;
create policy one_rep_max_records_modify_own on public.one_rep_max_records
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
