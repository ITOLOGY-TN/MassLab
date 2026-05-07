create table if not exists public.exercises (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slug text not null,
  locale text not null,
  name text not null,
  targeted_muscles text[] not null default '{}',
  instructions text not null,
  technique_points text[] not null default '{}',
  media_image_url text,
  media_video_url text,
  created_at timestamptz not null default now(),
  unique (athlete_id, slug, locale)
);
create index if not exists exercises_athlete_idx on public.exercises (athlete_id);

alter table public.exercises enable row level security;
drop policy if exists exercises_select_own on public.exercises;
create policy exercises_select_own on public.exercises
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists exercises_modify_own on public.exercises;
create policy exercises_modify_own on public.exercises
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
