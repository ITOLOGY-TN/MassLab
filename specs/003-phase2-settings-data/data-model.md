# Phase 2 — Data Model

**Feature**: 003-phase2-settings-data
**Date**: 2026-05-08

This document enumerates every schema change Phase 2 introduces. All changes are forward-only, ship RLS in the same migration where applicable, and preserve every Phase 0 / Phase 1 invariant (every domain row carries `athlete_id`, no `models/` directory, no destructive Phase 0 migration edits).

---

## New table: `muscle_groups`

The per-athlete catalogue introduced by Clarification Q1. Replaces the free-text `weekly_plan_slots.muscle_group` column.

```sql
create table if not exists public.muscle_groups (
  id           bigint generated always as identity primary key,
  athlete_id   uuid not null references public.athletes(id) on delete cascade,
  slug         text not null,                     -- stable id-string; lower-snake
  name         text not null,                     -- display name; up to 40 chars (FR-008)
  display_color text not null default '#6b7280',  -- 7-char hex; chosen by athlete
  is_active    boolean not null default true,     -- false = soft-archived
  sort_order   int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  archived_at  timestamptz,
  unique (athlete_id, slug),
  check (char_length(name) between 1 and 40),
  check (display_color ~ '^#[0-9a-fA-F]{6}$')
);
create index if not exists muscle_groups_athlete_idx on public.muscle_groups (athlete_id);
create index if not exists muscle_groups_athlete_active_idx
  on public.muscle_groups (athlete_id) where is_active;
```

RLS (same shape as every Phase 0 domain table):

```sql
alter table public.muscle_groups enable row level security;
create policy muscle_groups_select_own on public.muscle_groups
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
create policy muscle_groups_modify_own on public.muscle_groups
  for all
  using   (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
```

**Lifecycle**:
- **Create** (POST): inserts a new row with `is_active = true`. `slug` is derived server-side from `name` (lower-kebab, deduplicated within `athlete_id`).
- **Rename** (PATCH name): updates `name` (and optionally `slug` if the athlete asks); `id` is stable so every reference (slots, historical session attribution) stays correct.
- **Recolor** (PATCH display_color): cosmetic only.
- **Merge** (POST /:id/merge with body `{ target_id }`): `update weekly_plan_slots set muscle_group_id = $target where muscle_group_id = $source and athlete_id = $athlete_id;` then `update sessions ...` (when sessions ship in Phase 4 they will follow the same indirection); finally archive the source row (`is_active = false, archived_at = now()`). Hard-delete is forbidden if any reference exists.
- **Soft-archive** (DELETE when referenced): sets `is_active = false, archived_at = now()`. The row is hidden from pickers and the weekly-plan UI but remains for historical attribution.
- **Hard-delete** (DELETE when not referenced): only if no `weekly_plan_slots` row and no `session*` row references the id.

**Seed**: the existing seed is extended to insert one row per default-split entry — Chest+Triceps, Back+Biceps, Legs-Quads, Shoulders+Traps, Legs-Hams+Glutes — with athlete-scoped `display_color` from the Phase 0 palette.

---

## Schema reshape: `weekly_plan_slots`

Three forward-only migrations replace the free-text `muscle_group` column with a FK to `muscle_groups.id`.

### Step 1 — `20260508000002_extend_weekly_plan_slots_muscle_group_fk.sql`

```sql
alter table public.weekly_plan_slots
  add column muscle_group_id bigint references public.muscle_groups(id) on delete restrict;

create index if not exists weekly_plan_slots_muscle_group_idx
  on public.weekly_plan_slots (muscle_group_id);
```

### Step 2 — `20260508000003_backfill_weekly_plan_slots_muscle_group_id.sql`

Pure SQL data migration. Idempotent (no-op on a fresh database).

```sql
-- 1. Insert one catalogue row per (athlete_id, distinct muscle_group) that does not yet exist.
insert into public.muscle_groups (athlete_id, slug, name, display_color, sort_order)
select s.athlete_id,
       lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g')) as slug,
       s.muscle_group as name,
       coalesce(s.display_color, '#6b7280') as display_color,
       min(s.display_order)
from public.weekly_plan_slots s
where not exists (
  select 1 from public.muscle_groups mg
  where mg.athlete_id = s.athlete_id
    and mg.slug = lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g'))
)
group by s.athlete_id, s.muscle_group, s.display_color;

-- 2. Update each slot to point at its catalogue row.
update public.weekly_plan_slots s
   set muscle_group_id = mg.id
  from public.muscle_groups mg
 where mg.athlete_id = s.athlete_id
   and mg.slug = lower(regexp_replace(s.muscle_group, '[^a-zA-Z0-9]+', '-', 'g'))
   and s.muscle_group_id is null;
```

### Step 3 — `20260508000004_finalize_weekly_plan_slots_muscle_group_fk.sql`

```sql
alter table public.weekly_plan_slots
  alter column muscle_group_id set not null;

alter table public.weekly_plan_slots
  drop column muscle_group;
```

The existing `unique (athlete_id, day_of_week)` constraint and the existing RLS policy remain unchanged. The `display_color` column on `weekly_plan_slots` is preserved for now; subsequent phases may consolidate it onto `muscle_groups.display_color` — out of scope for Phase 2.

---

## Column addition: `exercises.is_active`

Soft-delete flag for FR-012.

```sql
alter table public.exercises
  add column is_active boolean not null default true;

create index if not exists exercises_athlete_active_idx
  on public.exercises (athlete_id) where is_active;
```

