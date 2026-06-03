---
description: 'Phase 7 — Nutrition & Calories implementation tasks'
---

# Tasks: Phase 7 — Nutrition & Calories

**Input**: Design documents from `/specs/010-phase7-nutrition-calories/`
**Prerequisites**: plan.md, spec.md (clarified 2026-06-03), research.md (D-1…D-12), data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: INCLUDED. Constitution V (NON-NEGOTIABLE) requires test-first for every number-producing function; the plan's Testing section enumerates unit + contract + integration + frontend-smoke suites. Pure-function unit tests are written **red → green → refactor**.

**Organization**: Grouped by user story (US1 P1, US2 P2, US3 P2, US4 P3) so each can be implemented and verified independently.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 / US4 (Setup / Foundational / Polish carry no story label)
- Every task names exact file paths.

---

## Executing with ultracode (workflows + xhigh effort)

This list is authored for **ultracode** execution (multi-agent `Workflow` orchestration at xhigh reasoning effort). Guidance for the implementing agent:

- **Phase boundaries are barriers.** Run Setup → Foundational sequentially (each blocks the next). Foundational MUST finish before any user story starts.
- **Within a phase, fan out the `[P]` tasks** as parallel workflow agents (one agent per task, each owning distinct files). Tasks without `[P]` in the same phase touch a shared file (e.g. `app.js`, `config/schema.js`, `routes/nutrition.routes.js`, `controllers/nutrition.controller.js`, `frontend/src/lib/nutritionApi.js`, `frontend/src/App.jsx`) and MUST run sequentially.
- **TDD ordering inside a story is a hard barrier**: author the `[P]` unit tests for that story's pure functions and confirm RED, then implement to GREEN. Do not parallelize a test task with the implementation it covers.
- **Pipeline the user stories**: US1 is the MVP. US2/US3/US4 each depend only on Foundational and are independently testable, so they can pipeline once US1's shared edits to `nutrition.controller.js` / `nutrition.routes.js` / `App.jsx` land (those three files are the only cross-story contention points — see Dependencies).
- **Verify each checkpoint** with the named test commands before advancing. Use adversarial verification on the macro-snapshot stability (SC-008), the load-plan non-destructive guarantee (FR-011), and tenant isolation (SC-010).
- **Migrations are cloud Supabase** — apply via the project's migration path; live contract/integration tests probe for `nutrition_logs` and skip until applied.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration and environment scaffolding (no new dependencies — Phase 0–6 stack is reused).

