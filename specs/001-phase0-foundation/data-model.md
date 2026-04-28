# Phase 0 Data Model

**Feature**: 001-phase0-foundation
**Date**: 2026-04-27

This document is the source of truth for the database schema produced at the end of Phase 0. It is the contract between the migration files in `migrations/` and the model layer.

Conventions:

- Every domain table has a non-null `athlete_id` foreign key (Constitution Principle I, FR-002).
- Every translatable seed table has a non-null `locale` column (FR-020).
- Foreign keys are enabled at connection open (`PRAGMA foreign_keys = ON`).
- All times are stored as ISO-8601 strings (SQLite `TEXT`).
- Soft-delete is out of scope in Phase 0; rows are physically deleted.

## Migration map

| File                               | Tables created                                       |
|------------------------------------|------------------------------------------------------|
| `0001_init_athletes.sql`           | `athletes`, `_migrations`                            |
| `0002_init_exercises.sql`          | `exercises`                                          |
| `0003_init_weekly_plan.sql`        | `weekly_plan_slots`, `weekly_plan_slot_exercises`    |
| `0004_init_training_phases.sql`    | `training_phases`                                    |
| `0005_init_nutrition.sql`          | `nutrition_template_meals`                           |
| `0006_init_supplements.sql`        | `supplements`, `supplement_intakes`                  |
| `0007_init_foods.sql`              | `foods`                                              |
| `0008_init_quotes.sql`             | `quotes`                                             |
| `0009_init_session_journal.sql`    | `sessions`, `sets`                                   |
| `0010_init_body_measurements.sql`  | `body_measurements`                                  |
| `0011_init_athlete_photos.sql`     | `athlete_photos`                                     |
| `0012_init_recovery_log.sql`       | `recovery_logs`                                      |
| `0013_init_app_config.sql`         | `app_config`                                         |

## Tables

### athletes

| Column              | Type    | Notes                                                                      |
|---------------------|---------|----------------------------------------------------------------------------|
| id                  | INTEGER | PRIMARY KEY AUTOINCREMENT                                                  |
| email               | TEXT    | NOT NULL UNIQUE — credential per FR-016                                    |
| password_hash       | TEXT    | NULL until set; bcrypt format when present                                 |
| display_name        | TEXT    | NULL                                                                       |
| age                 | INTEGER | NOT NULL                                                                   |
| biological_sex      | TEXT    | NOT NULL CHECK (biological_sex IN ('male','female'))                       |
| height_cm           | REAL    | NOT NULL                                                                   |
| starting_weight_kg  | REAL    | NOT NULL                                                                   |
| target_weight_kg    | REAL    | NOT NULL                                                                   |
| morphotype          | TEXT    | NOT NULL CHECK (morphotype IN ('ectomorph','mesomorph','endomorph'))       |
| goal                | TEXT    | NOT NULL CHECK (goal IN ('bulk','cut','maintain'))                         |
| activity_level      | TEXT    | NOT NULL                                                                   |
| sessions_per_week   | INTEGER | NOT NULL CHECK (sessions_per_week BETWEEN 1 AND 7)                         |
| equipment_json      | TEXT    | NULL — JSON array of equipment tags                                        |
| injuries_json       | TEXT    | NULL — JSON array                                                          |
| program_start_date  | TEXT    | NOT NULL — ISO date                                                        |
| created_at          | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                                         |
| updated_at          | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                                         |

### exercises

| Column           | Type    | Notes                                                |
|------------------|---------|------------------------------------------------------|
| id               | INTEGER | PK AUTOINCREMENT                                     |
| athlete_id       | INTEGER | NOT NULL REFERENCES athletes(id)                     |
| locale           | TEXT    | NOT NULL DEFAULT 'fr-FR'                             |
| name             | TEXT    | NOT NULL                                             |
| muscle_group     | TEXT    | NOT NULL                                             |
| targeted_muscles | TEXT    | NOT NULL — JSON array                                |
| instructions     | TEXT    | NOT NULL                                             |
| technique_points | TEXT    | NULL — JSON array                                    |
| media_ref        | TEXT    | NULL — opaque storage reference                      |
| created_at       | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                   |
| **UNIQUE**       |         | `(athlete_id, locale, name)`                         |

