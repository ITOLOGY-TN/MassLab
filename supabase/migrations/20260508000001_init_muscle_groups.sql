-- Phase 2 US2 (T020): per-athlete muscle-group catalogue.
-- Replaces the free-text `weekly_plan_slots.muscle_group` column.
-- Constitution Principle I: athlete-scoped + RLS in the same migration.

create table if not exists public.muscle_groups (
  id            bigint generated always as identity primary key,
  athlete_id    uuid not null references public.athletes(id) on delete cascade,
  slug          text not null,
  name          text not null,
  display_color text not null default '#6b7280',
  is_active     boolean not null default true,
  sort_order    int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  archived_at   timestamptz,
  unique (athlete_id, slug),
  check (char_length(name) between 1 and 40),
  check (display_color ~ '^#[0-9a-fA-F]{6}$')
);

create index if not exists muscle_groups_athlete_idx on public.muscle_groups (athlete_id);
create index if not exists muscle_groups_athlete_active_idx
  on public.muscle_groups (athlete_id) where is_active;

alter table public.muscle_groups enable row level security;
drop policy if exists muscle_groups_select_own on public.muscle_groups;
create policy muscle_groups_select_own on public.muscle_groups
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
drop policy if exists muscle_groups_modify_own on public.muscle_groups;
create policy muscle_groups_modify_own on public.muscle_groups
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