- [X] T001 Review `plan.md`, `data-model.md`, and `contracts/openapi.yaml`; confirm no new npm dependency is required and that `tests/{unit,contract,integration,frontend}/` exist.
- [X] T002 [P] Add Phase 7 config keys to `config/schema.js`: `HYDRATION_GOAL_ML` (intFromString default `3000`), `NUTRITION_TREND_DAYS` (intFromString default `30`), `NUTRITION_LOCALE` (string default `'fr-FR'`). Do not add to `REQUIRED_KEYS` or `SECRET_KEYS`.
- [X] T003 [P] Document the three new keys (with defaults + one-line purpose) in `.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The cross-cutting persistence, data-access, pure math, and wiring that US1/US2/US4 all build on. **No user story may start until this phase is green.**

**⚠️ CRITICAL**: `nutrition_logs`, `nutritionLogs.dao`, `nutritionMath`, `foodSlug`, the `foods` write path, hydration read, and the frontend API/route scaffolding are shared by multiple stories.

### Migration & data access

- [X] T004 Author migration `supabase/migrations/20260603000001_init_nutrition_logs.sql`: create `public.nutrition_logs` per `data-model.md` (id, athlete_id FK cascade, logged_on date, slot text + CHECK in the 5 slots, food_id bigint FK→foods ON DELETE RESTRICT, food_name text, quantity_g numeric(7,2), kcal/protein_g/carbs_g/fat_g numeric snapshots, created_at); index `(athlete_id, logged_on)`; ship `nutrition_logs_select_own` + `nutrition_logs_modify_own` RLS in-file (project pattern).
- [X] T005 [P] Create `services/dataAccess/nutritionLogs.dao.js` (factory `nutritionLogsDao(supabase)`): `insert(row)`, `listForDay(athleteId, loggedOn)`, `listRange(athleteId,{from,to})`, `findById(athleteId,id)`, `update(athleteId,id,fields)`, `delete(athleteId,id)`, `deleteForDay(athleteId,loggedOn)` — all `athlete_id`-scoped, `HttpError(500,'DB_ERROR')` mapping, not-found → `HttpError(404,'NOT_FOUND')`.
- [X] T006 [P] Create `services/dataAccess/hydration.dao.js` (factory `hydrationDao(supabase)`): `getForDay(athleteId,loggedOn)` (returns row or `{total_ml:0}`), `upsertDelta(athleteId,loggedOn,deltaMl)` (upsert on `(athlete_id,logged_on)`, increment, clamp result ≥ 0), `listRange(athleteId,{from,to})`. (Table created in US3 T039; the module is authored here so `app.js` wiring is safe.)
- [X] T007 [P] Extend `services/dataAccess/foods.dao.js`: add `createForAthlete({athleteId,name,kcalPer100g,proteinPer100g,carbsPer100g,fatPer100g,locale,category='custom'})` (upsert on `athlete_id,slug,locale` using slug from `foodSlug.slugify`), `findById(athleteId,id)`, and an optional `q` case-insensitive name filter to `list(...)`. Keep existing `list`/`upsertMany`.

### Pure helpers (test-first — Constitution V)

- [X] T008 [P] Write FAILING unit test `tests/unit/foodSlug.test.js` for `slugify(name)`: lowercase, accent-strip (`Poêlée → poelee`), non-alnum → single hyphen, trim hyphens, idempotent, duplicate names → identical slug (FR-002a reconciliation).
- [X] T009 [P] Implement `services/nutrition/foodSlug.js` `slugify(name)` to pass T008 (pure, deterministic, no globals).
- [X] T010 [P] Write FAILING unit test `tests/unit/nutritionMath.test.js` for `entryMacros({food,quantityG})` (per-100g × qty/100, rounding), `dayTotals(entries)` (sum), `progress(totals,targets)` (value/target/pct, state under|at|over, null-safe target → graceful).
- [X] T011 [P] Implement `services/engine/nutritionMath.js` (`entryMacros`, `dayTotals`, `progress`) to pass T010 (pure; no `Date.now`/I/O).
- [X] T011A [P] Extract athlete daily-target resolution into a shared module `services/nutrition/targets.js` exporting `resolveTargets({ daos, athleteId })` → `{ daily_kcal, daily_protein_g, daily_carbs_g, daily_fat_g, source }`. Move the existing private implementation out of `controllers/nutritionTargets.controller.js` and have that controller import it (no behavior change). Module receives `daos` (no `@supabase/supabase-js` import — Constitution II). Single source of truth for FR-008, consumed by `nutritionTargets.controller`, `nutrition.controller.getDay`, and `nutrition.controller.getTrends`.

### Wiring & frontend scaffold

- [X] T012 Wire `app.js`: import `nutritionLogsDao` + `hydrationDao`; add `nutritionLogs: nutritionLogsDao(sb)` and `hydration: hydrationDao(sb)` to `resolved`. (Shared file — sequential; US3 T041 also edits `app.js` only if needed, otherwise reuses this wiring.)
- [X] T013 [P] Create `frontend/src/lib/nutritionApi.js` with thin wrappers over `lib/api.js`: `getDay(date)`, `logEntry(body)`, `editEntry(id,quantityG)`, `deleteEntry(id)`, `searchFoods({q,category})`, `createFood(body)`, `loadPlan(date,mode)`, `addHydration(date,deltaMl)`, `getTrends(date)`.
- [X] T014 Wire `frontend/src/App.jsx`: point `/nutrition` to a new `pages/nutrition/NutritionDay.jsx` and add `/nutrition/trends` → `pages/nutrition/NutritionTrends.jsx` (create minimal stub components now; fleshed in US1/US4). "Nutrition" nav item already exists. (Shared file — sequential.)

**Checkpoint**: `npm test -- tests/unit/foodSlug.test.js tests/unit/nutritionMath.test.js` green; app boots; routes resolve to stubs.

---

## Phase 3: User Story 1 — Log the day's food and watch the targets fill (Priority: P1) 🎯 MVP

**Goal**: The athlete searches foods (or creates a custom one), logs gram portions into the five meal slots, and sees four live progress bars and per-meal subtotals against stored targets.

**Independent Test**: Log two foods across two slots (one catalogue, one custom); `GET /nutrition/day` totals = sum of entries and bars reflect targets; edit a quantity and delete an entry → totals recompute; re-create the same custom food → no duplicate in `GET /foods`.

### Tests for User Story 1 (write first)

- [X] T015 [P] [US1] FAILING unit test `tests/unit/dayView.test.js` for `services/nutrition/dayView.js`: assembles slots (all 5 present, ordered) + per-slot subtotals + day totals + 4 bars + hydration passthrough; empty-day shape (zeros, bars with null/zero, no error, FR-009).
- [X] T016 [P] [US1] Contract test `tests/contract/nutritionDay.contract.test.js` covering `GET /nutrition/day`, `POST/PATCH/DELETE /nutrition/log`, `GET/POST /foods` against `contracts/openapi.yaml` (live-gated; **probe for `nutrition_logs`, skip if absent**).
- [X] T017 [P] [US1] Integration test `tests/integration/nutritionLog.integration.test.js`: log catalogue food + custom food → day totals; edit qty + delete → recompute; `quantity_g ≤ 0`/oversized → 400; future `logged_on` → 400; custom-food persists + is found by `GET /foods?q=`; duplicate custom name reconciles (no dup); **SC-008 stability: after logging an entry, edit the referenced catalogue food's reference macros (foods upsert) and assert the prior entry's stored `kcal/protein_g/carbs_g/fat_g` and the day total are unchanged**; RLS probe on `nutrition_logs`; cleans up by created ids.

### Implementation for User Story 1

- [X] T018 [US1] Implement `services/nutrition/dayView.js` (pure presenter) to pass T015: `build({ entries, targets, hydration })` → `{ date, slots[], totals, bars, hydration }` using `nutritionMath.dayTotals` + `progress`.
- [X] T019 [US1] Add a zod log schema + a `resolveToday`/future-date guard helper in `controllers/nutrition.controller.js` (or `services/engine/inputSchemas.js` if shared): slot enum, `quantity_g` > 0 and ≤ 5000, exactly one of `food_id`/`custom_food`, custom-food macro bounds (D-10).
- [X] T020 [US1] Extend `controllers/nutrition.controller.js`: `getDay` (resolve targets via the shared `services/nutrition/targets.js#resolveTargets({ daos, athleteId })` from T011A, read `nutritionLogs.listForDay` + `hydration.getForDay`, compose with `dayView`), `logEntry` (resolve/create food → `entryMacros` snapshot → `nutritionLogs.insert`), `editEntry` (`nutritionLogs.findById` → recompute snapshot → `update`), `deleteEntry`. No audit-log write (D-3).
- [X] T021 [US1] Extend `controllers/foods.controller.js`: `create` (custom food via `foods.dao.createForAthlete`, validate name + macro bounds → 400, stamp `locale` from `config.NUTRITION_LOCALE`). Add `q` and `locale` (default `config.NUTRITION_LOCALE`) passthrough to `list`.
- [X] T022 [US1] Extend `routes/nutrition.routes.js`: `GET /day`, `POST /log`, `PATCH /log/:id`, `DELETE /log/:id` (keep existing `/template`, `/targets`). (Shared file.)
- [X] T023 [US1] Extend `routes/foods.routes.js`: `POST /` (create custom food); ensure `GET /?q=` reaches the controller. (Shared file.)
- [X] T024 [US1] Build `frontend/src/pages/nutrition/NutritionDay.jsx`: four progress-bar header (calories/protein/carbs/fat vs targets, over-target distinct), five meal-slot cards with food search (debounced `searchFoods`), gram input + add, inline custom-food create on no-match, per-entry edit/remove, per-meal subtotals. Use Frontend Design skill + Tailwind tokens; respect existing units lib (nutrition values stay metric).
- [X] T025 [P] [US1] Frontend smoke test `tests/frontend/nutritionDay.test.jsx`: add a food → bars update from a stubbed API; custom-food path; empty state renders without error.