Note: exercises are athlete-scoped per Principle I even though the seed library is shared in concept. This lets future tenants edit/extend their library without leaking across tenants.

### weekly_plan_slots

| Column        | Type    | Notes                                                    |
|---------------|---------|----------------------------------------------------------|
| id            | INTEGER | PK AUTOINCREMENT                                         |
| athlete_id    | INTEGER | NOT NULL REFERENCES athletes(id)                         |
| day_of_week   | INTEGER | NOT NULL CHECK (day_of_week BETWEEN 1 AND 7) — 1 = Monday|
| muscle_group  | TEXT    | NOT NULL                                                 |
| display_order | INTEGER | NOT NULL                                                 |
| **UNIQUE**    |         | `(athlete_id, day_of_week)`                              |

### weekly_plan_slot_exercises

`athlete_id` denormalised to keep tenant-scoping local on every row.

| Column                | Type    | Notes                                                                |
|-----------------------|---------|----------------------------------------------------------------------|
| id                    | INTEGER | PK AUTOINCREMENT                                                     |
| athlete_id            | INTEGER | NOT NULL REFERENCES athletes(id)                                     |
| weekly_plan_slot_id   | INTEGER | NOT NULL REFERENCES weekly_plan_slots(id) ON DELETE CASCADE          |
| exercise_id           | INTEGER | NOT NULL REFERENCES exercises(id)                                    |
| order_in_slot         | INTEGER | NOT NULL                                                             |
| **UNIQUE**            |         | `(weekly_plan_slot_id, order_in_slot)`                               |

### training_phases

| Column                | Type    | Notes                                  |
|-----------------------|---------|----------------------------------------|
| id                    | INTEGER | PK AUTOINCREMENT                       |
| athlete_id            | INTEGER | NOT NULL REFERENCES athletes(id)       |
| locale                | TEXT    | NOT NULL DEFAULT 'fr-FR'               |
| name                  | TEXT    | NOT NULL                               |
| start_week            | INTEGER | NOT NULL                               |
| end_week              | INTEGER | NOT NULL                               |
| sets_per_exercise     | INTEGER | NOT NULL                               |
| reps_low              | INTEGER | NOT NULL                               |
| reps_high             | INTEGER | NOT NULL                               |
| rest_seconds          | INTEGER | NOT NULL                               |
| target_intensity_pct  | INTEGER | NOT NULL — % of 1RM                    |
| **UNIQUE**            |         | `(athlete_id, locale, name)`           |

### nutrition_template_meals

| Column           | Type    | Notes                                                                          |
|------------------|---------|--------------------------------------------------------------------------------|
| id               | INTEGER | PK AUTOINCREMENT                                                               |
| athlete_id       | INTEGER | NOT NULL REFERENCES athletes(id)                                               |
| slot             | TEXT    | NOT NULL CHECK (slot IN ('breakfast','lunch','pre_workout','dinner','evening'))|
| display_order    | INTEGER | NOT NULL                                                                       |
| target_calories  | REAL    | NOT NULL                                                                       |
| target_protein_g | REAL    | NOT NULL                                                                       |
| target_carbs_g   | REAL    | NOT NULL                                                                       |
| target_fat_g     | REAL    | NOT NULL                                                                       |
| **UNIQUE**       |         | `(athlete_id, slot)`                                                           |

### supplements

| Column           | Type    | Notes                                  |
|------------------|---------|----------------------------------------|
| id               | INTEGER | PK AUTOINCREMENT                       |
| athlete_id       | INTEGER | NOT NULL REFERENCES athletes(id)       |
| locale           | TEXT    | NOT NULL DEFAULT 'fr-FR'               |
| name             | TEXT    | NOT NULL                               |
| dosage           | TEXT    | NOT NULL                               |
| recommended_time | TEXT    | NOT NULL                               |
| display_order    | INTEGER | NOT NULL                               |
| **UNIQUE**       |         | `(athlete_id, locale, name)`           |

