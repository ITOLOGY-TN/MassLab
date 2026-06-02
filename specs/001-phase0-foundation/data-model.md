# Phase 0 Data Model

**Feature**: 001-phase0-foundation
**Date**: 2026-04-28
**Constitution**: v1.1.1
**Storage**: Supabase PostgreSQL (Postgres 15.x)

This document is the source of truth for the database schema produced at the end of Phase 0. It is the contract between the migration files in `supabase/migrations/` and the data-access modules in `services/dataAccess/`.

## Conventions

- Every domain table has a non-null `athlete_id` foreign key (Constitution Principle I, FR-002).
- Every domain table ships **Row-Level Security** policies in the same migration that creates the table — see `research.md` §5 for the canonical policy pair. RLS is enabled but transparently bypassed in single-user mode (the server uses `SUPABASE_SECRET_KEY`, which is exempt from RLS).
- Surrogate primary keys are `bigint generated always as identity`, except `athletes.id` and `athlete_photos.id` which are `uuid` (athletes are owners and stable; photos are referenced by URL and benefit from non-guessable IDs).
- Foreign keys default to `ON DELETE RESTRICT`. Exceptions are called out per table.
- All timestamps are `timestamptz` and default to `now()`.
- Every translatable seed table carries a non-null `locale text` column (FR-020); the v1 seed populates `fr-FR` rows.
- Slugs (`text`) are used for stable natural keys on reference data so seed upserts are idempotent.
- Money / mass / length values are stored as `numeric(p, s)` to avoid float drift.
- Credential storage is delegated to **Supabase Auth** (`auth.users`); the application stores no `password_hash`. Athletes link to `auth.users(id)` through `athletes.auth_user_id`.

## Tables

### 1. `athletes`

The owner of every other domain row.

| Column                 | Type           | Null     | Notes                                                                                           |
| ---------------------- | -------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `id`                   | `uuid`         | NOT NULL | PK; default `gen_random_uuid()`                                                                 |
| `auth_user_id`         | `uuid`         | NULL     | UNIQUE; FK → `auth.users(id)` ON DELETE SET NULL. NULL while seeded single-user mode is in use. |
| `email`                | `text`         | NOT NULL | UNIQUE; CITEXT-style normalised at write time                                                   |
| `display_name`         | `text`         | NULL     | Optional; shown in UI when present                                                              |
| `age`                  | `int`          | NOT NULL | Years                                                                                           |
| `biological_sex`       | `text`         | NOT NULL | `male` / `female` (CHECK)                                                                       |
| `height_cm`            | `numeric(5,1)` | NOT NULL |                                                                                                 |
| `starting_weight_kg`   | `numeric(5,2)` | NOT NULL |                                                                                                 |
| `target_weight_kg`     | `numeric(5,2)` | NOT NULL |                                                                                                 |
| `morphotype`           | `text`         | NOT NULL | `ectomorph` / `mesomorph` / `endomorph` (CHECK)                                                 |
| `goal`                 | `text`         | NOT NULL | `bulk` / `cut` / `maintain` (CHECK)                                                             |
| `weekly_session_count` | `int`          | NOT NULL | 1..7 (CHECK)                                                                                    |
| `available_equipment`  | `text[]`       | NOT NULL | Array of slugs                                                                                  |
| `injuries`             | `text[]`       | NOT NULL | Array of strings; empty array allowed                                                           |
| `program_start_date`   | `date`         | NOT NULL |                                                                                                 |
| `created_at`           | `timestamptz`  | NOT NULL | default `now()`                                                                                 |
| `updated_at`           | `timestamptz`  | NOT NULL | default `now()`                                                                                 |

**RLS**: `athletes_self` — `auth_user_id = auth.uid()` for SELECT and ALL.
**Indexes**: UNIQUE on `email`; UNIQUE on `auth_user_id` (where not null).

### 2. `exercises`

Reusable exercise library; locale-tagged.