**Checkpoint**: US1 fully functional — `npm test -- tests/unit/dayView.test.js`, `tests/contract`, `tests/integration`, `npm run test:frontend` green for the day-log surface. **This is the MVP — stop & validate.**

---

## Phase 4: User Story 2 — Pre-fill the day from the program's meal plan (Priority: P2)

**Goal**: "Load daily plan" fills the five slots with the template's foods+grams; on a non-empty day it prompts replace-or-append; pre-filled entries behave like manual ones.

**Independent Test**: On an empty day, `POST /nutrition/load-plan` populates slots from the template and totals match; on a non-empty day, omitting `mode` → 409; `replace` swaps, `append` adds; every pre-filled entry is editable/removable.

### Tests for User Story 2 (write first)

- [X] T026 [P] [US2] Contract test `tests/contract/nutritionLoadPlan.contract.test.js` for `POST /nutrition/load-plan` (200 empty-day, 200 replace/append, 409 conflict, 400 bad mode) per the contract (live-gated).
- [X] T027 [P] [US2] Integration test `tests/integration/nutritionLoadPlan.integration.test.js`: empty day fills from seeded template items; non-empty + no mode → 409; `replace` clears then inserts; `append` adds on top; pre-filled entries editable/deletable; RLS probe on `nutrition_template_meal_items`; cleans up.

