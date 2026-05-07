create table if not exists public.foods (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slug text not null,
  locale text not null,
  name text not null,
  kcal_per_100g numeric(6,2) not null,
  protein_per_100g numeric(5,2) not null,
  carbs_per_100g numeric(5,2) not null,
  fat_per_100g numeric(5,2) not null,
  category text not null,
  unique (athlete_id, slug, locale)
);
create index if not exists foods_athlete_category_idx on public.foods (athlete_id, category);

alter table public.foods enable row level security;
drop policy if exists foods_select_own on public.foods;
create policy foods_select_own on public.foods
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists foods_modify_own on public.foods;
create policy foods_modify_own on public.foods
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