### supplement_intakes

| Column         | Type    | Notes                                  |
|----------------|---------|----------------------------------------|
| id             | INTEGER | PK AUTOINCREMENT                       |
| athlete_id     | INTEGER | NOT NULL REFERENCES athletes(id)       |
| supplement_id  | INTEGER | NOT NULL REFERENCES supplements(id)    |
| taken_on       | TEXT    | NOT NULL — ISO date                    |
| taken          | INTEGER | NOT NULL CHECK (taken IN (0,1))        |
| created_at     | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP     |
| **UNIQUE**     |         | `(supplement_id, taken_on)`            |

### foods

| Column              | Type    | Notes                                  |
|---------------------|---------|----------------------------------------|
| id                  | INTEGER | PK AUTOINCREMENT                       |
| athlete_id          | INTEGER | NOT NULL REFERENCES athletes(id)       |
| locale              | TEXT    | NOT NULL DEFAULT 'fr-FR'               |
| name                | TEXT    | NOT NULL                               |
| protein_g_per_100g  | REAL    | NOT NULL                               |
| carbs_g_per_100g    | REAL    | NOT NULL                               |
| fat_g_per_100g      | REAL    | NOT NULL                               |
| calories_per_100g   | REAL    | NOT NULL                               |
| **UNIQUE**          |         | `(athlete_id, locale, name)`           |

### quotes

| Column        | Type    | Notes                                  |
|---------------|---------|----------------------------------------|
| id            | INTEGER | PK AUTOINCREMENT                       |
| athlete_id    | INTEGER | NOT NULL REFERENCES athletes(id)       |
| locale        | TEXT    | NOT NULL DEFAULT 'fr-FR'               |
| text          | TEXT    | NOT NULL                               |
| author        | TEXT    | NULL                                   |
| display_order | INTEGER | NOT NULL                               |

### sessions

| Column            | Type    | Notes                                                |
|-------------------|---------|------------------------------------------------------|
| id                | INTEGER | PK AUTOINCREMENT                                     |
| athlete_id        | INTEGER | NOT NULL REFERENCES athletes(id)                     |
| started_at        | TEXT    | NOT NULL                                             |
| ended_at          | TEXT    | NULL                                                 |
| muscle_group      | TEXT    | NOT NULL                                             |
| training_phase_id | INTEGER | NULL REFERENCES training_phases(id)                  |
| energy_rating     | INTEGER | NULL CHECK (energy_rating BETWEEN 1 AND 5)           |
| note              | TEXT    | NULL                                                 |
| created_at        | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                   |

### sets

| Column            | Type    | Notes                                                |
|-------------------|---------|------------------------------------------------------|
| id                | INTEGER | PK AUTOINCREMENT                                     |
| athlete_id        | INTEGER | NOT NULL REFERENCES athletes(id)                     |
| session_id        | INTEGER | NOT NULL REFERENCES sessions(id) ON DELETE CASCADE   |
| exercise_id       | INTEGER | NOT NULL REFERENCES exercises(id)                    |
| order_in_session  | INTEGER | NOT NULL                                             |
| weight_kg         | REAL    | NOT NULL                                             |
| reps              | INTEGER | NOT NULL                                             |
| rpe               | INTEGER | NULL CHECK (rpe BETWEEN 1 AND 10)                    |
| completed         | INTEGER | NOT NULL CHECK (completed IN (0,1))                  |
| created_at        | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                   |

### body_measurements

| Column        | Type    | Notes                                  |
|---------------|---------|----------------------------------------|
| id            | INTEGER | PK AUTOINCREMENT                       |
| athlete_id    | INTEGER | NOT NULL REFERENCES athletes(id)       |
| measured_on   | TEXT    | NOT NULL — ISO date                    |
| weight_kg     | REAL    | NOT NULL — plaintext per FR-022        |
| arm_cm        | REAL    | NULL                                   |
| chest_cm      | REAL    | NULL                                   |
| thighs_cm     | REAL    | NULL                                   |
| shoulders_cm  | REAL    | NULL                                   |
| waist_cm      | REAL    | NULL                                   |
| note          | TEXT    | NULL                                   |
| created_at    | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP     |
| **UNIQUE**    |         | `(athlete_id, measured_on)`            |

