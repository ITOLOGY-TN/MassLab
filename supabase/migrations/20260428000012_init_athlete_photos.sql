create table if not exists public.athlete_photos (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  taken_on date not null,
  storage_key text not null,
  weight_overlay_kg numeric(5,2),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists athlete_photos_athlete_taken_idx on public.athlete_photos (athlete_id, taken_on desc);

alter table public.athlete_photos enable row level security;
drop policy if exists athlete_photos_select_own on public.athlete_photos;
create policy athlete_photos_select_own on public.athlete_photos
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists athlete_photos_modify_own on public.athlete_photos;
create policy athlete_photos_modify_own on public.athlete_photos
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