Migration `20260508000005_extend_exercises_is_active.sql`. RLS unchanged. The seed sets `is_active = true` (column default takes care of new inserts). DAO read paths default to `is_active = true`; an `?include_archived=1` query parameter on `GET /api/v1/exercises` returns archived rows alongside active.

---

## Column addition + drop on `app_config`

Two migrations:

### `20260508000006_extend_app_config_notification_acks.sql`

```sql
alter table public.app_config
  add column notification_acks jsonb not null default '{}'::jsonb;
```

The JSONB shape carries one key per acknowledged notice. For Phase 2 the only known key is `nutrition_recommendation_changed`, valued by an ISO-8601 timestamp of the last delta the athlete acknowledged. Example:

```json
{ "nutrition_recommendation_changed": "2026-05-08T08:14:00Z" }
```

The frontend writes via `PATCH /api/v1/me/preferences` with body `{ notification_acks: { nutrition_recommendation_changed: "<iso>" } }`; the backend deep-merges so individual keys can be cleared by writing `null`.

### `20260508000007_drop_app_config_daily_kcal_override.sql`

```sql
alter table public.app_config
  drop column daily_kcal_override;
```

Per Decision D-3 in research.md. The Phase 1 engine never wired this column into the resolver; nothing in production reads it. The replacement is `engine_overrides.nutrition.daily_kcal` (see below).

---

## Extended JSONB shape: `app_config.engine_overrides.nutrition`

Phase 1 introduced `engine_overrides JSONB DEFAULT '{}'::jsonb` on `app_config`. Phase 2 documents and consumes a new sub-tree:

```jsonc
{
  "nutrition": {
    "daily_kcal":      3500,            // optional
    "daily_protein_g": 200,             // optional, takes precedence over auto-derived
    "daily_carbs_g":   430,             // optional
    "daily_fat_g":     90               // optional
  }
}
```

**Resolver semantics** (implemented in `services/engine/macros.js`, called by `resolveConstants`):

1. If `nutrition.daily_kcal` is present, the macro calculator runs on that calorie total instead of the engine's TDEE-derived total.
2. For each of `daily_protein_g` / `daily_carbs_g` / `daily_fat_g` independently:
   - If present in the JSONB, that value wins.
   - If absent, the value is derived from the rules in PLAN.md §1.3 (protein floor 2.2 g/kg LBM, fat floor 25 % of calories, carbs fill the rest), morphotype-adjusted as today.
3. Clearing a key (PUT body with `null` for that field) deletes the key from the JSONB; full clear of all four returns the resolver to engine-derived values everywhere.

**Audit invariant**: every PUT or DELETE of any of these four values writes exactly one row to `calculation_results` per FR-003a — engine version + the resolved-constants snapshot *after* applying the change + `reason: 'override_set' | 'override_cleared'`. The Phase 1 audit writer is reused unchanged.

---

## Existing tables touched but **not** altered structurally

- `calculation_results` (Phase 1) — receives Phase 2 audit rows. The shape (`engine_version`, `resolved_constants`, `reason`, `athlete_id`, `created_at`, payload JSONB) already accommodates the new reasons.
- `athletes` (Phase 0 + Phase 1 activity-level extension) — no Phase 2 column add. The full-profile `PATCH /api/v1/me` works with the existing columns.
- `weekly_plan_exercises` (Phase 0) — used by the reorder endpoint; no schema change.

---

## Entity relationship (Phase 2 view)

```
athletes (1)
  ├── (1) app_config           [theme, units, sound, engine_overrides JSONB, notification_acks]
  ├── (n) muscle_groups        [catalogue]
  ├── (n) weekly_plan_slots    [day_of_week, muscle_group_id → muscle_groups.id]
  │      └── (n) weekly_plan_exercises [position, target_*, exercise_id → exercises.id]
  ├── (n) exercises            [is_active]
  └── (n) calculation_results  [reason ∈ {profile_save, override_set, override_cleared, …}]
```

`muscle_groups` is the only new node. Every other relationship is preserved.

---

## Validation rules (cross-cutting)

Implemented in `services/scheduleValidator.js` (pure) and at the DAO boundary; mirrored on the frontend.

- **Profile** (FR-004): age 13–100, height 100–250 cm, weight 30–250 kg, |target_weight − current_weight| ≤ 50 kg, `start_date` within ±12 months of today.
- **Schedule** (FR-008): `1 ≤ active_days ≤ 7`; no two slots in the same week share `muscle_group_id`; `muscle_groups.name` length ≤ 40.
- **Exercise** (FR-011): `name` length 1–80; `targeted_muscles` non-empty; `media_*_url` if present must be a syntactically valid http(s) URL.
- **Preferences** (FR-015 / FR-016 / FR-017): `theme ∈ {dark, light}`; `units ∈ {kg, lbs}`; `rest_timer_sound boolean`; nutrition override values must be positive integers within plausibility ranges (kcal 800–6000; protein 30–400 g; carbs 0–800 g; fat 20–250 g).
- **Backup envelope** (FR-023): `_export.schema_version` is a positive integer; `_export.athlete_id` matches the request's resolved athlete; total payload size ≤ `IMPORT_MAX_BYTES`; structural validation against the zod schema in `services/dataManagement/backupSchema.js`.
- **Reset** (FR-027 / FR-028 / FR-029): `module ∈ {sessions, body_measurements, nutrition_logs, supplements, recovery, calculator_results, preferences, all}`; `confirm_token` matches `config.RESET_CONFIRM_TOKEN` server-side (the frontend's typed-token check is UX, not security).