### Implementation for User Story 2

- [X] T028 [US2] Author migration `supabase/migrations/20260603000003_init_nutrition_template_meal_items.sql`: `public.nutrition_template_meal_items` (id, athlete_id FK cascade, slot text, food_id bigint FK→foods, quantity_g numeric(7,2), display_order int) + `*_own` RLS in-file.
- [X] T029 [P] [US2] Create `seed/nutritionTemplateItems.seed.json`: concrete catalogue foods (by slug) + grams + display_order per slot for the current athlete, chosen to roughly approximate each slot's macro targets.
- [X] T030 [US2] Extend `seed/runSeed.js`: idempotently insert `nutrition_template_meal_items` for the seeded athlete (resolve food slugs → ids; upsert/skip-on-exists). (Shared file.)
- [X] T031 [P] [US2] Extend `services/dataAccess/nutrition.dao.js`: `listTemplateItems(athleteId)` (join/lookup foods, ordered by slot + display_order).
- [X] T032 [US2] Extend `controllers/nutrition.controller.js`: `loadPlan` — read `nutrition.listTemplateItems`; if day has entries and no `mode` → `HttpError(409,'LOAD_PLAN_CONFLICT')`; `replace` → `nutritionLogs.deleteForDay` then insert; `append` → insert; snapshot each via `entryMacros`; return the composed `dayView`. Validate date (D-10). (Shared file — sequential after US1 T020.)
- [X] T033 [US2] Extend `routes/nutrition.routes.js`: `POST /load-plan`. (Shared file — sequential after US1 T022.)
- [X] T034 [US2] Extend `frontend/src/pages/nutrition/NutritionDay.jsx`: "Load daily plan" button; on 409, show a replace-or-append confirmation (calls `loadPlan(date,'replace'|'append')`); refresh the day view. (Shared file — sequential after US1 T024.)
- [X] T035 [P] [US2] Frontend smoke test `tests/frontend/nutritionLoadPlan.test.jsx`: empty-day load fills slots; non-empty triggers the replace/append prompt and dispatches the chosen mode (stubbed API).