| Column             | Type              | Null     | Notes                                 |
| ------------------ | ----------------- | -------- | ------------------------------------- |
| `id`               | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`       | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `slug`             | `text`            | NOT NULL | natural key for seed upserts          |
| `locale`           | `text`            | NOT NULL | e.g. `fr-FR` (FR-020)                 |
| `name`             | `text`            | NOT NULL |                                       |
| `targeted_muscles` | `text[]`          | NOT NULL |                                       |
| `instructions`     | `text`            | NOT NULL |                                       |
| `technique_points` | `text[]`          | NOT NULL | bullet list                           |
| `media_image_url`  | `text`            | NULL     | optional                              |
| `media_video_url`  | `text`            | NULL     | YouTube or local                      |
| `created_at`       | `timestamptz`     | NOT NULL | default `now()`                       |

**RLS**: standard per-athlete pair (research.md §5).
**Indexes**: UNIQUE on `(athlete_id, slug, locale)`; INDEX on `(athlete_id)`.

### 3. `weekly_plan_slots`

Per-athlete weekly schedule. One row per active training day (US-1 expects 5 rows for the seeded athlete).

| Column          | Type              | Null     | Notes                                 |
| --------------- | ----------------- | -------- | ------------------------------------- |
| `id`            | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`    | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `day_of_week`   | `int`             | NOT NULL | 1..7 (Mon..Sun); CHECK                |
| `muscle_group`  | `text`            | NOT NULL | e.g. `chest_triceps`                  |
| `display_color` | `text`            | NOT NULL | hex; for UI badge                     |
| `display_order` | `int`             | NOT NULL | within the week                       |
| `created_at`    | `timestamptz`     | NOT NULL | default `now()`                       |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, day_of_week)`.

### 4. `weekly_plan_exercises`

Exercises assigned to a plan slot, ordered.

| Column             | Type              | Null     | Notes                                          |
| ------------------ | ----------------- | -------- | ---------------------------------------------- |
| `id`               | `bigint` identity | NOT NULL | PK                                             |
| `athlete_id`       | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE          |
| `slot_id`          | `bigint`          | NOT NULL | FK → `weekly_plan_slots(id)` ON DELETE CASCADE |
| `exercise_id`      | `bigint`          | NOT NULL | FK → `exercises(id)`                           |
| `position`         | `int`             | NOT NULL | order within slot                              |
| `target_sets`      | `int`             | NOT NULL |                                                |
| `target_reps_low`  | `int`             | NOT NULL |                                                |
| `target_reps_high` | `int`             | NOT NULL |                                                |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(slot_id, position)`; INDEX on `(athlete_id)`.

### 5. `training_phases`

Multi-week phases with volume/intensity parameters used by the program generator.

| Column              | Type              | Null     | Notes                                 |
| ------------------- | ----------------- | -------- | ------------------------------------- |
| `id`                | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`        | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `slug`              | `text`            | NOT NULL | seed key                              |
| `locale`            | `text`            | NOT NULL | `fr-FR`                               |
| `name`              | `text`            | NOT NULL |                                       |
| `description`       | `text`            | NOT NULL |                                       |
| `weeks`             | `int`             | NOT NULL | duration                              |
| `rest_seconds`      | `int`             | NOT NULL | default rest between sets             |
| `intensity_pct_min` | `int`             | NOT NULL | of 1RM                                |
| `intensity_pct_max` | `int`             | NOT NULL | of 1RM                                |
| `display_order`     | `int`             | NOT NULL |                                       |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, slug, locale)`.

### 6. `nutrition_template_meals`

Per-athlete meal-slot template (5 meals for the seeded athlete).

