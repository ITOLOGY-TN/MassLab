create table if not exists public.progression_flags (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  scope_kind text not null check (scope_kind in ('exercise', 'muscle_group')),
  scope_ref text not null,
  flag_type text not null check (flag_type in (
    'add_load', 'maintain', 'stagnation', 'regression', 'deload_suggested'
  )),
  rule text not null,
  suggested_adjustment jsonb,
  engine_version text not null,
  resolved_constants jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  superseded_at timestamptz
);

create unique index if not exists progression_flags_one_active_per_scope
  on public.progression_flags (athlete_id, scope_kind, scope_ref) where is_active = true;
create index if not exists progression_flags_history_idx
  on public.progression_flags (athlete_id, created_at desc);

alter table public.progression_flags enable row level security;
drop policy if exists progression_flags_select_own on public.progression_flags;
create policy progression_flags_select_own on public.progression_flags
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists progression_flags_modify_own on public.progression_flags;
create policy progression_flags_modify_own on public.progression_flags
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
