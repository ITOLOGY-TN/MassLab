# Phase 8 Data Model — Supplements

**Feature**: `011-phase8-supplements` · **Date**: 2026-06-03

**Migrations in this phase: 2** (forward-only, each ships its own `*_own` RLS in the same file). Phase 8 is write-heavy, so like Phase 7 it adds real persistence. It reuses the existing athlete-scoped `supplements` catalogue **read-only** (no schema change) and reads `program_start_date` from the athlete profile for the streak lower bound.

## New tables

### `supplement_intake_log` — one row per supplement taken, per day (migration `20260603000004`)

Presence of a row ≡ the supplement was taken that day (D-1). Absence on an elapsed day = missed (derived, D-7).

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK (identity) | |
| `athlete_id` | uuid FK → athletes (cascade) | tenant scope (Constitution I) |
| `supplement_id` | bigint FK → supplements **ON DELETE CASCADE** | the catalogue supplement taken (FR-002); cascade so a future catalogue deletion cannot orphan adherence rows |
| `logged_on` | date NOT NULL | the day taken (FR-002); server-validated within the current ISO week and not-future (FR-005/FR-005a) |
| `created_at` | timestamptz NOT NULL default now() | |
| | | **`UNIQUE(athlete_id, supplement_id, logged_on)`** → at most one taken record per supplement per day (FR-003/SC-002) |

Index: `supplement_intake_log_athlete_day_idx (athlete_id, logged_on)` (ranged reads for streaks + grid). RLS: `supplement_intake_log_select_own` / `_modify_own` (shipped in-file).

### `supplement_weekly_assessment` — one row per athlete per ISO week (migration `20260603000005`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK (identity) | |
| `athlete_id` | uuid FK → athletes (cascade) | tenant scope |
| `week_start` | date NOT NULL | ISO week Monday (D-2/D-6); server-derived, current week only on write (FR-013) |
| `energy` | int NOT NULL | `CHECK (energy between 1 and 5)` (FR-014) |
| `recovery` | int NOT NULL | `CHECK (recovery between 1 and 5)` |
| `sleep_quality` | int NOT NULL | `CHECK (sleep_quality between 1 and 5)` |
| `strength` | int NOT NULL | `CHECK (strength between 1 and 5)` |
| `created_at` | timestamptz NOT NULL default now() | |
| `updated_at` | timestamptz NOT NULL default now() | refreshed on upsert UPDATE path (column default fires on INSERT only) |
| | | **`UNIQUE(athlete_id, week_start)`** → one assessment per week (FR-013) |

RLS: `supplement_weekly_assessment_select_own` / `_modify_own` (shipped in-file).

## Existing tables (reused, read-only)

### `supplements` — the catalogue (no migration)

Already `athlete_id`-scoped with `UNIQUE(athlete_id, slug, locale)`, `name`/`dosage`/`recommended_time`/`notes`/`display_order`, and shipped `*_own` RLS. Phase 8 only **reads** it (catalogue editing is a Phase 2 concern, FR-020). The primary-supplement flag is matched by `slug = SUPPLEMENT_PRIMARY_SLUG` (default `creatine-monohydrate`, D-9).

### Athlete profile — `program_start_date` (read-only via `athletes.dao.findById`)

The streak lower bound (D-5). Read at the controller boundary and passed into the pure streak function; never read inside a pure function.

## DAO changes

### `services/dataAccess/supplementIntake.dao.js` (NEW)

| Method | Purpose |
|--------|---------|
| `markTaken(athleteId, supplementId, loggedOn)` | `insert … onConflict(athlete_id,supplement_id,logged_on) ignore` → at-most-one (FR-003/D-3) |
| `unmark(athleteId, supplementId, loggedOn)` | scoped `delete` of the (supplement, day) row (FR-002 un-toggle) |
| `listForDay(athleteId, loggedOn)` | taken `supplement_id`s for one day → checklist taken-state (FR-017) |
| `listRange(athleteId, { from, to })` | taken rows over a date range → streaks + weekly grid (FR-017) |

### `services/dataAccess/supplementAssessments.dao.js` (NEW)

