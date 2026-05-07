create table if not exists public.supplements (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slug text not null,
  locale text not null,
  name text not null,
  dosage text not null,
  recommended_time text not null,
  notes text,
  display_order int not null,
  unique (athlete_id, slug, locale)
);

alter table public.supplements enable row level security;
drop policy if exists supplements_select_own on public.supplements;
create policy supplements_select_own on public.supplements
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists supplements_modify_own on public.supplements;
create policy supplements_modify_own on public.supplements
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
