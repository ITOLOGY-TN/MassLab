# Phase 1 Data Model — Nutrition & Calories (Phase 7)

**Feature**: `010-phase7-nutrition-calories` · **Date**: 2026-06-03

**Migrations in this phase: 3** (forward-only, each ships its own `*_own` RLS in the same file). Phase 7 is write-heavy, so unlike Phase 5/6 it adds real persistence. It also **extends** the existing athlete-scoped `foods` table (write path) and `nutrition_template_meals` (read), and reuses the existing target-resolution path read-only.

## New tables

### `nutrition_logs` — one row per logged food, per meal slot, per day (migration `20260603000001`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK (identity) | |
| `athlete_id` | uuid FK → athletes (cascade) | tenant scope (Constitution I) |
| `logged_on` | date NOT NULL | the day this food was eaten (FR-001); server-validated not-future (FR-024) |
| `slot` | text NOT NULL | `breakfast`/`lunch`/`pre_workout`/`dinner`/`evening_snack` (CHECK) |
| `food_id` | bigint FK → foods **ON DELETE RESTRICT** | the catalogue/custom food logged (FR-002/FR-002a); no in-phase food-delete path, and the `food_name` + macro snapshot keep the row self-describing regardless |
| `food_name` | text NOT NULL | snapshot of the food name at log time (display stability) |
| `quantity_g` | numeric(7,2) NOT NULL | portion in grams, `> 0` (FR-004) |
| `kcal` | numeric(7,2) NOT NULL | **snapshot** computed at log time (FR-003/SC-008) |
| `protein_g` | numeric(6,2) NOT NULL | snapshot |
| `carbs_g` | numeric(6,2) NOT NULL | snapshot |
| `fat_g` | numeric(6,2) NOT NULL | snapshot |
| `created_at` | timestamptz NOT NULL default now() | |

Index: `nutrition_logs_athlete_day_idx (athlete_id, logged_on)`. RLS: `nutrition_logs_select_own` / `_modify_own` (shipped in-file). **Note**: the Phase 2 reset DAO already references this table name (`42P01`-guarded); shipping it makes that path live.

### `hydration_log` — one row per athlete per day (migration `20260603000002`)

| Column | Type | Notes |
|--------|------|-------|
| `athlete_id` | uuid FK → athletes (cascade) | tenant scope |
| `logged_on` | date NOT NULL | the calendar day (FR-016) |
| `total_ml` | int NOT NULL default 0 | running water total; clamped `≥ 0` at the app layer (FR-015) |
| `updated_at` | timestamptz NOT NULL default now() | |
| | | **`UNIQUE(athlete_id, logged_on)`** → one counter per day |

RLS: `hydration_log_select_own` / `_modify_own`. Goal is **not** stored here (config/preference-driven, D-9).

### `nutrition_template_meal_items` — concrete foods+grams for the template plan (migration `20260603000003`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK (identity) | |
| `athlete_id` | uuid FK → athletes (cascade) | tenant scope |
| `slot` | text NOT NULL | matches the five meal slots |
| `food_id` | bigint FK → foods | a catalogue food in the template meal |
| `quantity_g` | numeric(7,2) NOT NULL | planned grams for this food |
| `display_order` | int NOT NULL | ordering within the slot |

RLS: `nutrition_template_meal_items_select_own` / `_modify_own`. Seeded for the current athlete from `seed/nutritionTemplateItems.seed.json` (D-6); future multi-user generation is a program-generator follow-up.

## Existing tables (reused)

### `foods` — the catalogue, now athlete-writable for custom foods (no migration)

Already `athlete_id`-scoped with `UNIQUE(athlete_id, slug, locale)`, per-100g reference macros, `category`, and shipped `*_own` RLS. Phase 7 adds DAO **write** methods (D-5); no schema change.

### `nutrition_template_meals` — per-slot target macros (read-only here)

Reused only to display per-slot targets if needed; the concrete plan foods come from the new `nutrition_template_meal_items` table.

### Targets (read-only via existing resolution)

Daily `daily_kcal/daily_protein_g/daily_carbs_g/daily_fat_g` are resolved by the existing `resolveTargets` flow (athlete profile + `app_config.engine_overrides.nutrition.*` + Phase 1 macros engine). Phase 7 reads them for the progress bars; it does not write them and does not append to `calculation_results` (D-3).

