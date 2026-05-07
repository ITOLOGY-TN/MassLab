create table if not exists public.training_phases (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slug text not null,
  locale text not null,
  name text not null,
  description text not null,
  weeks int not null,
  rest_seconds int not null,
  intensity_pct_min int not null,
  intensity_pct_max int not null,
  display_order int not null,
  unique (athlete_id, slug, locale)
);

alter table public.training_phases enable row level security;
drop policy if exists training_phases_select_own on public.training_phases;
create policy training_phases_select_own on public.training_phases
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists training_phases_modify_own on public.training_phases;
create policy training_phases_modify_own on public.training_phases
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
