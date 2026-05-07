create table if not exists public.quotes (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  slug text not null,
  locale text not null,
  text text not null,
  author text,
  unique (athlete_id, slug, locale)
);

alter table public.quotes enable row level security;
drop policy if exists quotes_select_own on public.quotes;
create policy quotes_select_own on public.quotes
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists quotes_modify_own on public.quotes;
create policy quotes_modify_own on public.quotes
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