This resolution is **extracted** from `controllers/nutritionTargets.controller.js` into a shared `services/nutrition/targets.js#resolveTargets({ daos, athleteId })` so the day view, trends, and the existing targets endpoint all read one implementation (no duplicated macro math). It receives injected `daos` and imports no Supabase client (Constitution II).

## DAO changes

### `services/dataAccess/nutritionLogs.dao.js` (NEW)

| Method | Purpose |
|--------|---------|
| `insert(row)` | persist a log entry (with macro snapshot) → FR-001 |
| `listForDay(athleteId, loggedOn)` | the day's entries grouped client-side by slot → day view (FR-021) |
| `listRange(athleteId, { from, to })` | entries over a date range → trends (FR-022) |
| `findById(athleteId, id)` | scoped fetch before edit/delete |
| `update(athleteId, id, fields)` | edit `quantity_g` + rewritten macro snapshot (FR-005) |
| `delete(athleteId, id)` | remove one entry (FR-005) |
| `deleteForDay(athleteId, loggedOn)` | clear a day (load-plan `replace`, D-6) |

### `services/dataAccess/hydration.dao.js` (NEW)

| Method | Purpose |
|--------|---------|
| `getForDay(athleteId, loggedOn)` | current `total_ml` (or 0) → gauge |
| `upsertDelta(athleteId, loggedOn, deltaMl)` | upsert + increment, clamp result `≥ 0` (FR-013/FR-015) |
| `listRange(athleteId, { from, to })` | optional history (not required for MVP) |

### `services/dataAccess/nutrition.dao.js` (EXTENDED)

| Method | Purpose |
|--------|---------|
| `listTemplateItems(athleteId)` | template foods+grams per slot → load-plan (D-6) |

### `services/dataAccess/foods.dao.js` (EXTENDED)

| Method | Purpose |
|--------|---------|
| `createForAthlete({ athleteId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, locale, category })` | **upsert** on `(athlete_id, slug, locale)` using `slugify(name)` → custom food, duplicate-name reconciled (FR-002a) |
| `findById(athleteId, id)` | fetch a food to log against |
| `list({ athleteId, locale, category, q })` | existing list + optional `q` name filter for search (FR-002) |

All methods filter by `athlete_id` (Constitution I); error mapping mirrors the other DAOs (`HttpError(500,'DB_ERROR', …)`; unique-violation `23505` reconciles via upsert; not-found → `HttpError(404,'NOT_FOUND', …)`).

## New pure engine helpers (`services/engine/`, test-first — Constitution V)

### `nutritionMath.js`

- `entryMacros({ food, quantityG })` → `{ kcal, protein_g, carbs_g, fat_g }` — scales per-100g reference macros by `quantityG / 100` (D-4). The snapshotted numbers.
- `dayTotals(entries)` → `{ kcal, protein_g, carbs_g, fat_g }` — sum of entry snapshots.
- `progress(totals, targets)` → `{ kcal: {value,target,pct,state}, protein_g:{…}, carbs_g:{…}, fat_g:{…} }` — `state ∈ {under, at, over}`; `target` null-safe (graceful when targets unset, FR-009).

### `nutritionTrends.js`

- `caloriesByDay(entries, { days, asOf })` → `[{ date, kcal }]` date-asc across the window (FR-017).
- `macroBreakdown(dayEntries)` → `{ protein_g, carbs_g, fat_g, fractions: {…} }` — proportions of the day's intake (FR-018).
- `weeklyAvgProtein(entries, { asOf })` → `[{ weekStart, avgProteinG }]` — **mean protein across that week's logged days** (FR-019, clarification).

All pure: caller supplies `asOf`/`now`; no `Date.now()`, no I/O, no globals.

## New pure helpers/presenters (`services/nutrition/`)

| File | Composes | Inputs (injected) | Output (view model) |
|------|----------|-------------------|---------------------|
| `foodSlug.js` | `slugify(name)` — lowercase, strip accents, hyphenate (deterministic) | name string | slug string (custom-food reconciliation, FR-002a) |
| `dayView.js` | meal slots + subtotals + 4 progress bars + hydration (FR-006/FR-007/FR-013) | day entries, resolved targets, hydration `{ total_ml, goal_ml }` | `{ date, slots:[{slot, entries, subtotal}], totals, bars, hydration }` |
| `trendsView.js` | calories-30d + macro donut + weekly protein (FR-017–FR-019) | ranged entries, target kcal, `{ days, asOf }` | `{ calories:{points, goalKcal}, macroBreakdown, weeklyProtein }` |

Each handles the empty/low-data shape (FR-009/FR-020/FR-027) explicitly.

