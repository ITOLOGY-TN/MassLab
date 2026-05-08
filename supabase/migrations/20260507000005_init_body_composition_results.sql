create table if not exists public.body_composition_results (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  source_measurement_id bigint references public.body_measurements(id) on delete set null,
  method text not null check (method in ('us_navy', 'bmi_fallback')),
  body_fat_pct numeric(4,1) not null,
  lean_body_mass_kg numeric(5,2) not null,
  inputs jsonb not null,
  engine_version text not null,
  resolved_constants jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists body_composition_results_timeline_idx
  on public.body_composition_results (athlete_id, created_at desc);

alter table public.body_composition_results enable row level security;
drop policy if exists body_composition_results_select_own on public.body_composition_results;
create policy body_composition_results_select_own on public.body_composition_results
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists body_composition_results_modify_own on public.body_composition_results;
create policy body_composition_results_modify_own on public.body_composition_results
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