| Column             | Type              | Null     | Notes                                                               |
| ------------------ | ----------------- | -------- | ------------------------------------------------------------------- |
| `id`               | `bigint` identity | NOT NULL | PK                                                                  |
| `athlete_id`       | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE                               |
| `slot`             | `text`            | NOT NULL | e.g. `breakfast`, `lunch`, `pre_workout`, `dinner`, `evening_snack` |
| `display_order`    | `int`             | NOT NULL |                                                                     |
| `target_kcal`      | `int`             | NOT NULL |                                                                     |
| `target_protein_g` | `int`             | NOT NULL |                                                                     |
| `target_carbs_g`   | `int`             | NOT NULL |                                                                     |
| `target_fat_g`     | `int`             | NOT NULL |                                                                     |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, slot)`.

### 7. `supplements`

Supplement stack with adherence later attached separately.

| Column             | Type              | Null     | Notes                                 |
| ------------------ | ----------------- | -------- | ------------------------------------- |
| `id`               | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`       | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `slug`             | `text`            | NOT NULL |                                       |
| `locale`           | `text`            | NOT NULL | `fr-FR`                               |
| `name`             | `text`            | NOT NULL |                                       |
| `dosage`           | `text`            | NOT NULL | e.g. `5 g`                            |
| `recommended_time` | `text`            | NOT NULL | e.g. `morning`, `pre_workout`         |
| `notes`            | `text`            | NULL     |                                       |
| `display_order`    | `int`             | NOT NULL |                                       |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, slug, locale)`.

### 8. `foods`

Food database; per-100g macros.

| Column             | Type              | Null     | Notes                                  |
| ------------------ | ----------------- | -------- | -------------------------------------- |
| `id`               | `bigint` identity | NOT NULL | PK                                     |
| `athlete_id`       | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE  |
| `slug`             | `text`            | NOT NULL |                                        |
| `locale`           | `text`            | NOT NULL | `fr-FR`                                |
| `name`             | `text`            | NOT NULL |                                        |
| `kcal_per_100g`    | `numeric(6,2)`    | NOT NULL |                                        |
| `protein_per_100g` | `numeric(5,2)`    | NOT NULL |                                        |
| `carbs_per_100g`   | `numeric(5,2)`    | NOT NULL |                                        |
| `fat_per_100g`     | `numeric(5,2)`    | NOT NULL |                                        |
| `category`         | `text`            | NOT NULL | e.g. `protein`, `carb`, `fat`, `mixed` |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, slug, locale)`; INDEX on `(athlete_id, category)`.

### 9. `quotes`

Motivational quotes; rotated daily by the dashboard later.

| Column       | Type              | Null     | Notes                                 |
| ------------ | ----------------- | -------- | ------------------------------------- |
| `id`         | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id` | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `slug`       | `text`            | NOT NULL |                                       |
| `locale`     | `text`            | NOT NULL | `fr-FR`                               |
| `text`       | `text`            | NOT NULL |                                       |
| `author`     | `text`            | NULL     |                                       |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, slug, locale)`.

### 10. `session_journal_entries`

One row per logged training session. Empty in Phase 0 (the journal screen ships in Phase 4) — but the table exists so future migrations don't have to add `athlete_id`.

| Column            | Type              | Null     | Notes                                 |
| ----------------- | ----------------- | -------- | ------------------------------------- |
| `id`              | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`      | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `started_at`      | `timestamptz`     | NOT NULL |                                       |
| `ended_at`        | `timestamptz`     | NULL     |                                       |
| `total_volume_kg` | `numeric(10,2)`   | NULL     | computed at session close             |
| `energy_rating`   | `int`             | NULL     | 1..5                                  |
| `note`            | `text`            | NULL     |                                       |
| `created_at`      | `timestamptz`     | NOT NULL | default `now()`                       |

**RLS**: standard per-athlete pair.
**Indexes**: INDEX on `(athlete_id, started_at DESC)`.

### 11. `session_sets`

Per-set rows attached to a journal entry. Empty in Phase 0.

| Column        | Type              | Null     | Notes                                                |
| ------------- | ----------------- | -------- | ---------------------------------------------------- |
| `id`          | `bigint` identity | NOT NULL | PK                                                   |
| `athlete_id`  | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE                |
| `session_id`  | `bigint`          | NOT NULL | FK → `session_journal_entries(id)` ON DELETE CASCADE |
| `exercise_id` | `bigint`          | NOT NULL | FK → `exercises(id)`                                 |
| `set_number`  | `int`             | NOT NULL |                                                      |
| `weight_kg`   | `numeric(6,2)`    | NOT NULL |                                                      |
| `reps`        | `int`             | NOT NULL |                                                      |
| `rpe`         | `int`             | NULL     | 1..10                                                |
| `completed`   | `boolean`         | NOT NULL | default `false`                                      |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(session_id, set_number)`; INDEX on `(athlete_id, exercise_id)`.

### 12. `body_measurements`

Plaintext numeric body data (FR-022). Empty in Phase 0.