## View-model shapes (consumed by the frontend)

```jsonc
// GET /nutrition/day?date=YYYY-MM-DD
{ "data": {
  "date": "2026-06-03",
  "slots": [
    { "slot": "breakfast",
      "entries": [ { "id": 12, "food_id": 3, "food_name": "Flocons d'avoine",
                     "quantity_g": 80, "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 6 } ],
      "subtotal": { "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 6 } },
    { "slot": "lunch", "entries": [], "subtotal": { "kcal": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0 } }
    // … pre_workout, dinner, evening_snack
  ],
  "totals": { "kcal": 300, "protein_g": 10, "carbs_g": 54, "fat_g": 6 },
  "bars": {
    "kcal":      { "value": 300, "target": 3300, "pct": 0.09, "state": "under" },
    "protein_g": { "value": 10,  "target": 175,  "pct": 0.06, "state": "under" },
    "carbs_g":   { "value": 54,  "target": 430,  "pct": 0.13, "state": "under" },
    "fat_g":     { "value": 6,   "target": 90,   "pct": 0.07, "state": "under" }
  },
  "hydration": { "total_ml": 750, "goal_ml": 3000 }
} }

// GET /nutrition/trends?date=YYYY-MM-DD
{ "data": {
  "calories": { "points": [ { "date": "2026-05-05", "kcal": 3120 }, … ], "goalKcal": 3300 },
  "macroBreakdown": { "protein_g": 175, "carbs_g": 430, "fat_g": 90,
                      "fractions": { "protein": 0.21, "carbs": 0.52, "fat": 0.27 } },
  "weeklyProtein": [ { "weekStart": "2026-05-04", "avgProteinG": 168 }, … ]
} }

// POST /nutrition/log  → 201 { "data": <created entry with snapshot> }
// POST /foods (custom)  → 201 { "data": <food row> }   (upsert-reconciled on slug)
```

## Logging & load-plan semantics

- **Log (FR-001/FR-003/FR-004)**: `POST /nutrition/log` with `{ logged_on, slot, quantity_g, food_id }` **or** `{ …, custom_food: { name, kcal_per_100g, protein_per_100g, carbs_per_100g, fat_per_100g } }`. The controller resolves/creates the food, computes the macro snapshot (`entryMacros`), validates `quantity_g > 0` and the date, and inserts.
- **Edit/Delete (FR-005)**: `PATCH /nutrition/log/:id` updates `quantity_g` and rewrites the snapshot; `DELETE /nutrition/log/:id` removes the entry. Both scoped by `athlete_id`.
- **Load plan (FR-010/FR-011, D-6)**: `POST /nutrition/load-plan` with `{ date, mode? }`. Empty day → insert template items. Non-empty day → `mode=replace` (deleteForDay then insert) or `mode=append` (insert on top); missing `mode` → `409 LOAD_PLAN_CONFLICT`.
- **Hydration (FR-013/FR-015)**: `POST /nutrition/hydration` with `{ date, delta_ml }` (e.g. +250 / +500 / +1000, or negative to undo); upsert-increment, clamp `≥ 0`.

## Validation additions (D-10)

- Zod log schema: `slot` enum, `quantity_g` number `> 0` and `≤ 5000`, exactly one of `food_id` / `custom_food`. Custom-food macros within plausible bounds.
- Controller boundary: reject `logged_on`/`date` after server today → `400 VALIDATION_FAILED` (FR-024).
- Hydration: `delta_ml` bounded integer; resulting total clamped `≥ 0`.
- Load-plan: non-empty day without `mode` → `409`; bad `mode` → `400`.

## Config additions (`config/schema.js`, D-9)

| Key | Default | Purpose |
|-----|---------|---------|
| `HYDRATION_GOAL_ML` | `3000` | daily hydration goal (system default) |
| `NUTRITION_TREND_DAYS` | `30` | calories-trend window |
| `NUTRITION_LOCALE` | `fr-FR` | locale for food search + custom-food creation |
| (override) `app_config.engine_overrides.hydration.goal_ml` | — | optional per-athlete goal (JSONB, no migration) |

## Tenant & RLS

All three new tables ship `*_own` select/modify policies in their migrations (the project pattern keying on `athlete_id ∈ (select id from athletes where auth_user_id = auth.uid())`). Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The RLS integration test (`tests/integration/rls.policies.test.js`) gains probes for `nutrition_logs`, `hydration_log`, and `nutrition_template_meal_items`.
