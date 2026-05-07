-- 20260428000001_init_athletes.sql
-- Phase 0 migration #1: athletes table + pgcrypto + RLS.
-- Constitution v1.1.1 Principle I: every domain table ships RLS in the same migration.

create extension if not exists "pgcrypto";

create table if not exists public.athletes (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  email text not null,
  display_name text,
  age int not null,
  biological_sex text not null check (biological_sex in ('male', 'female')),
  height_cm numeric(5,1) not null,
  starting_weight_kg numeric(5,2) not null,
  target_weight_kg numeric(5,2) not null,
  morphotype text not null check (morphotype in ('ectomorph', 'mesomorph', 'endomorph')),
  goal text not null check (goal in ('bulk', 'cut', 'maintain')),
  weekly_session_count int not null check (weekly_session_count between 1 and 7),
  available_equipment text[] not null default '{}',
  injuries text[] not null default '{}',
  program_start_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.athletes
  add constraint athletes_email_unique unique (email);

alter table public.athletes enable row level security;

drop policy if exists athletes_self on public.athletes;
create policy athletes_self on public.athletes
  for all
  using (auth_user_id = auth.uid())
  with check (auth_user_id = auth.uid());

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists athletes_set_updated_at on public.athletes;
create trigger athletes_set_updated_at
  before update on public.athletes
  for each row execute function public.set_updated_at();