| Method | Purpose |
|--------|---------|
| `getForWeek(athleteId, weekStart)` | the week's assessment (or null) → form prefill (FR-012) |
| `upsert(athleteId, weekStart, { energy, recovery, sleep_quality, strength })` | `onConflict(athlete_id,week_start)` update-in-place (FR-013); refreshes `updated_at` |
| `listRange(athleteId, { from, to })` | assessments over a window → trend (FR-015/FR-018) |

### `services/dataAccess/reset.dao.js` (EXTENDED, D-9)

- `MODULE_TABLES.supplements` → `['supplement_intake_log', 'supplement_weekly_assessment', 'supplements']`.
- `FULL_WIPE_ORDER` adds `supplement_intake_log` and `supplement_weekly_assessment` **before** `supplements` (children precede the parent; the `42P01` guard already tolerates the tables being absent pre-migration).

All methods filter by `athlete_id` (Constitution I); error mapping mirrors the other DAOs (`HttpError(500,'DB_ERROR', …)`; not-found → `null`/`HttpError(404,'NOT_FOUND', …)`).

## New pure engine helpers (`services/engine/`, test-first — Constitution V)

### `supplementStreaks.js`

- `streakForSupplement(takenDates, { asOf, programStart })` → integer. `takenDates` = a Set/array of ISO date strings on which the supplement was taken. Walks back from the most recent applicable day (today if taken, else the run ending at the latest taken day — today-not-taken does not break), counting consecutive taken days, stopping at the first elapsed gap or at `programStart` (never counts a date `< programStart`). Never-taken → `0` (D-5).

### `supplementGrid.js`

- `cellStatus(date, takenSet, { asOf })` → `'taken' | 'missed' | 'upcoming'`. `taken` if `date ∈ takenSet`; else `missed` if `date < asOf` (fully elapsed); else `upcoming` (today not-yet-taken, or future) (D-7).

All pure: caller supplies `asOf`/`programStart`; no `Date.now()`, no I/O, no globals.

## New pure helpers/presenters (`services/supplements/`)

| File | Composes | Inputs (injected) | Output (view model) |
|------|----------|-------------------|---------------------|
| `week.js` | `isoWeekStart(date)` (→ Monday), `weekDays(weekStart)` (7 ISO dates), `isCurrentIsoWeek(date, asOf)` | a date + `asOf` | week boundaries / membership (D-4/D-6) |
| `checklistView.js` | cards + taken-state + per-supplement streak, creatine flagged (FR-001/FR-006/FR-007/FR-008) | catalogue, taken rows over the streak window, `{ asOf, programStart, primarySlug }` | `{ date, supplements: [{ id, slug, name, dosage, recommended_time, taken, streak, is_primary }] }` |
| `weekGridView.js` | 7×N grid of taken/missed/upcoming cells (FR-009/FR-010/FR-011) | catalogue, taken rows for the week, `{ weekStart, asOf }` | `{ week_start, days: [date…], rows: [{ supplement_id, name, slug, cells: [{ date, status }] }] }` |
| `assessmentView.js` | current-week assessment + trend series for the 4 dimensions (FR-012/FR-015) | current-week row (or null), ranged rows, `{ asOf, isEditable }` | `{ current: { week_start, energy, recovery, sleep_quality, strength } \| null, editable, trend: [{ week_start, energy, recovery, sleep_quality, strength }] }` |

Each handles the empty/low-data shape (FR-004/FR-016) explicitly.

## View-model shapes (consumed by the frontend)

