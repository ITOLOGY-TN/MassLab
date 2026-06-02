---
description: 'Task list for MassLab Phase 1 — Calculators Engine'
---

# Tasks: Phase 1 — Calculators Engine

**Input**: Design documents from `/specs/002-calculators-engine/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml
**Constitution**: v1.1.1 (Supabase stack: Node + Express + Supabase Postgres + Supabase Auth + React/Vite/Tailwind)

**Tests**: Phase 1 ships strict TDD only for the calculator pure functions and the progression rule engine (Constitution Principle V — domain-logic-only). Other tests (integration, contract, frontend smoke) are written alongside or right after their target file (still merged in this phase).

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1; US1 is the MVP target because it produces the visible Nutrition view that proves the engine end-to-end. US3, US4 are P2; US5, US6 are P3. Phase 1 builds on Phase 0 — every Phase 0 file referenced below already exists.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks → safe to run in parallel.
- **[Story]**: `[US1]`–`[US6]` only on user-story tasks. Setup, Foundational, and Polish carry no story label.
- All file paths are repository-relative.

## Path Conventions

- Backend at repo root: `routes/`, `controllers/`, `services/`, `services/engine/`, `services/dataAccess/`, `middleware/`, `seed/`, `tests/`, `supabase/migrations/`.
- Frontend under `frontend/` (npm workspace). Tests for the frontend live under `tests/frontend/`.
- New Phase 1 directory: `services/engine/` for pure calculators (no `@supabase/supabase-js` imports).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add the one new frontend dependency and scaffold the new directory layout. No backend dependencies are added.

- [x] T001 Add `react-router-dom@^6` to `frontend/package.json` (`npm --prefix frontend install react-router-dom@^6`)
- [x] T002 [P] Create `services/engine/` directory with a placeholder `services/engine/.gitkeep` so the engine boundary is visible from the first commit
- [x] T003 [P] Create `frontend/src/components/` and `frontend/src/pages/calculators/` directories with `.gitkeep` placeholders
- [x] T004 Run the existing Phase 0 test suite (`npm test`) and confirm the 53 backend + 1 frontend tests still pass before any Phase 1 changes land

**Checkpoint**: Workspace ready; no behaviour change yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Migrations + engine constants + audit-log plumbing + initial program seed. Every user story below depends on this phase.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

### Engine constants & resolver

- [x] T005 Create `services/engine/constants.js` exporting `ENGINE_VERSION = '1.0.0'` and a frozen `DEFAULTS` object with every constant from data-model.md §"app_config — add engine_overrides" (bulk_surplus_kcal=400, cut_deficit_kcal=400, protein_g_per_kg_lbm=2.2, load_increment_upper_kg=2.5, load_increment_lower_kg=5, deload_volume_cut_pct=30, stagnation_window_weeks=3, double_progression_window_sessions=2, deload_rpe_threshold=9, regression_window_weeks=2, rpe_coverage_minimum_pct=60, activity_factors map {sedentary:1.2, lightly_active:1.375, moderately_active:1.55, very_active:1.725, extremely_active:1.9}, default_body_fat_pct map {ectomorph:0.12, mesomorph:0.15, endomorph:0.20} consumed by macros when LBM is not provided, percentage_table_default rep ranges per research.md §8)
- [x] T006 [P] Write unit test `tests/unit/engine.resolveConstants.test.js`: empty override returns defaults exactly; partial override merges; unknown override keys are dropped; result is frozen
- [x] T007 Implement `services/engine/resolveConstants.js` exporting `resolveConstants(athleteOverride)` that returns `Object.freeze({ ...DEFAULTS, ...sanitized })`; passes T006

### Migrations (each ships table + RLS in the same file)

- [x] T008 [P] Migration `supabase/migrations/20260507000001_extend_athletes_activity_level.sql` — add `activity_level text not null default 'moderately_active'` with CHECK on the five-level enum per data-model.md §"athletes — add activity_level"
- [x] T009 [P] Migration `supabase/migrations/20260507000002_init_generated_programs.sql` — table + indexes + the partial-unique `unique (athlete_id) where is_active = true` + RLS pair per data-model.md §1
- [x] T010 [P] Migration `supabase/migrations/20260507000006_init_calculation_results.sql` — table + indexes (`(athlete_id, created_at desc)`, `(athlete_id, calculator, created_at desc)`) + RLS pair per data-model.md §5
- [x] T011 [P] Migration `supabase/migrations/20260507000007_extend_app_config_engine_overrides.sql` — add `engine_overrides jsonb not null default '{}'::jsonb` per data-model.md §"app_config — add engine_overrides"
- [x] T012 Apply foundational migrations against the linked cloud project: `supabase db push`; verify in Studio that `generated_programs`, `calculation_results`, `athletes.activity_level`, and `app_config.engine_overrides` are present with RLS enabled

### Foundational DAOs (only `services/dataAccess/*` imports `@supabase/supabase-js`)

- [x] T013 [P] Extend `services/dataAccess/athletes.dao.js`: include `activity_level` in `findById`, `findBySeed`, `findByAuthUserId`, and `upsertProfile` payloads
- [x] T014 [P] Create `services/dataAccess/appConfig.dao.js`: `getOverridesFor(athleteId)` returning `engine_overrides` JSONB (empty `{}` if no row), `setOverridesFor(athleteId, overrides)` (Phase 1 has no caller besides tests)
- [x] T015 [P] Create `services/dataAccess/calculationResults.dao.js`: `insert(row)` (append-only), `listForAthlete({ athleteId, calculator?, limit })`
- [x] T016 [P] Create `services/dataAccess/generatedPrograms.dao.js`: `findActiveForAthlete(athleteId)`, `listHistoryForAthlete(athleteId, { limit })`, `archiveAndInsert(athleteId, newPayload, engineMeta)` — wraps the soft-archive update + insert in a single transaction (use `rpc` or sequential calls per Phase 0 DAO style)

### Audit-log writer + program generator extension

- [x] T017 Create `services/engine/auditWriter.js` exporting `writeAudit({ daos, athleteId, calculator, inputs, outputs, resolvedConstants, engineVersion, producedRecord? })` that calls `calculationResults.dao.insert(...)`. Single helper used by every persisted-write code path
- [x] T018 Extend `services/programGenerator.js`: read `activity_level` and merge it into the profile, call `resolveConstants(override)` from `appConfig.dao` (when caller provides a daos bag), include `engine_version` and `resolved_constants` in the returned object so DAOs can persist them. The pure function still takes a profile + constants; only the orchestration changes

### Seed extension

- [x] T019 Update `seed/athlete.seed.js` to add `activity_level: 'moderately_active'` (matches the new column default; explicit for clarity)
- [x] T020 Update `seed/runSeed.js` so that after the existing catalogue + per-meal seeds, it computes the program via `programGenerator.generateProgram(profileWithConstants)` and calls `generatedPrograms.dao.archiveAndInsert(...)` to write the initial active program row, plus a matching `calculation_results` audit entry via `writeAudit` with `calculator: 'program_generate'`. The runner remains idempotent: re-running detects the existing active row, archives it, writes a new identical one (deterministic engine ⇒ same payload)
- [x] T021 Run `npm run seed` and verify (via curl or Studio) that `generated_programs` has exactly one row with `is_active = true` for the seeded athlete

### Input validation (FR-022 / FR-030 / SC-010)

- [x] T021a Create `services/engine/inputSchemas.js` exporting one Zod schema per calculator (`bmrSchema`, `tdeeSchema`, `macrosSchema`, `oneRepMaxSchema`, `bodyCompositionSchema`) covering the plausibility ranges from research.md §9 (waist 50–200 cm, neck 25–60 cm, hip 60–200 cm, weight 30–250 kg, height 100–250 cm, age 10–100 years, reps 1–30, weight_kg ≥ 1) plus enum constraints (biological_sex, activity_level, morphotype, goal). Export a `validate(schema, body)` helper that throws an `HttpError(422, 'OUT_OF_RANGE', message, { field })` on failure so the canonical error envelope from Phase 0 carries the offending field name. Used by every `/api/v1/calculators/*` route, the `/api/v1/one-rep-max-records` POST, and the `/api/v1/body-measurements` POST. Unit-tested in `tests/unit/engine.inputSchemas.test.js` (out-of-range + enum + missing-required cases for each schema)

**Checkpoint**: `GET /api/v1/athlete/me` still returns the seeded athlete (Phase 0 behaviour intact); the cloud DB carries the four new schema objects; the engine resolver passes its unit tests; an active program row exists ready for US1's read; the input-schema module exists and is unit-tested green.

---

## Phase 3: User Story 1 — Personalized Daily Nutrition Targets (Priority: P1) 🎯 MVP

**Goal**: From the athlete profile alone, the system computes BMR, TDEE, daily kcal, and protein/carbs/fat grams, persists them inside the active program, and exposes them via `GET /api/v1/nutrition/targets` and a read-only Nutrition view in the React frontend.

**Independent Test**: Update the seeded athlete's profile (e.g. weight 60 kg). Hit `POST /api/v1/program/regenerate`. Hit `GET /api/v1/nutrition/targets` — the four numbers (kcal, protein g, carbs g, fat g) reflect the new weight and satisfy the documented constraints (protein floor, fat ≥ 25 % of kcal, ectomorph carb skew, sum-within-±2 %). Open `http://localhost:5173/nutrition` — the Nutrition view renders the same four numbers without recomputing client-side.

### TDD tasks — calculator pure functions (Principle V) ⚠️

> **MUST be written first and assert RED before T025–T027.**

- [x] T022 [P] [US1] Write unit tests `tests/unit/engine.bmr.test.js`: Mifflin–St Jeor for both biological sexes; integer-rounded kcal; rejects non-numeric inputs; pure (no side effects)
- [x] T023 [P] [US1] Write unit tests `tests/unit/engine.tdee.test.js`: each of the five activity levels multiplies BMR by the documented factor (1.2 / 1.375 / 1.55 / 1.725 / 1.9); rejects unknown level
- [x] T024 [P] [US1] Write unit tests `tests/unit/engine.macros.test.js`: protein floor ≥ `protein_g_per_kg_lbm × LBM`; fat ≥ 25 % of kcal; ectomorph carb skew (>50 % of kcal); endomorph fat skew; mesomorph balanced; macro grams sum to within ±2 % of daily kcal; bulk surplus, cut deficit, maintain branches; deterministic across calls

### Implementation — calculator pure functions

- [x] T025 [P] [US1] Implement `services/engine/bmr.js` exporting `bmr({ weight_kg, height_cm, age, biological_sex })`; passes T022; no Supabase, no env, no `Date.now()`
- [x] T026 [P] [US1] Implement `services/engine/tdee.js` exporting `tdee({ bmr_kcal, activity_level, constants })` reading `constants.activity_factors`; passes T023
- [x] T027 [P] [US1] Implement `services/engine/macros.js` exporting `macros({ daily_kcal, lean_body_mass_kg, morphotype, constants })`; passes T024

### Ad-hoc calculator endpoints (also serve US6)

- [x] T028 [P] [US1] Create `controllers/calculators.controller.js` with `bmr`, `tdee`, `macros` handlers (request → `validate(schema, req.body)` from T021a → engine call → response). NO writes to `calculation_results` per FR-029. Each handler returns 422 with `OUT_OF_RANGE` envelope on validation failure
- [x] T029 [P] [US1] Create `routes/calculators.routes.js` mounting `POST /bmr`, `/tdee`, `/macros` (the 1RM and body-composition routes are added in US2 and US5)
- [x] T030 [US1] Wire `routes/calculators.routes.js` under `/api/v1/calculators` in `app.js`; add a contract assertion in `tests/contract/api.v1.test.js` that the three POST paths return `200` with the expected `{ data: {...} }` shape

### Active-program read endpoints

- [x] T031 [P] [US1] Create `controllers/program.controller.js` with `getActive(req, res, next)` calling `generatedPrograms.dao.findActiveForAthlete(req.athleteId)`; returns `404 NOT_FOUND` envelope when no row exists
- [x] T032 [P] [US1] Create `routes/program.routes.js` exposing `GET /` (delegates to `getActive`); `POST /regenerate` and `GET /history` are added in US4
- [x] T033 [US1] Wire `routes/program.routes.js` under `/api/v1/program` in `app.js`
- [x] T034 [P] [US1] Extend `controllers/nutrition.controller.js`: add `getTargets(req, res, next)` that reads `generatedPrograms.dao.findActiveForAthlete` and returns `data: { tdee_kcal, daily_kcal, macros }` from the program payload. NO recomputation
- [x] T035 [US1] Extend `routes/nutrition.routes.js`: add `GET /targets` (handler from T034). Existing `GET /template` is unchanged

### Story-level integration test

- [x] T036 [US1] Add `tests/integration/nutrition.targets.test.js`: seeds athlete (Phase 0 path), hits `GET /api/v1/nutrition/targets`, asserts the four documented constraints (protein floor, fat ≥ 25 %, sum within ±2 %, ectomorph carb skew); skips gracefully when `.env` / Supabase is unreachable using the Phase 0 pattern

### Frontend Nutrition view

- [x] T037 [P] [US1] Create `frontend/src/components/ResultCard.jsx` (a Tailwind-tokenized result-display primitive; reused by US6 calculators)
- [x] T038 [P] [US1] Create `frontend/src/pages/NutritionHome.jsx`: fetches `/api/v1/nutrition/targets`, renders the four numbers in `<ResultCard>` instances with Tailwind tokens only; accessible heading; loading + error states
- [x] T039 [US1] Update `frontend/src/App.jsx` to wrap routes in `BrowserRouter` and add a `<Route path="/nutrition" element={<NutritionHome />} />`; keep `/` pointing at `ScaffoldHome`
- [x] T040 [P] [US1] Add `tests/frontend/nutritionView.test.jsx`: mocks `fetch` for `/api/v1/nutrition/targets`, renders `NutritionHome`, asserts the four numbers appear and no recomputation is performed client-side

**Checkpoint**: US1 demoable end-to-end. `GET /api/v1/nutrition/targets` returns the seeded athlete's persisted targets; the Nutrition view at `http://localhost:5173/nutrition` renders them; all engine pure-function unit tests pass green.

---

## Phase 4: User Story 2 — Trustworthy Working-Weight Recommendation (Priority: P1)

**Goal**: From a single (weight, reps) input on a named exercise, the engine produces an estimated 1RM (averaged across Epley / Brzycki / Lander / Lombardi), exposes the four individual values, and produces a 60 %–90 % percentage table with rep ranges. Persisted records are athlete- and exercise-scoped and timestamped.

**Independent Test**: `POST /api/v1/calculators/one-rep-max { weight_kg: 80, reps: 5 }` returns the primary estimate, the four individual values, and the percentage table — no DB write. Then `POST /api/v1/one-rep-max-records { exercise_id: <bench-press>, weight_kg: 80, reps: 5 }` returns the same shape AND writes one row to `one_rep_max_records` plus one row to `calculation_results`. `POST` with `reps: 12` returns `reduced_confidence: true`. `POST` with `reps: 1` returns `primary_estimate_kg === source_weight_kg`.

### TDD tasks ⚠️

- [x] T041 [P] [US2] Write unit tests `tests/unit/engine.oneRepMax.test.js`: each of Epley / Brzycki / Lander / Lombardi for known reference values; primary = average of the four; `reps = 1 ⇒ primary === weight`; `reps > 10 ⇒ reduced_confidence: true`; percentage table contains exactly six rows (60/70/75/80/85/90), monotonically decreasing in `load_kg` as `pct` decreases NO — increasing in `load_kg` as `pct` increases; rep ranges per the table in research.md §8

### Implementation

- [x] T042 [US2] Implement `services/engine/oneRepMax.js` exporting `oneRepMax({ weight_kg, reps, constants })`; passes T041

### Migration + DAO

- [x] T043 [P] [US2] Migration `supabase/migrations/20260507000004_init_one_rep_max_records.sql` — table + index `(athlete_id, exercise_id, created_at desc)` + RLS pair per data-model.md §3
- [x] T044 [US2] Apply migration to cloud (`supabase db push`); verify in Studio
- [x] T045 [P] [US2] Create `services/dataAccess/oneRepMaxRecords.dao.js`: `insert(row)`, `listForAthlete({ athleteId, exerciseId? })`, `latestForAthletePerExercise(athleteId)` (returns at most one row per exercise via window function or grouped query)

### Routes / controllers

- [x] T046 [US2] Extend `controllers/calculators.controller.js`: add `oneRepMax(req, res, next)` ad-hoc handler (no persistence). Validate body with `oneRepMaxSchema` from T021a; reject `reps = 0` and `weight_kg = 0` with `OUT_OF_RANGE`
- [x] T047 [US2] Extend `routes/calculators.routes.js`: add `POST /one-rep-max`
- [x] T048 [P] [US2] Create `controllers/oneRepMaxRecords.controller.js`: `create` (validates body with `oneRepMaxSchema` + `exercise_id` extension from T021a, calls engine + DAO + `writeAudit`), `list`, `latest`
- [x] T049 [P] [US2] Create `routes/oneRepMaxRecords.routes.js`: `POST /`, `GET /`, `GET /latest`
- [x] T050 [US2] Wire `routes/oneRepMaxRecords.routes.js` under `/api/v1/one-rep-max-records` in `app.js`

### Story-level integration test

- [x] T051 [US2] Add `tests/integration/oneRepMaxRecords.persist.test.js`: posts a record, asserts the row is in `one_rep_max_records`, asserts a matching `calculation_results` row was written with `calculator: 'one_rep_max'`, asserts `produced_record_kind = 'one_rep_max_records'` and `produced_record_id` is the inserted row's id

**Checkpoint**: US2 works end-to-end. Both ad-hoc and persisted 1RM endpoints respond correctly; reduced-confidence indicator fires at `reps > 10`; audit log captures persisted runs only.

---

## Phase 5: User Story 3 — Automatic Progression Decisions (Priority: P2)

**Goal**: Given a sequence of saved sessions for one exercise (or a week of sessions for one muscle group), the rule engine emits exactly one active flag per scope from {`add_load`, `maintain`, `stagnation`, `regression`, `deload_suggested`}, supersedes prior flags, and persists each evaluation in the audit log.

**Independent Test**: Insert two synthetic `session_journal_entries` + `session_sets` rows for `bench-press` where every set hit the top of the prescribed rep range. `POST /api/v1/progression-flags/evaluate`. `GET /api/v1/progression-flags` returns exactly one row with `flag_type: 'add_load'`, `scope_kind: 'exercise'`, `scope_ref: '<bench-press-id>'`. Re-run evaluate with no new sessions → DAO is a no-op (history endpoint shows still one row, no second insert). Insert three flat-volume weeks for `chest_triceps` and re-evaluate → flag becomes `stagnation` for that muscle group; the prior `add_load` for bench-press is now `is_active = false`.

### TDD tasks ⚠️

- [x] T052 [P] [US3] Write unit tests `tests/unit/progressionEngine.test.js`: double progression positive (top of range × 2 sessions), double progression negative (one session short, one rep short), stagnation 3-week (synthetic volume rows), regression 2-week (load drop), deload by RPE ≥ 9 (synthetic RPE coverage ≥ 60 %), deload by 2+ regressions in the week, insufficient-history suppression (1 session, 2 weeks of volume, RPE coverage < 60 %), idempotent same-input ⇒ same-output

### Implementation

- [x] T053 [US3] Implement `services/progressionEngine.js` exporting `evaluateForAthlete({ sessions, sets, weeklyPlan, constants, now })`; passes T052; pure function — accepts time as a parameter

### Migration + DAO

- [x] T054 [P] [US3] Migration `supabase/migrations/20260507000003_init_progression_flags.sql` — table + indexes (partial-unique `(athlete_id, scope_kind, scope_ref) where is_active = true`, plus `(athlete_id, created_at desc)`) + RLS pair per data-model.md §2
- [x] T055 [US3] Apply migration to cloud (`supabase db push`); verify
- [x] T056 [P] [US3] Create `services/dataAccess/progressionFlags.dao.js`: `findActiveForAthlete(athleteId)`, `listHistoryForAthlete(athleteId, { limit })`, `supersedeAndInsert(scope, candidateOrNull)` — handles the three branches from research.md §4 (no-op same flag, supersede + insert different flag, supersede with no replacement when candidate is null)

### Routes / controllers

- [x] T057 [P] [US3] Create `controllers/progressionFlags.controller.js`: `listActive`, `listHistory`, `evaluate` (reads sessions/sets from existing Phase 0 DAOs, calls engine, calls `progressionFlags.dao.supersedeAndInsert` per scope, writes one `calculation_results` row per scope evaluated via `writeAudit` with `calculator: 'progression_eval'`)
- [x] T058 [P] [US3] Create `routes/progressionFlags.routes.js`: `GET /`, `GET /history`, `POST /evaluate`
- [x] T059 [US3] Wire `routes/progressionFlags.routes.js` under `/api/v1/progression-flags` in `app.js`

### Story-level integration test

- [x] T060 [US3] Add `tests/integration/progression.flags.lifecycle.test.js`: seeds two sessions hitting top-of-range → evaluate → `add_load` flag exists; insert flat-volume rows → evaluate again → `stagnation` for muscle group, prior `add_load` is `is_active = false`, history endpoint returns both; re-evaluate with no new data → DAO is a no-op (no new rows)

### Month-over-month 1RM trend (FR-017)

- [x] T060a [P] [US3] Write unit tests `tests/unit/engine.oneRepMaxTrend.test.js`: given a synthetic history of `one_rep_max_records` for one exercise spanning ≥ 30 days, assert `oneRepMaxTrend({ records, now })` returns `{ delta_pct, on_pace }` where `delta_pct` is `(latest − one_month_ago) / one_month_ago × 100` rounded to one decimal, and `on_pace` is `true` when `delta_pct >= goal_threshold` (default `2 % per month` from `constants.on_pace_pct_per_month`); covers insufficient history (no record older than 25 days) returning `{ delta_pct: null, on_pace: null }`; deterministic; takes `now` as a parameter
- [x] T060b [US3] Implement `services/engine/oneRepMaxTrend.js` exporting `oneRepMaxTrend({ records, now, constants })`; passes T060a; pure function. Add `on_pace_pct_per_month` (default `2`) to `services/engine/constants.js` `DEFAULTS`
- [x] T060c [US3] Extend `controllers/oneRepMaxRecords.controller.js` with `trend(req, res, next)` that reads `oneRepMaxRecords.dao.listForAthlete({ athleteId, exerciseId? })`, calls `oneRepMaxTrend({ records, now: new Date(), constants })`, returns `{ data: [{ exercise_id, primary_estimate_kg, delta_pct, on_pace }, …] }`. Extend `routes/oneRepMaxRecords.routes.js` with `GET /trend?exercise_id=…` (omitted = all exercises with ≥ 1 record). Update `contracts/openapi.yaml` to document the new path

**Checkpoint**: US3 verified — flag supersession, scope handling, idempotent re-eval, audit-log writes, and per-exercise month-over-month trend with on-pace/off-pace indicator all behave per spec.

---

## Phase 6: User Story 4 — One-Action Program Generation (Priority: P2)

**Goal**: From a complete athlete profile, `POST /api/v1/program/regenerate` returns a coherent program (training + nutrition + supplements + recovery) and soft-archives the prior active row. Profile updates that affect output trigger regeneration; updates that don't affect output (display name) leave the program untouched.

**Independent Test**: Note the active program's `id` and `daily_kcal`. `PATCH /api/v1/athlete/me { goal: 'cut' }` (or hit `POST /api/v1/program/regenerate` directly). `GET /api/v1/program` returns a new row with a different `id`, `is_active: true`, and a `daily_kcal` that reflects the deficit branch. `GET /api/v1/program/history` lists both rows; the prior row has `is_active: false` and `superseded_at` set. `PATCH /api/v1/athlete/me { display_name: 'New Name' }` does NOT change the active program's id.

### Program-generator tests (extends Phase 0 test file)

- [x] T061 [P] [US4] Extend `tests/unit/programGenerator.test.js`: same-profile twice ⇒ identical output (already in Phase 0; reaffirm); different goal ⇒ different daily_kcal but same training split structure for the same weekly_session_count; output carries `engine_version` and `resolved_constants`
- [x] T062 [P] [US4] Add `tests/unit/programGenerator.fixtures.test.js`: 50 representative profiles (vary age/sex/morphotype/goal/activity/sessions) × constraint set (protein floor, fat floor, macro-sum ±2 %, percentage-table monotonicity, no negative values) — covers SC-009

### Routes / controllers — regenerate + history

- [x] T063 [US4] Extend `controllers/program.controller.js`: add `regenerate(req, res, next)` (reads athlete profile, calls `programGenerator.generateProgram(profile, resolvedConstants)`, calls `generatedPrograms.dao.archiveAndInsert`, writes `calculation_results` audit row with `calculator: 'program_generate'`); add `listHistory`
- [x] T064 [US4] Extend `routes/program.routes.js`: add `POST /regenerate`, `GET /history`

### Conditional regenerate on profile change

- [x] T065 [US4] Extend `controllers/athlete.controller.js`: add `patchMe(req, res, next)` accepting `weight`, `height`, `age`, `morphotype`, `goal`, `activity_level`, `weekly_session_count`, `available_equipment`, `injuries`, `display_name`, `theme`. Determine the dirty set; if any field in `OUTPUT_AFFECTING_FIELDS = [weight, height, age, morphotype, goal, activity_level, weekly_session_count, available_equipment, injuries]` changed, call the regenerate flow after the profile UPDATE. If only non-output fields changed, skip regeneration. Returns the updated profile and (when applicable) the new program id
- [x] T066 [US4] Extend `routes/athlete.routes.js`: add `PATCH /me` route bound to `patchMe`

### Story-level integration tests

- [x] T067 [US4] Add `tests/integration/program.regenerate.test.js`: POST /program/regenerate twice; assert (a) two rows total, (b) at most one row with `is_active = true`, (c) the prior row's `superseded_at` is non-null, (d) the new payload's `daily_kcal` matches what `programGenerator.generateProgram` returns for the same profile, (e) one `calculation_results` row per regenerate
- [x] T068 [US4] Add `tests/integration/program.profileTrigger.test.js`: PATCH `/me { goal: 'cut' }` → active program id changes, payload reflects cut deficit; PATCH `/me { display_name: 'X' }` → active program id unchanged; PATCH `/me { weight: 60 }` → active program id changes, BMR/TDEE/macros recompute

**Checkpoint**: US4 demoable. Regeneration soft-archives correctly; output-affecting fields trigger; non-affecting fields don't.

---

## Phase 7: User Story 5 — Body Composition Refines Targets (Priority: P3)

**Goal**: When a body-weight or body-measurement entry is saved, the engine computes body-fat % (US Navy when waist+neck present; BMI fallback otherwise), updates lean body mass, and refreshes the protein target on the active program. The athlete does nothing beyond logging the entry.

**Independent Test**: With waist + neck on the seeded athlete, `POST /api/v1/body-measurements { weight_kg: 60, waist_cm: 70, neck_cm: 35, measured_on: '2026-05-08' }`. `GET /api/v1/body-composition/latest` returns a row with `method: 'us_navy'` and a body-fat % within plausible range. `GET /api/v1/nutrition/targets` reflects the new lean body mass in the protein number. With only weight (no neck or waist), the same flow runs but `method: 'bmi_fallback'`. Out-of-range inputs (`weight_kg: 580`) return a 422 with `code: 'OUT_OF_RANGE'` and don't change persisted targets.

### TDD tasks ⚠️

- [x] T069 [P] [US5] Write unit tests `tests/unit/engine.bodyComposition.test.js`: US Navy formula for male and female reference inputs (matches published values within ±0.5 %); BMI fallback when neck or waist is null; rejects out-of-range inputs with `OUT_OF_RANGE`; lean body mass = weight × (1 − bf%/100); deterministic across calls

### Implementation

- [x] T070 [US5] Implement `services/engine/bodyComposition.js` exporting `bodyComposition({ weight_kg, height_cm, age, biological_sex, waist_cm?, neck_cm?, hip_cm? })`; passes T069

### Migration + DAO

- [x] T071 [P] [US5] Migration `supabase/migrations/20260507000005_init_body_composition_results.sql` — table + index `(athlete_id, created_at desc)` + RLS pair per data-model.md §4
- [x] T072 [US5] Apply migration to cloud; verify
- [x] T073 [P] [US5] Create `services/dataAccess/bodyComposition.dao.js`: `insert(row)`, `latestForAthlete(athleteId)`, `listForAthlete(athleteId, { limit })`

### Routes / controllers

- [x] T074 [US5] Extend `controllers/calculators.controller.js`: add `bodyComposition(req, res, next)` ad-hoc handler (no persistence). Validate body with `bodyCompositionSchema` from T021a
- [x] T075 [US5] Extend `routes/calculators.routes.js`: add `POST /body-composition`
- [x] T076 [P] [US5] Create `controllers/bodyComposition.controller.js`: `list`, `latest` (read endpoints only — writes happen via the body-measurements trigger below)
- [x] T077 [P] [US5] Create `routes/bodyComposition.routes.js`: `GET /`, `GET /latest`
- [x] T078 [US5] Wire `routes/bodyComposition.routes.js` under `/api/v1/body-composition` in `app.js`

### Auto-trigger on body-measurement save

- [x] T079 [US5] Create `controllers/bodyMeasurements.controller.js` (Phase 0 has the table but no HTTP surface) with `create(req, res, next)` that: validates the body using a `bodyMeasurementSchema` added in T021a (or a shared variant of `bodyCompositionSchema`), inserts the measurement, runs `bodyComposition` engine, inserts a `body_composition_results` row, calls the program-regenerate flow (US4) so the protein target picks up the new LBM, writes `calculation_results` audit rows for both `body_composition` and the resulting `program_generate`
- [x] T080 [US5] Create `routes/bodyMeasurements.routes.js` with `POST /` and wire under `/api/v1/body-measurements` in `app.js`

### Story-level integration test

- [x] T081 [US5] Add `tests/integration/bodyComposition.refresh.test.js`: posts a body-measurement with waist+neck → asserts a `body_composition_results` row exists with `method: 'us_navy'`, then asserts `GET /api/v1/nutrition/targets` returns a different protein number than before; posts a body-measurement without neck → method is `bmi_fallback`; posts an out-of-range weight → 422 + active program unchanged

**Checkpoint**: US5 verified. Body composition refines targets automatically without athlete action; the audit log shows the cascading writes; out-of-range inputs are rejected.

---

## Phase 8: User Story 6 — Manual Calculator Surface (Priority: P3)

**Goal**: A navigable Calculators page in the React frontend lets the athlete run any single calculator (BMR, TDEE, macros, 1RM, body composition) on ad-hoc inputs and see the result on the same page. The forms POST to the existing `/api/v1/calculators/*` endpoints from US1, US2, US5 — no new backend work. The page does not modify any persisted state.

**Independent Test**: Open `http://localhost:5173/calculators`, click "BMR", enter the seeded athlete's profile values, submit. Result appears on the page. Hit `GET /api/v1/program` and `GET /api/v1/nutrition/targets` — neither has changed. Repeat for the other four calculators.

### Frontend pages (no backend tasks — all routes already exist)

- [x] T082 [P] [US6] Create `frontend/src/components/NumberField.jsx` (Tailwind-tokenized input wrapper with label + error state; reused by every calculator form)
- [x] T083 [P] [US6] Create `frontend/src/components/SelectField.jsx` (same shape as NumberField, for biological_sex / activity_level / morphotype / goal selects)
- [x] T084 [P] [US6] Extend `frontend/src/lib/api.js` with `apiPost(path, body)` mirroring the existing `apiGet` (returns parsed JSON; throws with status + body on non-2xx)
- [x] T085 [P] [US6] Create `frontend/src/pages/calculators/CalculatorsHome.jsx` — landing index with five `<Link>` cards routing to the sub-pages
- [x] T086 [P] [US6] Create `frontend/src/pages/calculators/BmrCalculator.jsx`: form (weight, height, age, biological_sex) → `apiPost('/api/v1/calculators/bmr', …)` → `<ResultCard>` with `bmr_kcal`
- [x] T087 [P] [US6] Create `frontend/src/pages/calculators/TdeeCalculator.jsx`: form (BMR inputs + activity_level) → `apiPost('/api/v1/calculators/tdee')` → `<ResultCard>` with `bmr_kcal` + `tdee_kcal`
- [x] T088 [P] [US6] Create `frontend/src/pages/calculators/MacrosCalculator.jsx`: full profile form → `apiPost('/api/v1/calculators/macros')` → `<ResultCard>` with `tdee_kcal`, `daily_kcal`, and the three macro grams
- [x] T089 [P] [US6] Create `frontend/src/pages/calculators/OneRepMaxCalculator.jsx`: weight + reps form → `apiPost('/api/v1/calculators/one-rep-max')` → `<ResultCard>` with the four formula values, primary, percentage table (responsive Tailwind grid), and reduced-confidence badge when present
- [x] T090 [P] [US6] Create `frontend/src/pages/calculators/BodyCompositionCalculator.jsx`: profile + optional waist/neck/hip form → `apiPost('/api/v1/calculators/body-composition')` → `<ResultCard>` with `method`, `body_fat_pct`, `lean_body_mass_kg`
- [x] T091 [US6] Update `frontend/src/App.jsx` to register the calculator routes: `/calculators` (CalculatorsHome) + sub-routes per calculator; update `frontend/src/pages/ScaffoldHome.jsx` with `<Link>`s to `/nutrition` and `/calculators` so the home page is a usable directory

### Frontend smoke tests

- [x] T092 [P] [US6] Add `tests/frontend/calculatorsPage.test.jsx`: mocks `fetch` for each `/api/v1/calculators/*` path; renders each sub-page; submits valid inputs; asserts a result card appears; asserts no profile/program endpoint was called

**Checkpoint**: US6 verified. Athlete can verify the engine's outputs end-to-end from the browser; persisted state is untouched.

---

## Phase 9: Polish & Cross-Cutting

- [x] T093 [P] Extend `services/dataAccess/types.js` with JSDoc typedefs for the 5 new typed tables and the audit row shape
- [x] T094 [P] Update `CLAUDE.md` Phase 1 section with the engine-version-bump policy from research.md §10 and the audit-log writer's expected call sites
- [x] T095 Run `quickstart.md` end-to-end against the cloud project: verify each Success Criterion (SC-001 → SC-010); record results in `specs/002-calculators-engine/validation.md`
- [x] T096 [P] Add a contract assertion in `tests/contract/api.v1.test.js` covering every Phase 1 path from `contracts/openapi.yaml` (program / nutrition/targets / 5 calculators / 1RM records / progression flags / body composition)
- [x] T097 Run the full test suite (`npm test` + `cd frontend && npx vitest run`) and confirm all backend + frontend tests pass against the cloud DB

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; can start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.** Must produce: engine constants + resolver, the 4 foundational migrations applied, the 4 foundational DAOs, the audit writer, the seed extension that writes an initial active program row.
- **US1 (Phase 3)**: depends on Foundational. MVP target. Produces the BMR/TDEE/macros engine, the ad-hoc calculator endpoints (also consumed later by US6), the read endpoints for the active program and nutrition targets, and the Nutrition view UI.
- **US2 (Phase 4)**: depends on Foundational and the audit writer (T017). Independent of US1's controllers/routes — only shares the `calculators.controller.js` file (so the extending tasks T046/T047 are sequential after US1's T028/T029).
- **US3 (Phase 5)**: depends on Foundational. Independent of US1/US2 except for the audit writer.
- **US4 (Phase 6)**: depends on Foundational + US1 (uses the same `program.routes.js` and the engine functions from US1). Tasks T063/T064 extend US1's files so are sequential after T031/T032.
- **US5 (Phase 7)**: depends on Foundational + US4 (calls the program-regenerate flow). Independent of US2/US3.
- **US6 (Phase 8)**: depends on US1 + US2 + US5 backend endpoints existing (the page calls them). Pure frontend work.
- **Polish (Phase 9)**: depends on every story shipping.

### Within Each User Story

- Strict TDD ONLY for the engine pure functions and the rule engine (Principle V): write the test, see it RED, implement, see it GREEN.
- Migrations before DAOs that read/write the new tables.
- DAOs before controllers before routes.
- Backend ready before the frontend smoke test runs.

### Parallel Opportunities

| Group                        | Tasks                          | Why parallel                                                  |
| ---------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Setup                        | T002, T003                     | Different directories.                                        |
| Foundational migrations      | T008, T009, T010, T011         | Different SQL files; lexical order is enforced by timestamps. |
| Foundational DAOs            | T013, T014, T015, T016         | Different files; no inter-DAO calls.                          |
| US1 engine TDD tests         | T022, T023, T024               | Different test files.                                         |
| US1 engine implementations   | T025, T026, T027               | Different files; each independent of the other.               |
| US1 controllers/routes       | T028 + T029, T031 + T032, T034 | Three independent controller/route pairs.                     |
| US1 frontend                 | T037, T038, T040               | Different files.                                              |
| US2 DAO + controller + route | T045, T048, T049               | Different files.                                              |
| US3 controller/route         | T057, T058                     | Different files.                                              |
| US4 program-generator tests  | T061, T062                     | Different test files.                                         |
| US5 routes/controllers       | T076, T077                     | Different files.                                              |
| US6 frontend pages           | T082–T090                      | Different files; landing page links to sub-pages.             |
| Polish                       | T093, T094, T096               | Different files.                                              |

---

## Parallel Example: US1 engine TDD pair

```bash
# Three engine pure functions can be authored in parallel by three contributors:
Task: "Write tests/unit/engine.bmr.test.js (RED) and implement services/engine/bmr.js"
Task: "Write tests/unit/engine.tdee.test.js (RED) and implement services/engine/tdee.js"
Task: "Write tests/unit/engine.macros.test.js (RED) and implement services/engine/macros.js"
```

Each pair lives in a separate file and shares only `services/engine/constants.js` (read-only). The Phase 0 vitest configuration picks the new test files up automatically.

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRITICAL — the migrations + engine resolver + audit writer + seed extension are required by every story).
3. Phase 3: US1 — daily nutrition targets visible on the Nutrition view.
4. **STOP and validate**: open `http://localhost:5173/nutrition`, see the seeded athlete's daily targets; run `npm test` (engine TDD must be green); the contract assertions cover the new endpoints.
5. Demoable.

### Incremental Delivery

1. Setup + Foundational → infrastructure ready (no new demo yet beyond Phase 0).
2. - US1 → MVP demo: Nutrition view renders the engine's primary output.
3. - US2 → 1RM endpoints + reduced-confidence indicator demoable via curl.
4. - US3 → progression flags can be triggered manually via `POST /api/v1/progression-flags/evaluate`.
5. - US4 → profile changes regenerate the program automatically; history is queryable.
6. - US5 → body-measurement save updates the protein target in the same Nutrition view.
7. - US6 → Calculators page available in the browser; entire engine surface explorable.
8. - Polish → 50-profile fixture suite, validation report, doc updates.

### Parallel Team Strategy

After Phase 2 completes, three contributors can split:

- **A**: US1 (engine pure functions + Nutrition view + read endpoints).
- **B**: US2 (1RM engine + records persistence) and then US3 (progression engine + flags).
- **C**: US4 (program generator extension + regenerate flow) and then US5 (body composition) and then US6 (Calculators page).

US6 is the natural last task because it consumes the endpoints from US1, US2, and US5.

---

## Notes

- `[P]` tasks touch different files and have no incomplete dependencies. If a file appears in two task IDs, those tasks are sequential.
- `[Story]` labels enable per-story traceability against `spec.md` user stories and `data-model.md` tables.
- Constitution v1.1.1 governs every task; in particular: pure functions in `services/engine/` and `services/progressionEngine.js` MUST NOT import `@supabase/supabase-js`; only `services/dataAccess/*` may. No `password_hash` column anywhere. No legacy `anon`/`service_role` key references.
- Engine version bumps follow research.md §10: PATCH for rounding fixes, MINOR for new calculators or new optional inputs, MAJOR for output-shape changes or default-value changes. Bump in the same commit as the change.
- Commit cadence: one commit per logical group (e.g. all foundational migrations together is OK; bundle a DAO with its controller and route only when they're trivial wrappers; engine pure function + its test in one commit).
- Stop at any checkpoint to demo or hand off — every checkpoint corresponds to a working slice.