| Column        | Type              | Null     | Notes                                 |
| ------------- | ----------------- | -------- | ------------------------------------- |
| `id`          | `bigint` identity | NOT NULL | PK                                    |
| `athlete_id`  | `uuid`            | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `measured_on` | `date`            | NOT NULL |                                       |
| `weight_kg`   | `numeric(5,2)`    | NULL     |                                       |
| `arm_cm`      | `numeric(5,2)`    | NULL     |                                       |
| `chest_cm`    | `numeric(5,2)`    | NULL     |                                       |
| `thigh_cm`    | `numeric(5,2)`    | NULL     |                                       |
| `shoulder_cm` | `numeric(5,2)`    | NULL     |                                       |
| `waist_cm`    | `numeric(5,2)`    | NULL     |                                       |
| `note`        | `text`            | NULL     |                                       |

**RLS**: standard per-athlete pair.
**Indexes**: UNIQUE on `(athlete_id, measured_on)`.

### 13. `athlete_photos`

Photo metadata only; binary lives behind the `photo_storage` adapter (FR-021).

| Column              | Type           | Null     | Notes                                 |
| ------------------- | -------------- | -------- | ------------------------------------- |
| `id`                | `uuid`         | NOT NULL | PK; default `gen_random_uuid()`       |
| `athlete_id`        | `uuid`         | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `taken_on`          | `date`         | NOT NULL |                                       |
| `storage_key`       | `text`         | NOT NULL | opaque key returned by the adapter    |
| `weight_overlay_kg` | `numeric(5,2)` | NULL     | snapshot at the time of the photo     |
| `note`              | `text`         | NULL     |                                       |
| `created_at`        | `timestamptz`  | NOT NULL | default `now()`                       |

**RLS**: standard per-athlete pair.
**Indexes**: INDEX on `(athlete_id, taken_on DESC)`.

### 14. `app_config`

Per-athlete preferences (theme, units, custom nutrition targets, etc.). Phase 0 seeds defaults; Phase 2 exposes editing.

| Column                | Type          | Null     | Notes                                     |
| --------------------- | ------------- | -------- | ----------------------------------------- |
| `athlete_id`          | `uuid`        | NOT NULL | PK; FK → `athletes(id)` ON DELETE CASCADE |
| `theme`               | `text`        | NOT NULL | `dark` / `light`                          |
| `units`               | `text`        | NOT NULL | `kg` / `lbs`                              |
| `rest_timer_sound`    | `boolean`     | NOT NULL | default `true`                            |
| `daily_kcal_override` | `int`         | NULL     | overrides program target if set           |
| `updated_at`          | `timestamptz` | NOT NULL | default `now()`                           |

**RLS**: `app_config_self` — same indirection through `athletes.auth_user_id`.

## Constraints summary

- **14 tables** total. **All 13 domain tables** carry `athlete_id` (FR-002, SC-002). The 14th table (`athletes`) IS the tenant root.
- **All 14 tables** carry RLS policies from migration day one (constitution Operational Standards: "a table without an RLS policy MUST NOT reach a multi-user environment").
- **All 5 translatable reference tables** (`exercises`, `training_phases`, `supplements`, `foods`, `quotes`) carry `locale` from migration day one (FR-020).
- **No `password_hash` column anywhere**: the application delegates credential storage to Supabase Auth.

## Migration order

Migrations are timestamp-prefixed and applied in lexical order. The proposed order respects FK dependencies:

1. `init_athletes` — also installs the `pgcrypto` extension if not present (for `gen_random_uuid()`).
2. `init_exercises`
3. `init_weekly_plan` — both `weekly_plan_slots` and `weekly_plan_exercises` (depends on 2).
4. `init_training_phases`
5. `init_nutrition` — `nutrition_template_meals`.
6. `init_supplements`
7. `init_foods`
8. `init_quotes`
9. `init_session_journal` — `session_journal_entries`.
10. `init_session_sets` — depends on 9 and 2.
11. `init_body_measurements`
12. `init_athlete_photos`
13. `init_recovery_log` — empty in Phase 0; included so the schema is complete.
14. `init_app_config`

Each migration creates the table, adds indexes, enables RLS, creates the SELECT policy, creates the modify policy, and (for athlete-scoped tables) sets `ON DELETE CASCADE` from `athletes`.