**Checkpoint**: US1 + US2 both work independently; load-plan never silently overwrites (FR-011).

---

## Phase 5: User Story 3 — Track hydration toward the daily goal (Priority: P2)

**Goal**: Quick-add (+250/+500/+1000 ml) and undo against a 3 L (config-default, override-aware) goal, shown as a circular gauge that resets daily.

**Independent Test**: Quick-add several times → `GET /nutrition/day` `hydration.total_ml` accumulates and the gauge advances; undo reduces (never < 0); a new day starts at 0; goal reflects config / per-athlete override.

### Tests for User Story 3 (write first)

- [X] T036 [P] [US3] FAILING unit test `tests/unit/lib.chartGeometry.gauge.test.js` for the new `gaugeArc({value,max,...})` helper (arc endpoints, full/over-goal clamp) added to `frontend/src/lib/chartGeometry.js`.
- [X] T037 [P] [US3] Contract test `tests/contract/nutritionHydration.contract.test.js` for `POST /nutrition/hydration` (200 with `{total_ml,goal_ml}`, 400 bad date/delta) per contract (live-gated).
- [X] T038 [P] [US3] Integration test `tests/integration/nutritionHydration.integration.test.js`: add 250+500 → 750; undo −1000 clamps to 0; distinct day independent; goal = override ?? config default; RLS probe on `hydration_log`; cleans up.

### Implementation for User Story 3

- [X] T039 [US3] Author migration `supabase/migrations/20260603000002_init_hydration_log.sql`: `public.hydration_log` (athlete_id FK cascade, logged_on date, total_ml int default 0, updated_at, PRIMARY KEY (athlete_id, logged_on)) + `*_own` RLS in-file. **Pulled forward into the MVP + applied to cloud** — the US1 day view reads hydration at runtime, so the table is a US1 dependency. Remaining US3 work (hydration endpoint, gauge, smoke tests) is still open.
- [X] T040 [US3] Extend `controllers/nutrition.controller.js`: `addHydration` (validate date + bounded `delta_ml`; `hydration.upsertDelta` clamp ≥ 0; resolve `goal_ml` = `appConfig` `engine_overrides.hydration.goal_ml ?? config.HYDRATION_GOAL_ML`; return `{total_ml,goal_ml}`). Ensure `getDay` injects the same resolved `goal_ml` into `dayView` hydration. (Shared file — sequential.)
- [X] T041 [US3] Extend `routes/nutrition.routes.js`: `POST /hydration`. (Shared file — sequential.)
- [X] T042 [P] [US3] Implement `gaugeArc` in `frontend/src/lib/chartGeometry.js` to pass T036 (pure geometry).
- [X] T043 [P] [US3] Create `frontend/src/components/charts/HydrationGauge.jsx` (SVG circular gauge from `gaugeArc`; props `total_ml`, `goal_ml`; over-goal state).
- [X] T044 [US3] Extend `frontend/src/pages/nutrition/NutritionDay.jsx`: hydration card with `HydrationGauge` + quick-add (+250/+500/+1 L) and undo, calling `addHydration`. (Shared file — sequential after US2 T034.)

**Checkpoint**: US1 + US2 + US3 independent; hydration clamps ≥ 0 and resets daily (FR-015/FR-016).

---

## Phase 6: User Story 4 — See nutrition trends over time (Priority: P3)