### athlete_photos

| Column            | Type    | Notes                                                          |
|-------------------|---------|----------------------------------------------------------------|
| id                | INTEGER | PK AUTOINCREMENT                                               |
| athlete_id        | INTEGER | NOT NULL REFERENCES athletes(id)                               |
| storage_ref       | TEXT    | NOT NULL — opaque ref via the `photo_storage` adapter (FR-021) |
| taken_on          | TEXT    | NOT NULL — ISO date                                            |
| weight_kg_at_time | REAL    | NULL — overlay metadata                                        |
| created_at        | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP                             |

### recovery_logs

| Column          | Type    | Notes                                                |
|-----------------|---------|------------------------------------------------------|
| id              | INTEGER | PK AUTOINCREMENT                                     |
| athlete_id      | INTEGER | NOT NULL REFERENCES athletes(id)                     |
| logged_on       | TEXT    | NOT NULL — ISO date                                  |
| sleep_quality   | INTEGER | NULL CHECK (sleep_quality BETWEEN 1 AND 5)           |
| sleep_hours     | REAL    | NULL                                                 |
| stress_level    | INTEGER | NULL CHECK (stress_level BETWEEN 1 AND 5)            |
| energy_level    | INTEGER | NULL CHECK (energy_level BETWEEN 1 AND 5)            |
| mood            | TEXT    | NULL                                                 |
| sore_zones_json | TEXT    | NULL — JSON array of zone tags                       |
| **UNIQUE**      |         | `(athlete_id, logged_on)`                            |

### app_config

Per-athlete *runtime preferences* (theme, units, timer sounds). Distinct from *deployment* configuration (port, db path, single-user-mode flag), which lives in `.env` and is loaded by the configuration adapter — never persisted to the DB.

| Column     | Type    | Notes                                  |
|------------|---------|----------------------------------------|
| id         | INTEGER | PK AUTOINCREMENT                       |
| athlete_id | INTEGER | NOT NULL REFERENCES athletes(id)       |
| key        | TEXT    | NOT NULL                               |
| value      | TEXT    | NOT NULL                               |
| **UNIQUE** |         | `(athlete_id, key)`                    |

### _migrations

| Column     | Type    | Notes                                  |
|------------|---------|----------------------------------------|
| filename   | TEXT    | PRIMARY KEY                            |
| applied_at | TEXT    | NOT NULL DEFAULT CURRENT_TIMESTAMP     |

## Indexes

- `idx_exercises_athlete` ON `exercises(athlete_id)`
- `idx_weekly_plan_athlete_day` ON `weekly_plan_slots(athlete_id, day_of_week)`
- `idx_supplement_intakes_athlete_date` ON `supplement_intakes(athlete_id, taken_on)`
- `idx_sessions_athlete_started` ON `sessions(athlete_id, started_at DESC)`
- `idx_sets_session` ON `sets(session_id)`
- `idx_sets_athlete_exercise` ON `sets(athlete_id, exercise_id, created_at DESC)`
- `idx_body_measurements_athlete_date` ON `body_measurements(athlete_id, measured_on DESC)`
- `idx_athlete_photos_athlete_date` ON `athlete_photos(athlete_id, taken_on DESC)`
- `idx_recovery_logs_athlete_date` ON `recovery_logs(athlete_id, logged_on DESC)`
- `idx_foods_athlete_locale_name` ON `foods(athlete_id, locale, name)`

## Validation rules

- Email is validated at the controller boundary via zod (RFC 5322-lite).
- All `weight_kg` and macro values must be non-negative (enforced in models / zod request schemas).
- Enums (`morphotype`, `goal`, `slot`, `biological_sex`) enforced via SQL `CHECK` constraints AND zod at the application boundary.
- `locale` is a BCP-47 tag string; only `fr-FR` is seeded; the BCP-47 grammar is not enforced in SQL (left to the future locale catalog).
