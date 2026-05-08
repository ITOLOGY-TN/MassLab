# Phase 1 Data Model

**Feature**: 002-calculators-engine
**Date**: 2026-05-07
**Constitution**: v1.1.1
**Storage**: Supabase PostgreSQL (Postgres 15.x)

This document is the source of truth for the schema added in Phase 1. Phase 0's 14 tables are preserved unchanged except for two backward-compatible column additions on `athletes` and `app_config`. Conventions match Phase 0 (`data-model.md` §"Conventions"): every domain table carries `athlete_id NOT NULL`, every domain table ships RLS in the same migration, surrogate PKs are `bigint generated always as identity` unless noted.

## Phase 0 schema extensions

### `athletes` — add `activity_level`

Migration `20260507000001_extend_athletes_activity_level.sql`:

```sql
alter table public.athletes
  add column activity_level text not null default 'moderately_active'
    check (activity_level in (
      'sedentary',
      'lightly_active',
      'moderately_active',
      'very_active',
      'extremely_active'
    ));
```

The default backfills the existing seeded athlete row. The Phase 0 `weekly_session_count` column is preserved unchanged.

### `app_config` — add `engine_overrides`

Migration `20260507000007_extend_app_config_engine_overrides.sql`:

```sql
alter table public.app_config
  add column engine_overrides jsonb not null default '{}'::jsonb;
```

`engine_overrides` is the per-athlete override sheet for engine constants. Phase 1 ships every athlete with `'{}'` (i.e. uses defaults); Phase 2's Settings UI is the first writer. Shape (when populated):

```json
{
  "bulk_surplus_kcal": 350,
  "cut_deficit_kcal": 350,
  "protein_g_per_kg_lbm": 2.4,
  "load_increment_upper_kg": 2.5,
  "load_increment_lower_kg": 5.0,
  "deload_volume_cut_pct": 30,
  "stagnation_window_weeks": 3,
  "double_progression_window_sessions": 2,
  "deload_rpe_threshold": 9,
  "regression_window_weeks": 2,
  "rpe_coverage_minimum_pct": 60,
  "default_body_fat_pct": {
    "ectomorph": 0.12,
    "mesomorph": 0.15,
    "endomorph": 0.20
  }
}
```

All keys are optional; missing keys fall through to `services/engine/constants.js` defaults. The `default_body_fat_pct` map is consumed by the macros calculator when `lean_body_mass_kg` is omitted: `lean_mass = weight × (1 − default_body_fat_pct[morphotype])`.

## New tables

### 1. `generated_programs`

The athlete's program record. Soft-archive versioned: at most one row per athlete carries `is_active = true`.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | PK |
| `athlete_id` | `uuid` | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `payload` | `jsonb` | NOT NULL | full program object: `{ training, nutrition, supplements, recovery }` |
| `engine_version` | `text` | NOT NULL | semver string from `services/engine/constants.js` |
| `resolved_constants` | `jsonb` | NOT NULL | snapshot of `default ⊕ override` at generation time |
| `is_active` | `boolean` | NOT NULL | default `true`; exactly one row per athlete carries `true` |
| `generated_at` | `timestamptz` | NOT NULL | default `now()` |
| `superseded_at` | `timestamptz` | NULL | set when `is_active` flips to `false` |

**Indexes**:
- Partial UNIQUE on `(athlete_id) where is_active = true` — enforces "at most one active program".
- INDEX on `(athlete_id, generated_at desc)` for history reads.

**RLS**: standard per-athlete pair (research.md §5 of Phase 0).

**State transitions**: `(is_active = true, superseded_at = null)` → `(is_active = false, superseded_at = <now>)` exactly once. No reverse transition.

### 2. `progression_flags`

Per-scope progression decision. Soft-supersede on every rule re-eval; one active row per scope.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | PK |
| `athlete_id` | `uuid` | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `scope_kind` | `text` | NOT NULL | `'exercise'` or `'muscle_group'` (CHECK) |
| `scope_ref` | `text` | NOT NULL | `exercise_id::text` or muscle-group slug |
| `flag_type` | `text` | NOT NULL | `'add_load'` / `'maintain'` / `'stagnation'` / `'regression'` / `'deload_suggested'` (CHECK) |
| `rule` | `text` | NOT NULL | identifier of the rule that produced it (e.g. `'double_progression'`) |
| `suggested_adjustment` | `jsonb` | NULL | rule-specific (e.g. `{ "delta_kg": 2.5 }` or `{ "volume_cut_pct": 30 }`) |
| `engine_version` | `text` | NOT NULL | |
| `resolved_constants` | `jsonb` | NOT NULL | snapshot |
| `is_active` | `boolean` | NOT NULL | default `true` |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |
| `superseded_at` | `timestamptz` | NULL | |

**Indexes**:
- Partial UNIQUE on `(athlete_id, scope_kind, scope_ref) where is_active = true` — one active flag per scope.
- INDEX on `(athlete_id, created_at desc)` for history reads.

**RLS**: standard per-athlete pair.

**Notes**:
- The same flag re-emitted unchanged is a no-op (the DAO compares the candidate to the active row and skips both UPDATE and INSERT if `flag_type` + `suggested_adjustment` match).
- "No flag" outcomes (rule did not fire because of insufficient history or because conditions cleared) supersede the active flag with no replacement.

### 3. `one_rep_max_records`