```jsonc
// GET /supplements/checklist?date=YYYY-MM-DD
{ "data": {
  "date": "2026-06-03",
  "supplements": [
    { "id": 1, "slug": "creatine-monohydrate", "name": "Créatine monohydrate",
      "dosage": "5 g", "recommended_time": "morning", "taken": true, "streak": 14, "is_primary": true },
    { "id": 2, "slug": "serious-mass", "name": "Serious Mass (gainer)",
      "dosage": "1 dose (≈ 165 g) dans 500 ml de lait", "recommended_time": "post_workout",
      "taken": false, "streak": 0, "is_primary": false }
    // … vitamin-d3, magnesium, omega-3
  ]
} }

// GET /supplements/grid?week=YYYY-MM-DD   (week any date; server snaps to ISO Monday)
{ "data": {
  "week_start": "2026-06-01",
  "days": ["2026-06-01","2026-06-02","2026-06-03","2026-06-04","2026-06-05","2026-06-06","2026-06-07"],
  "rows": [
    { "supplement_id": 1, "slug": "creatine-monohydrate", "name": "Créatine monohydrate",
      "cells": [
        { "date": "2026-06-01", "status": "taken" },
        { "date": "2026-06-02", "status": "missed" },
        { "date": "2026-06-03", "status": "upcoming" },
        { "date": "2026-06-04", "status": "upcoming" }
        // … through 2026-06-07
      ] }
    // … one row per catalogue supplement
  ]
} }

// GET /supplements/assessments   → current week + trend
{ "data": {
  "current": { "week_start": "2026-06-01", "energy": 4, "recovery": 3, "sleep_quality": 4, "strength": 4 },
  "editable": true,
  "trend": [
    { "week_start": "2026-05-11", "energy": 3, "recovery": 3, "sleep_quality": 3, "strength": 3 },
    { "week_start": "2026-05-18", "energy": 4, "recovery": 4, "sleep_quality": 3, "strength": 4 }
    // … chronological, up to SUPPLEMENT_ASSESSMENT_TREND_WEEKS
  ]
} }

// POST /supplements/intake { supplement_id, logged_on, taken }   → 200 { "data": { "supplement_id", "logged_on", "taken" } }
// PUT  /supplements/assessment { energy, recovery, sleep_quality, strength }  → 200 { "data": <assessment row> }  (week = current ISO week, server-derived)
```

## Logging & assessment semantics

- **Toggle taken (FR-002/FR-003/FR-005/FR-005a)**: `POST /supplements/intake` with `{ supplement_id, logged_on, taken }`. The controller validates `supplement_id` belongs to the athlete's catalogue, validates `logged_on` is **within the current ISO week** and **not future**, then `taken === true` → `markTaken` (upsert-ignore), `taken === false` → `unmark`. Outside the window → `422`; future → `422`.
- **Checklist (FR-001/FR-006/FR-007)**: `GET /supplements/checklist?date=` reads the catalogue + taken rows over the streak window (`program_start_date … today`), composes per-card taken-state + streak via the pure engine, flags `is_primary` by `SUPPLEMENT_PRIMARY_SLUG`.
- **Grid (FR-009/FR-010/FR-011)**: `GET /supplements/grid?week=` snaps the requested date to its ISO Monday, reads the catalogue + that week's taken rows, classifies each cell. Any week navigable (read-only); future weeks all `upcoming`.
- **Assessment (FR-012/FR-013/FR-014/FR-015)**: `GET /supplements/assessments` returns the current-week row + the trend window. `PUT /supplements/assessment` upserts the **current ISO week** (server-derived; client cannot target another week → elapsed weeks read-only). Ratings validated 1–5 (zod + DB `CHECK`).

## Validation additions

- Zod intake schema: `supplement_id` positive int; `logged_on` ISO date; `taken` boolean.
- Zod assessment schema: `energy`/`recovery`/`sleep_quality`/`strength` each integer in `[1,5]`; missing dimension → `400 VALIDATION_FAILED` (FR-014).
- Controller boundary: `logged_on` after server today → `422 FUTURE_DATE`; `logged_on` outside the current ISO week → `422 OUTSIDE_EDIT_WINDOW` (FR-005/FR-005a).
- `supplement_id` not in the athlete's catalogue → `404 NOT_FOUND`.

## Config additions (`config/schema.js`, D-9)

| Key | Default | Purpose |
|-----|---------|---------|
| `SUPPLEMENT_PRIMARY_SLUG` | `creatine-monohydrate` | the supplement whose streak is shown most prominently (FR-008) |
| `SUPPLEMENT_ASSESSMENT_TREND_WEEKS` | `12` | rolling window (weeks) for the assessment trend |

## Tenant & RLS

Both new tables ship `*_own` select/modify policies in their migrations (the project pattern keying on `athlete_id ∈ (select id from athletes where auth_user_id = auth.uid())`). Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The RLS integration test (`tests/integration/rls.policies.test.js`) gains probes for `supplement_intake_log` and `supplement_weekly_assessment`.