**Goal**: Calories over 30 days with a goal line, the day's macro breakdown (donut), and weekly **average daily** protein (bars).

**Independent Test**: With food across several days/weeks, `GET /nutrition/trends` returns a 30-day calorie series with `goalKcal`, the day's macro proportions, and per-week average daily protein; charts render and low/no-data states don't error.

### Tests for User Story 4 (write first)

- [X] T045 [P] [US4] FAILING unit test `tests/unit/nutritionTrends.test.js` for `caloriesByDay(entries,{days,asOf})` (date-asc, window, gaps as 0/absent per design), `macroBreakdown(dayEntries)` (proportions sum to 1, empty → safe), `weeklyAvgProtein(entries,{asOf})` (mean daily protein per week, partial weeks).
- [X] T046 [P] [US4] FAILING unit test `tests/unit/trendsView.test.js` for `services/nutrition/trendsView.js` assembly + low/no-data shape.
- [X] T047 [P] [US4] FAILING unit test `tests/unit/lib.chartGeometry.donut.test.js` for `donutSegments({values,...})` (segment angles, zero-total safe).
- [X] T048 [P] [US4] Contract test `tests/contract/nutritionTrends.contract.test.js` for `GET /nutrition/trends` per contract (live-gated).

### Implementation for User Story 4

- [X] T049 [P] [US4] Implement `services/engine/nutritionTrends.js` (`caloriesByDay`, `macroBreakdown`, `weeklyAvgProtein`) to pass T045 (pure; caller supplies `asOf`).
- [X] T050 [P] [US4] Implement `services/nutrition/trendsView.js` to pass T046 (`build({ rangeEntries, dayEntries, goalKcal, days, asOf })`).
- [X] T051 [US4] Extend `controllers/nutrition.controller.js`: `getTrends` (read `nutritionLogs.listRange` over `NUTRITION_TREND_DAYS`, resolve target kcal, compose with `trendsView`). (Shared file — sequential.)
- [X] T052 [US4] Extend `routes/nutrition.routes.js`: `GET /trends`. (Shared file — sequential.)
- [X] T053 [P] [US4] Implement `donutSegments` in `frontend/src/lib/chartGeometry.js` to pass T047.
- [X] T054 [P] [US4] Create `frontend/src/components/charts/DonutChart.jsx` (macro breakdown from `donutSegments`).
- [X] T055 [US4] Build `frontend/src/pages/nutrition/NutritionTrends.jsx`: calories-30d via reused `LineChart` + goal line, macro `DonutChart`, weekly-protein via reused `BarChart`; low/no-data states. Link/tab from `/nutrition`.
- [X] T056 [P] [US4] Frontend smoke test `tests/frontend/nutritionTrends.test.jsx`: renders all three charts from a stub; empty state without error.

**Checkpoint**: All four stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T057 [P] Add `nutrition_logs`, `hydration_log`, and `nutrition_template_meal_items` probes to `tests/integration/rls.policies.test.js` (per-test JWT, publishable-key client; cross-tenant denied — SC-010).
- [X] T058 [P] Update `services/dataAccess/reset.dao.js`: add `hydration_log` and `nutrition_template_meal_items` to `FULL_WIPE_ORDER`; add `hydration_log` to `MODULE_TABLES.nutrition_logs` (a nutrition-module reset clears the day log + hydration together); do **not** add `nutrition_template_meal_items` to per-module reset (it is seed-owned template data, wiped only on full reset alongside `nutrition_template_meals`).
- [X] T059 [P] Update `CLAUDE.md` with a "Phase 7 — Nutrition & Calories" section (new tables + RLS, read-only targets via `resolveTargets`, macro-snapshot stability, custom-food write path, load-plan replace/append, hydration goal resolution, pure `services/nutrition/*` + `services/engine/nutrition*` boundary, donut/gauge geometry).
- [X] T060 [P] Verify lint/format clean (`npm run lint`) and no `@supabase/supabase-js` import outside `services/dataAccess/*` (Constitution II).
- [ ] T061 Run `quickstart.md` end-to-end against the booted app (apply 3 migrations + reseed); confirm all curl examples and the four success-criteria flows (SC-002/004/006/008) behave as documented.
- [ ] T062 [P] Adversarial verification pass (ultracode): macro-snapshot stability after editing a catalogue food (SC-008); load-plan non-destructiveness (FR-011); tenant isolation across all new tables (SC-010); future-date + quantity bounds (FR-004/FR-024).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories**.
- **US1 (P3)** → after Foundational. MVP.
- **US2 / US3 / US4** → after Foundational; independently testable. They share three files with US1 (`controllers/nutrition.controller.js`, `routes/nutrition.routes.js`, `frontend/src/pages/nutrition/NutritionDay.jsx`) — sequence edits to those files; everything else parallelizes.
- **Polish (P7)** → after all targeted stories.