Per-exercise 1RM history. Append-only; the "current" 1RM for an exercise is the latest row.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | PK |
| `athlete_id` | `uuid` | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `exercise_id` | `bigint` | NOT NULL | FK → `exercises(id)` |
| `source_weight_kg` | `numeric(6,2)` | NOT NULL | input weight |
| `source_reps` | `int` | NOT NULL | input reps |
| `primary_estimate_kg` | `numeric(6,2)` | NOT NULL | average of the four formulas |
| `epley_kg` | `numeric(6,2)` | NOT NULL | individual formula values exposed per FR-007 |
| `brzycki_kg` | `numeric(6,2)` | NOT NULL | |
| `lander_kg` | `numeric(6,2)` | NOT NULL | |
| `lombardi_kg` | `numeric(6,2)` | NOT NULL | |
| `percentage_table` | `jsonb` | NOT NULL | `[{ pct: 60, load_kg, reps_low, reps_high }, …]` |
| `reduced_confidence` | `boolean` | NOT NULL | `true` when `source_reps > 10` |
| `engine_version` | `text` | NOT NULL | |
| `resolved_constants` | `jsonb` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

**Indexes**:
- INDEX on `(athlete_id, exercise_id, created_at desc)` for "latest per exercise".

**RLS**: standard per-athlete pair.

### 4. `body_composition_results`

History of body-fat % and lean-body-mass estimates. Append-only.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | PK |
| `athlete_id` | `uuid` | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `source_measurement_id` | `bigint` | NULL | FK → `body_measurements(id)` when computed off a logged entry; null when computed off the profile alone |
| `method` | `text` | NOT NULL | `'us_navy'` (multi-measurement) or `'bmi_fallback'` (CHECK) |
| `body_fat_pct` | `numeric(4,1)` | NOT NULL | e.g. `15.4` |
| `lean_body_mass_kg` | `numeric(5,2)` | NOT NULL | derived from weight × (1 − bf%/100) |
| `inputs` | `jsonb` | NOT NULL | `{ weight_kg, height_cm, age, sex, waist_cm?, neck_cm?, hip_cm? }` |
| `engine_version` | `text` | NOT NULL | |
| `resolved_constants` | `jsonb` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

**Indexes**:
- INDEX on `(athlete_id, created_at desc)` for "latest body composition".

**RLS**: standard per-athlete pair.

### 5. `calculation_results`

Single shared audit log; one row per persisted calculator run. Read path: timeline / replay only — typed tables (1–4) are the primary read path for production code.

| Column | Type | Null | Notes |
|---|---|---|---|
| `id` | `bigint` identity | NOT NULL | PK |
| `athlete_id` | `uuid` | NOT NULL | FK → `athletes(id)` ON DELETE CASCADE |
| `calculator` | `text` | NOT NULL | `'bmr'` / `'tdee'` / `'macros'` / `'one_rep_max'` / `'body_composition'` / `'progression_eval'` / `'program_generate'` (CHECK) |
| `inputs` | `jsonb` | NOT NULL | snapshot |
| `outputs` | `jsonb` | NOT NULL | snapshot |
| `resolved_constants` | `jsonb` | NOT NULL | snapshot |
| `engine_version` | `text` | NOT NULL | |
| `produced_record_kind` | `text` | NULL | name of the typed table the run wrote to (when applicable) |
| `produced_record_id` | `text` | NULL | string id of the typed row (`bigint`/`uuid` cast to text) |
| `created_at` | `timestamptz` | NOT NULL | default `now()` |

**Indexes**:
- INDEX on `(athlete_id, created_at desc)` — timeline.
- INDEX on `(athlete_id, calculator, created_at desc)` — per-calculator timeline.

**RLS**: standard per-athlete pair (SELECT-only is sufficient for application use, but the standard pair is shipped for symmetry).

**Append-only**: no row in this table is ever UPDATEd or DELETEd by application code. The schema does not enforce this with a trigger in Phase 1; reviewers enforce it.

## Constraints summary

- **5 new typed tables** + **1 audit table** (`calculation_results`) = **6 new tables** total in Phase 1.
- **2 backward-compatible column additions** (`athletes.activity_level`, `app_config.engine_overrides`).
- **All new tables** carry `athlete_id NOT NULL` and ship RLS in the same migration.
- **Soft-archive invariants** (active program, active flag per scope) are enforced by partial-unique indexes, not by the DAO alone.
- **Replay** is supported by the `engine_version` + `resolved_constants` columns on every persisted row, plus the audit log for non-typed runs (BMR/TDEE/macros computed during profile save have typed outputs only inside the program payload, but the audit log captures the standalone run).

## Migration order

Migrations are timestamp-prefixed `20260507000001`–`20260507000007` and applied in lexical order. The proposed order respects FK dependencies:

1. `extend_athletes_activity_level` — column add only; safe first.
2. `init_generated_programs` — references `athletes`.
3. `init_progression_flags` — references `athletes`; standalone (no FK to exercises because `scope_ref` is text).
4. `init_one_rep_max_records` — references `athletes` and `exercises`.
5. `init_body_composition_results` — references `athletes` and `body_measurements`.
6. `init_calculation_results` — references `athletes` only.
7. `extend_app_config_engine_overrides` — column add on `app_config`.

Each migration creates the table, adds indexes, enables RLS, creates the SELECT and modify policies, and adds the partial-unique index where applicable.
