create table if not exists public.session_sets (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  session_id bigint not null references public.session_journal_entries(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id),
  set_number int not null,
  weight_kg numeric(6,2) not null,
  reps int not null,
  rpe int check (rpe between 1 and 10),
  completed boolean not null default false,
  unique (session_id, set_number)
);
create index if not exists session_sets_athlete_exercise_idx on public.session_sets (athlete_id, exercise_id);

alter table public.session_sets enable row level security;
drop policy if exists session_sets_select_own on public.session_sets;
create policy session_sets_select_own on public.session_sets
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists session_sets_modify_own on public.session_sets;
create policy session_sets_modify_own on public.session_sets
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
