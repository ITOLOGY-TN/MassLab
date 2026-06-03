# Implementation Plan: Phase 7 — Nutrition & Calories

**Branch**: `010-phase7-nutrition-calories` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-phase7-nutrition-calories/spec.md`

## Summary

Phase 7 is the **daily food-and-hydration logging layer**. It ships four athlete-facing surfaces: a **daily food log** across the five fixed meal slots (breakfast, lunch, pre-workout snack, dinner, evening snack) with food search, gram-based input, and **four live progress bars** (calories, protein, carbs, fat) against the athlete's stored targets; a **"Load daily plan"** action that pre-fills the day from the program's template meal plan; a **hydration tracker** (quick-add +250 ml / +500 ml / +1 L against a 3 L default goal, circular gauge); and **trend charts** (calories over 30 days with a goal line, the day's macro breakdown, weekly average daily protein).

Unlike Phase 5/6, Phase 7 introduces **new write tables**: `nutrition_logs` is referenced by the Phase 2 reset DAO but was never created (its absence is `42P01`-guarded today), and no hydration table exists. This phase creates both with `athlete_id` scoping + in-file RLS, plus one small child table so the template plan can carry concrete foods+grams (see research D-6). The athlete's **calorie/macro targets are read, never recomputed** — they come from the existing target-resolution path (`GET /api/v1/me/nutrition-targets` → `resolveTargets`), produced by the Phase 1 calculators. Each logged entry **snapshots** its computed macros so historical totals stay stable if a catalogue food is later edited (FR-003/SC-008). Per the 2026-06-03 clarifications: a missing food is created as a **custom food that persists into the athlete-scoped catalogue** (the `foods` table is already athlete-scoped and gains a write path, FR-002a); **"Load daily plan" on a non-empty day** prompts **replace-or-append** (FR-011); the **weekly protein trend** is **average daily protein per week** (FR-019); the **hydration goal** is **config-default 3 L with an optional per-athlete override** (FR-014).

All new numeric logic (portion scaling, day totals, progress states, trend aggregation) lives in pure, test-first `services/engine/` modules; view assembly lives in a pure `services/nutrition/` presenter boundary; Supabase access stays in `services/dataAccess/*` (Constitution II). The frontend extends the existing `/nutrition` route into a day-log + trends tree, reusing the Phase 5 hand-rolled SVG charts and extending `chartGeometry.js` with a pure donut/gauge helper.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–6; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New engine/presenter modules are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — calories-over-30-days reuses the Phase 5 `components/charts/LineChart.jsx`, weekly protein reuses `BarChart.jsx`, and the macro donut + hydration gauge use a new pure geometry helper in `lib/chartGeometry.js`.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 7 ships 3 forward-only migrations / 3 new tables** — `nutrition_logs`, `hydration_log`, and `nutrition_template_meal_items` — each carrying `athlete_id` and shipping its `*_own` RLS policies in the same migration (Constitution I + Operational Standards). Reuses the existing athlete-scoped `foods` and `nutrition_template_meals` tables (research D-1…D-6).

**Testing**: Vitest. Per Constitution V, every number-producing function is unit-tested first (red → green → refactor):

- `services/engine/nutritionMath.js` (new, pure): `entryMacros({ food, quantityG })` (per-100g → portion snapshot), `dayTotals(entries)` (sum), `progress(totals, targets)` (per-bar value/target/pct/state under|at|over).
- `services/engine/nutritionTrends.js` (new, pure): `caloriesByDay(entries, { days, asOf })` (30-day series), `macroBreakdown(dayEntries)` (proportions), `weeklyAvgProtein(entries, { asOf })` (mean daily protein per week, D-7/clarification).
- `services/nutrition/foodSlug.js` (new, pure): `slugify(name)` (deterministic slug for custom-food reconciliation, FR-002a).
- `services/nutrition/{dayView,trendsView}.js` (new, pure presenters): assemble view models from synthetic DAO output with **no I/O**, including empty/low-data shapes (FR-009/FR-020/FR-027).
- `frontend/src/lib/chartGeometry.js` (extended): `donutSegments`/`gaugeArc` (or `arcPath`) asserted against fixed inputs alongside the existing geometry tests.
- Contract: every `/api/v1/nutrition/*` + `/api/v1/foods` (custom-food create) path in `contracts/openapi.yaml` via Supertest (live-gated, **probes for the `nutrition_logs` table and skips until the migration is applied**, mirroring the Phase 4 pattern).
- Integration: log → day-view total reflects it; edit/delete recompute; validation (zero/oversized quantity → 400, future date → 400); custom-food create persists + reuse-by-search; load-plan replace vs append on a non-empty day; hydration quick-add + undo (clamp ≥ 0) + day rollover; RLS probes on the three new tables; cleans up.
- Frontend smoke (RTL + jsdom): add a food → bars update; load-plan replace/append confirm; hydration quick-add advances the gauge; trends render from a stub; all empty states render without error.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–6 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 7 adds one pure service sub-directory `services/nutrition/` (presenters + slug helper, mirroring `services/loadTracking/` and `services/bodyTracking/`), two new pure `services/engine/` helpers, three new DAOs, three migrations, and a frontend `/nutrition` page tree. All Supabase imports stay in `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Adding a food responds well under the journal 100 ms interactive budget: one row insert + an in-memory re-total of the day (O(entries-per-day), a handful of rows).
- Day-view assembly ≤ 300 ms: one indexed `(athlete_id, logged_on)` read for the day's entries + one hydration read + the cached/derived targets (one resolve), composed in memory.
- Trends assembly ≤ 400 ms: one ranged `(athlete_id, logged_on)` read over the trend window, bucketed in-memory by day/week.
- Charts render client-side from the composed view model; geometry is O(points).

**Constraints**:

- **New tables, RLS-in-migration** (research D-1/D-2/D-6): `nutrition_logs`, `hydration_log`, `nutrition_template_meal_items` are forward-only migrations, each `athlete_id`-scoped with `*_own` select/modify policies shipped in the same file (Constitution I; the application uses the secret-key client and the auth middleware is the primary guard, RLS is defense-in-depth).
- **Targets are read, never recomputed** (FR-008, D-3): the progress bars consume the existing `resolveTargets` output (`daily_kcal/daily_protein_g/daily_carbs_g/daily_fat_g`); Phase 7 does not re-run the macros engine and does **not** write the calculation audit log for food/water logging (FR-029 / CLAUDE.md — the audit log is only for persisted engine calculations, not summation reads).
- **Macro snapshot at log time** (FR-003/SC-008, D-4): each `nutrition_logs` row persists the computed `kcal/protein_g/carbs_g/fat_g` for its portion, so totals for past days never shift when a catalogue food's reference macros are later edited.
- **Custom food persists to the catalogue** (FR-002a, clarification, D-5): the `foods` table (already `athlete_id`-scoped, `UNIQUE(athlete_id, slug, locale)`) gains write methods; a custom food slugged from its name upserts on that constraint so a duplicate name reconciles to the same row rather than creating a confusing duplicate. Full catalogue management (bulk edit/delete/merge) stays a Phase 2 concern.
- **Load-plan is non-destructive** (FR-011, clarification, D-6): on a day with existing entries, the action requires an explicit `mode` of `replace` or `append`; absent a mode on a non-empty day it returns a conflict so the UI must prompt — it never silently overwrites.
- **Determinism**: all new engine/presenter/slug/geometry functions are pure — the caller supplies `asOf`/`now`; no `Date.now()`/random/globals inside pure functions. Future-date validation reads "today" at the request boundary (controller), not inside a pure service (mirrors the Phase 6 weigh-in guard).
- **Tenant scoping** (Constitution I): every read/write is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body/query. The three new DAOs filter every query by `athlete_id`.
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/nutrition/*`, `services/engine/*`, and `frontend/src/lib/chartGeometry.js` take injected data and never import the client; dependency direction is `controllers → nutrition (+ engine) → dataAccess`.
- **Config over hardcoding** (Constitution III): the hydration goal default, the trend window, and the food locale become `.env` keys (`HYDRATION_GOAL_ML`, `NUTRITION_TREND_DAYS`, `NUTRITION_LOCALE`) with safe defaults; the per-athlete hydration-goal override rides on the existing `app_config.engine_overrides.hydration` JSONB (no extra migration).
- **Units**: calories/grams/milliliters are stored and displayed in canonical units; the kg/lbs body-weight preference does not alter nutrition values (spec Assumptions).
- **No AI**: every total, bar, and trend is a deterministic function of logged data and the engine-produced targets, consistent with the project's no-AI boundary.

**Scale/Scope**: 1 athlete; **3 migrations / 3 new tables**; 3 new config keys (+ 1 JSONB override path, no migration); ~8 new endpoints (`GET /nutrition/day`, `POST/PATCH/DELETE /nutrition/log`, `POST /nutrition/load-plan`, `POST /nutrition/hydration`, `GET /nutrition/trends`, `POST /foods` custom-food create + `GET /foods?q=` search filter); 3 new DAOs (`nutritionLogs`, `hydration`, template-items on the existing `nutrition` DAO) + a `foods` DAO write extension; 2 new pure engine modules + 1 slug helper + 2 presenters + 1 frontend geometry helper; 1 seed addition (template meal items for the current athlete); frontend `/nutrition` day + trends tree (≈ progress bars, 5 meal slots, food search, hydration gauge, 3 charts). Estimated ~1,100 LOC backend, ~1,600 LOC frontend, ~1,400 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. All three new tables carry an `athlete_id` FK from creation and ship `*_own` select/modify RLS policies in the same migration (matching the project RLS pattern). Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The custom-food write path filters and scopes by `athlete_id` on the already-scoped `foods` table. The `nutrition_logs` table also retro-fits the collection the Phase 2 reset DAO already expects (its `42P01` guard becomes unnecessary once shipped).

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; controllers orchestrate; the new `services/nutrition/*` presenters, `services/engine/{nutritionMath,nutritionTrends}.js`, and `services/nutrition/foodSlug.js` are pure (no I/O, no globals, caller-supplied `asOf`); the only new Supabase-touching code is the three DAO modules. The frontend reaches every surface through `/api/v1/` and never touches the secret key.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. The hydration goal (`HYDRATION_GOAL_ML`), trend window (`NUTRITION_TREND_DAYS`), and food locale (`NUTRITION_LOCALE`) are `.env` keys with safe defaults; the per-athlete hydration override lives in `app_config.engine_overrides`. No athlete data, target values, URLs, or secrets in source — targets and the template plan come from the seed/engine, not constants.

- **IV. Versioned API Contract** — **PASS**. All endpoints live under `/api/v1/` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the canonical error envelope, and are additive within v1 (the existing `GET /nutrition/template` and `GET /nutrition/targets` are unchanged; new logging/trends/hydration paths are added; `POST /foods` extends the foods router). No breaking change to any existing contract.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every number surfaced is produced by a pure function tested first: portion macros (`entryMacros`), day totals (`dayTotals`), progress states (`progress`), the three trend aggregations (`caloriesByDay`/`macroBreakdown`/`weeklyAvgProtein`), the slug reconciler, and the donut/gauge geometry. Calorie/macro targets reuse the already-tested Phase 1 macros engine (read-only). UI views are exempt from strict TDD but ship smoke tests.

- **VI. Athlete-First UX** — **PASS**. Each surface answers a real daily question (how much is left to eat today / what's my macro split / am I hitting protein weekly / am I hydrated). Food add uses large hit targets and gram input; hydration uses ±-style quick-add buttons consistent with the journal's one-handed ergonomics. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; charts reuse the bespoke SVG components (no generic chart library) to keep the premium look. Empty/low-data states are designed, not blank (FR-009/FR-020/FR-027).

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds three tables, each athlete-scoped with `*_own` RLS shipped in-migration; all reads/writes trace to athlete-scoped tables; no cross-tenant path.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; mutations are day/entry-scoped logging, the day-scoped hydration upsert, the athlete-scoped custom-food upsert, and the load-plan copy (replace/append, never silent overwrite).
- The source layout keeps Supabase imports inside `services/dataAccess/*`, numeric logic inside pure `services/engine/*`, view assembly inside pure `services/nutrition/*`, and chart geometry inside the pure `frontend/src/lib/chartGeometry.js`; no `models/` directory is added.
- Performance budgets hold: each screen is one or two indexed reads plus O(entries) in-memory composition; charts render client-side; targets are a single resolve.

No principle violations; no Complexity Tracking entries required. (The three migrations are required new persistence for a write-heavy phase, not an architectural workaround — they comply with Principle I rather than bypassing it.)

## Project Structure

### Documentation (this feature)

```text
specs/010-phase7-nutrition-calories/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-03)
├── research.md          # Phase 0 of plan — D-1…D-12 decisions + rationale
├── data-model.md        # Phase 1 of plan — 3 migrations + DAOs + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 4 surfaces
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — nutrition logging + trends + custom-food endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing; clarifications resolved)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 7 extends the Phase 0–6 layout. **Bold** = new in Phase 7; everything else already exists.

```text
masslab/
├── supabase/migrations/
│   ├── 20260603000001_init_nutrition_logs.sql              # NEW: nutrition_logs + RLS *_own + index
│   ├── 20260603000002_init_hydration_log.sql               # NEW: hydration_log + RLS *_own
│   └── 20260603000003_init_nutrition_template_meal_items.sql # NEW: template foods+grams child table + RLS
├── seed/
│   ├── nutritionTemplateItems.seed.json                    # NEW: concrete foods+grams per slot (current athlete)
│   └── runSeed.js                                           # EXTENDED: insert template meal items (idempotent)
├── routes/
│   ├── nutrition.routes.js                                 # EXTENDED: GET /day, POST/PATCH/DELETE /log, POST /load-plan, POST /hydration, GET /trends
│   └── foods.routes.js                                     # EXTENDED: POST / (create custom food), GET /?q= search
├── controllers/
│   ├── nutrition.controller.js                            # EXTENDED: getDay, logEntry, editEntry, deleteEntry, loadPlan, addHydration, getTrends
│   └── foods.controller.js                                # EXTENDED: create (custom food)
├── services/
│   ├── engine/
│   │   ├── nutritionMath.js                               # NEW pure: entryMacros, dayTotals, progress
│   │   └── nutritionTrends.js                             # NEW pure: caloriesByDay, macroBreakdown, weeklyAvgProtein
│   ├── nutrition/                                         # NEW pure presenter boundary
│   │   ├── targets.js                                    # NEW: resolveTargets (extracted from nutritionTargets.controller, shared)
│   │   ├── foodSlug.js                                    # slugify(name) for custom-food reconciliation
│   │   ├── dayView.js                                     # meal slots + subtotals + progress bars + hydration
│   │   └── trendsView.js                                 # calories-30d + macro breakdown + weekly avg protein
│   └── dataAccess/
│       ├── nutritionLogs.dao.js                          # NEW: insert/listForDay/listRange/findById/update/delete/deleteForDay
│       ├── hydration.dao.js                              # NEW: getForDay/upsertDelta(clamp ≥0)/listRange
│       ├── nutrition.dao.js                              # EXTENDED: listTemplateItems (foods+grams per slot)
│       └── foods.dao.js                                  # EXTENDED: createForAthlete(upsert by slug), findById, list(q)
├── config/
│   └── schema.js                                         # EXTENDED: HYDRATION_GOAL_ML, NUTRITION_TREND_DAYS, NUTRITION_LOCALE
├── app.js                                                # EXTENDED: wire nutritionLogs + hydration daos (nutrition router already mounted)
└── frontend/src/
    ├── pages/nutrition/
    │   ├── NutritionDay.jsx                              # NEW /nutrition — 4 bars + 5 meal slots + food search + load-plan + hydration gauge
    │   └── NutritionTrends.jsx                           # NEW /nutrition/trends — calories 30d, macro donut, weekly protein
    ├── components/charts/
    │   ├── LineChart.jsx                                 # reused (calories 30d + goal line)
    │   ├── BarChart.jsx                                  # reused (weekly avg protein)
    │   ├── DonutChart.jsx                                # NEW (macro breakdown) — pure geometry
    │   └── HydrationGauge.jsx                            # NEW (circular gauge) — pure geometry
    ├── lib/
    │   ├── chartGeometry.js                              # EXTENDED: donutSegments / gaugeArc (pure, unit-tested)
    │   └── nutritionApi.js                               # NEW thin wrappers (day, log, load-plan, hydration, trends, foods)
    └── App.jsx                                           # EXTENDED: /nutrition day + /nutrition/trends routes (nav "Nutrition" exists)
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–6. The additions mirror Phase 5/6 exactly: a pure `services/nutrition/` presenter boundary (so controllers stay thin and view assembly is unit-testable without I/O) and new pure `services/engine/` helpers for the only new numeric logic (portion scaling, totals, progress, trends). The difference from Phase 6 is that Phase 7 is **write-heavy and needs real persistence**, so it ships three athlete-scoped, RLS-shipping migrations (creating the `nutrition_logs` table the reset DAO already anticipates, a per-day `hydration_log`, and a small template-items child table so the plan can carry concrete foods+grams). The catalogue write path reuses the existing `foods` table rather than adding a custom-food table. Charts reuse the Phase 5 SVG components; the only new chart geometry (donut + gauge) is one pure, tested helper. No `models/` directory is added; all Supabase access stays behind `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required. (The three new migrations satisfy Principle I — athlete-scoped persistence with RLS — rather than working around any principle.)