### Cross-story shared files (sequence, do NOT parallelize across stories)

- `controllers/nutrition.controller.js` — T020 (US1) → T032 (US2) → T040 (US3) → T051 (US4)
- `routes/nutrition.routes.js` — T022 (US1) → T033 (US2) → T041 (US3) → T052 (US4)
- `frontend/src/pages/nutrition/NutritionDay.jsx` — T024 (US1) → T034 (US2) → T044 (US3)
- `frontend/src/lib/chartGeometry.js` — T042 (US3, gauge) and T053 (US4, donut) edit the same file → sequence those two.
- `app.js` (T012) and `seed/runSeed.js` (T030) are single-touch.

### Within each story

Unit tests (RED) → pure implementations (GREEN) → controllers → routes → frontend → smoke. Contract/integration tests are live-gated and run at the checkpoint.

### Parallel opportunities

- Setup: T002, T003 in parallel.
- Foundational: T005, T006, T007 (DAOs) ‖ T008→T009, T010→T011 (test→impl pairs) ‖ T013 (frontend api). T004 (migration) and T012/T014 (shared files) gate as noted.
- US1: T015, T016, T017 (tests) in parallel; then impl. T025 parallel with backend impl.
- US2: T026, T027 ‖; T029, T031 ‖.
- US3: T036, T037, T038 ‖; T042, T043 ‖.
- US4: T045, T046, T047, T048 ‖; T049, T050, T053, T054 ‖.

---

## Parallel Example: Foundational pure helpers (ultracode fan-out)

```text
# One workflow agent per task, distinct files, all concurrent:
Agent: "T008 write failing tests/unit/foodSlug.test.js"      (then T009 implement)
Agent: "T010 write failing tests/unit/nutritionMath.test.js" (then T011 implement)
Agent: "T005 create services/dataAccess/nutritionLogs.dao.js"
Agent: "T006 create services/dataAccess/hydration.dao.js"
Agent: "T007 extend services/dataAccess/foods.dao.js"
# Barrier: then T012 (app.js wiring) and T014 (App.jsx routes) sequentially.
```

---

## Implementation Strategy

### MVP first (US1)

1. Setup → Foundational (green checkpoint).
2. US1 (day log + bars + custom food). **Stop & validate** — this is a usable nutrition tracker on its own.

### Incremental delivery

US1 (MVP) → US2 (load plan) → US3 (hydration) → US4 (trends). Each adds value without breaking the previous; each has its own checkpoint and live tests.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- Targets are READ (`resolveTargets`); never recompute, never write the calculation audit log for logging (D-3; mirrors the Phase 1 calculators' FR-029 audit boundary).
- Every log entry snapshots its macros (FR-003/SC-008); editing a catalogue food must not move past totals — verify (T062).
- Every read/write is `req.athleteId`-scoped; no endpoint trusts a body/query tenant id (Constitution I).
- Commit after each task or logical group; the optional auto-commit hook may handle this.
