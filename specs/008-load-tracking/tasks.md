---
description: 'Phase 5 — Load Tracking & Progression Algorithm implementation tasks'
---

# Tasks: Load Tracking & Progression Algorithm

**Input**: Design documents from `/specs/008-load-tracking/`
**Prerequisites**: plan.md, spec.md, research.md (D-1…D-11), data-model.md, contracts/openapi.yaml, quickstart.md
**Tests**: INCLUDED — Constitution V mandates test-first for every number-producing function; plan.md enumerates the unit/contract/integration/smoke suites.

**Branch**: `008-load-tracking` · **Tech**: Node 20+/ESM Express backend, React 18 + Vite + Tailwind frontend, Supabase PostgreSQL. **Read-only phase — 0 migrations, 0 new tables, no new runtime dependency.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task.
- **[Story]**: US1–US3 (user-story phases only). Setup/Foundational/Polish carry no story label.
- Every task names exact file paths.

---

## 🚀 Ultracode Execution Guide (read before `/speckit-implement`)

This file is written to be implemented under **ultracode** (xhigh reasoning + dynamic workflow orchestration). Run it phase-by-phase; the `[P]` markers are the fan-out unit.

1. **Sequential gates, parallel interiors.** Phases run in order (Setup → Foundational → US1 → US2 → US3 → Polish). Within a phase, every `[P]` task is an independent agent (different file, no shared-state write). Non-`[P]` tasks depend on an earlier task in the same phase.
2. **Test-first per story (red→green).** Each story starts with a `Tests` block. Author those `[P]` tests first and confirm they **fail** before implementing. The pure-function unit tests (`trendProjection`, `statusMap`, the three presenters, `phaseForDate`, `chartGeometry`) are the Constitution V gate — write them before their module.
3. **Recommended workflow shape per phase:** `pipeline(tasks, write → test → adversarially-verify)` — after a story's impl lands, spawn one verifier per Acceptance Scenario / Success Criterion that tries to break it (no history, <3-point projection, single-phase radar, status conflict exercise-vs-muscle-group, archived exercise). Fix on any confirmed failure.
4. **Same-file tasks are NOT `[P]` with each other.** `controllers/loadTracking.controller.js`, `services/engine/trendProjection.js`, `frontend/src/pages/loadTracking/*`, and `tests/contract/loadTracking.contract.test.js` are touched across stories — those touches are sequenced across phases, so they never collide.
5. **Checkpoint discipline.** Stop at each `**Checkpoint**`, run that story's `Independent Test`, then proceed. US1 alone is a shippable MVP.

**Fan-out map (the big `[P]` batches):** Foundational reads (T003,T004,T006) · US1 tests (T007–T011) · US1 pure helpers (T012,T013) · US2 tests (T017–T020) · US2 projection+geometry (T021,T022) · US3 tests (T026–T028) · Polish (T032–T034,T037).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: This is a read-only phase over the Phase 0–4 stack; almost nothing new is needed at setup.

- [X] T001 Confirm the three `/api/v1/load-tracking/*` paths in `contracts/openapi.yaml` are the build target (no config, no dependency, no migration). No code change — a scoping checkpoint before Foundational.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The read-only DAO methods, the shared phase helper, the route/controller skeleton, and the frontend shell that every story builds on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T002 Extract `phaseForDate({ phases, programStartDate, date })` from `services/sessionJournal/currentPhase.js` (the date-generalization of `currentTrainingPhase`) and have `currentTrainingPhase` delegate to it with `date = now` (research D-7). Keep behavior identical; export both. Re-run the existing `tests/unit/sessionJournal.currentPhase.test.js` to confirm no regression.
- [X] T003 [P] Add read method `seriesForAthlete(athleteId)` to `services/dataAccess/oneRepMaxRecords.dao.js` → all records `[{ exercise_id, created_at, source_weight_kg, source_reps, primary_estimate_kg }]` ascending by `created_at` (data-model §2, D-1). Read-only, athlete-scoped, `HttpError(500,'DB_ERROR')` on error.
- [X] T004 [P] Add read method `recentSessionVolumesForExercise(athleteId, exerciseId, { limit = 10 })` to `services/dataAccess/sessions.dao.js` → per-session rollup `[{ session_id, date, top_weight_kg, top_reps, total_volume_kg }]` over completed sets, newest first (data-model §2, D-11). Keep existing methods unchanged.
- [X] T005 Create `routes/loadTracking.routes.js` (factory `loadTrackingRoutes({ daos, config })` wiring `GET /overview`, `GET /exercises/:id`, `GET /phase-comparison`) and `controllers/loadTracking.controller.js` (factory exporting handler **stubs**), then mount `v1.use('/load-tracking', loadTrackingRoutes({ daos: resolved, config }))` in `app.js` after the `/program` routers (research D-10). Depends on T003, T004.
- [X] T006 [P] Frontend shell: in `frontend/src/App.jsx` add the `/load-tracking`, `/load-tracking/exercises/:id`, `/load-tracking/phases` routes and a "Charges" nav `<Link>`; create page skeletons `frontend/src/pages/loadTracking/{LoadOverview,ExerciseProgress,PhaseComparison}.jsx` and the API wrappers skeleton `frontend/src/lib/loadTrackingApi.js` (mirroring `programApi.js`'s `{ data }` unwrap).

**Checkpoint**: DAO reads, `phaseForDate`, routes/controller skeleton mounted, `/load-tracking` reachable. User stories can begin.

---

## Phase 3: User Story 1 - Progression overview (Priority: P1) 🎯 MVP

**Goal**: One row per exercise — current load, all-time record, last-session volume, estimated-1RM trend, and a four-state status badge (🟢 add / 🟡 maintain / 🟠 stagnation / 🔴 regression) — plus muscle-group deload notices.

**Independent Test**: With finished-session history, load the overview and confirm each exercise shows current load, all-time record, last-session volume, a trend, and a status that matches the active progression flag; exercises with no history show neutral rows; muscle-group deload notices appear distinctly (SC-001, SC-002, FR-001..FR-010).

### Tests for User Story 1 (write first — must FAIL before impl) ⚠️

- [X] T007 [P] [US1] Unit test `tests/unit/loadTracking.statusMap.test.js` — `overviewStatus`: exercise `add_load`→ready, `regression`→regressing, muscle-group `stagnation` (no own flag)→stagnation, else maintain; `deload_suggested` surfaced separately (D-5).
- [X] T008 [P] [US1] Unit test `tests/unit/engine.trendProjection.test.js` (trend part) — `oneRmSeries` ordering and `trendDirection` up/flat/down with the **fixed 1% dead-band over a 30-day window** (assert the exact boundary: |change| ≤ 1% → flat); neutral when < 2 in-window points (D-3).
- [X] T009 [P] [US1] Unit test `tests/unit/loadTracking.overviewView.test.js` — `buildOverview` composes rows (current load via `lastWeightUsed`, record = max `source_weight_kg`, last-session volume, trend, status, increment for ready), neutral empties when no history, `empty:true` when no history anywhere, deload notices list (D-4/D-5/D-6, FR-001..FR-010).
- [X] T010 [P] [US1] Contract test `tests/contract/loadTracking.contract.test.js` — `GET /load-tracking/overview` returns the `OverviewView` shape per `contracts/openapi.yaml` (live-gated, skips offline).
- [X] T011 [P] [US1] Frontend smoke `tests/frontend/LoadTracking.overview.test.jsx` — overview renders rows with status badges + deload notices from a stub payload; neutral row for a no-history exercise.

### Implementation for User Story 1

- [X] T012 [P] [US1] Create pure `services/loadTracking/statusMap.js` — `overviewStatus({ exerciseFlagType, muscleGroupFlagType })` + a `deloadMuscleGroups(activeFlags)` helper (D-5).
- [X] T013 [P] [US1] Create pure `services/engine/trendProjection.js` with `oneRmSeries(records)` and `trendDirection({ series, windowDays = 30, flatBandPct = 1, now })` (D-1/D-3) — `flat` when |change| ≤ `flatBandPct`, neutral when < 2 in-window points; the 1% band is a fixed presentation constant (not the engine's `on_pace_pct_per_month`). (The projection function is added in US2; this file is created here.)
- [X] T014 [US1] Create pure `services/loadTracking/overviewView.js` — `buildOverview({ exercises, seriesByExerciseId, lastSessionVolumeByExerciseId, activeFlags, muscleGroupByExerciseId, muscleGroups, constants, now })` reusing `exerciseHistory.lastWeightUsed`, `statusMap`, `trendDirection`. Depends on T012, T013.
- [X] T015 [US1] Implement `overview` in `controllers/loadTracking.controller.js` — read `oneRepMaxRecords.seriesForAthlete`, `progressionFlags.findActiveForAthlete`, `exercises.listForAthlete` (incl. archived), `weeklyPlan.listSlotsWithExercises` (exercise→muscle group), `muscleGroups.listForAthlete`, and the most-recent-session volume per exercise (one indexed read per exercise — bounded for a single athlete; batchable later if exercise counts grow, P1); hand plain data to `buildOverview`; return `{ data }`. Depends on T003, T004, T014.
- [X] T016 [US1] Implement `frontend/src/lib/loadTrackingApi.js` `fetchOverview()` and build `frontend/src/pages/loadTracking/LoadOverview.jsx` — table of rows (status badge, load, record, volume, trend arrow), deload notices, empty state; rows link to the exercise detail. Reuse `StateBlock`; status colors via Tailwind tokens. Depends on T015.

**Checkpoint**: US1 is a shippable MVP — the whole-program progression overview works.

---

## Phase 4: User Story 2 - Per-exercise progression detail (Priority: P2)

**Goal**: For one exercise: a load-over-time line (all-time-record annotation + dotted 8-week projection), a volume-per-session bar chart, a last-10-sessions table, and the current estimated 1RM.

**Independent Test**: Open an exercise with several finished sessions and confirm the load line, volume bars, last-10 table, current 1RM + record render from its history, and the dotted 8-week projection appears only at ≥3 sessions; a low-history exercise shows the static parts with a clear "not enough data" state (SC-004, SC-006, FR-011..FR-016).

### Tests for User Story 2 (write first) ⚠️

- [X] T017 [P] [US2] Unit test `tests/unit/engine.trendProjection.projection.test.js` — `projectOneRm` least-squares fit returns 8-week points for ≥3 points, `null` below the floor, monotonic dates (D-2).
- [X] T018 [P] [US2] Unit test `tests/unit/loadTracking.exerciseProgressView.test.js` — `buildExerciseProgress` assembles `load_series`/`volume_series` (asc), `recent_sessions` (≤10), `current_estimate_1rm_kg`, `all_time_record_kg`, and `projection` null/present per threshold (D-1/D-4/D-11/D-2, FR-011..FR-016).
- [X] T019 [P] [US2] Unit test `tests/unit/lib.chartGeometry.test.js` — `linearScale`, `linePath`, `barRects`, `radarPolygon`, `niceTicks` against fixed inputs (D-9). (`radarPolygon` is a pure number-producing function used by US3 — tested here per Constitution V.)
- [X] T020 [P] [US2] Extend `tests/contract/loadTracking.contract.test.js` + add frontend smoke `tests/frontend/LoadTracking.detail.test.jsx` — `GET /load-tracking/exercises/:id` shape (incl. 404 for a bad id) and the detail page renders charts from a stub + shows the "<3 sessions → no projection" state.

### Implementation for User Story 2

- [X] T021 [P] [US2] Add `projectOneRm({ series, weeksAhead = 8, minPoints = 3, now })` (least-squares) to `services/engine/trendProjection.js` (D-2). [extends the US1 file]
- [X] T022 [P] [US2] Create pure `frontend/src/lib/chartGeometry.js` — `linearScale`, `linePath`, `barRects`, `radarPolygon`, `niceTicks` (D-9).
- [X] T023 [US2] Create pure `services/loadTracking/exerciseProgressView.js` — `buildExerciseProgress({ exercise, series, recentSessionVolumes, projection })` (D-1/D-4/D-11). Depends on T021.
- [X] T024 [US2] Implement `getExercise` in `controllers/loadTracking.controller.js` — 404 on bad/unknown id; read the exercise's `oneRepMaxRecords` series + `recentSessionVolumesForExercise`; compute the projection; return `buildExerciseProgress`. Depends on T004, T023.
- [X] T025 [US2] Build `frontend/src/components/charts/{LineChart,BarChart}.jsx` (over `chartGeometry`) and `frontend/src/pages/loadTracking/ExerciseProgress.jsx` — **estimated-1RM line as the primary/projected series + secondary working-load line + all-time-record reference marker + dotted projection extending the 1RM line** (I1), volume bars, last-10 table, current 1RM; "not enough data" states. Depends on T022, T024.

**Checkpoint**: US1 + US2 — overview drills into a full per-exercise progression detail.

---

## Phase 5: User Story 3 - Phase-comparison radar (Priority: P3)

**Goal**: A radar of average working load per muscle group, one series per training phase.

**Independent Test**: With sessions spanning ≥2 phases, open the phase comparison and confirm a radar shows avg working load per muscle group with one series per phase; a muscle group with no work in a phase reads 0; with <2 phases of data a clear "needs more than one phase" state shows (SC-007, FR-017..FR-020).

### Tests for User Story 3 (write first) ⚠️

- [X] T026 [P] [US3] Unit test `tests/unit/loadTracking.phaseRadar.test.js` — `buildPhaseRadar` buckets sessions via `phaseForDate`, computes avg per-session top working load per muscle group/phase, zero-fills absent groups, `empty:true` when <2 phases have data (D-7/D-8, FR-017..FR-020).
- [X] T027 [P] [US3] Extend `tests/contract/loadTracking.contract.test.js` — `GET /load-tracking/phase-comparison` returns the `PhaseRadarView` shape.
- [X] T028 [P] [US3] Frontend smoke `tests/frontend/LoadTracking.phases.test.jsx` — radar renders axes + per-phase series from a stub; shows the "<2 phases" empty state.

### Implementation for User Story 3

- [X] T029 [US3] Create pure `services/loadTracking/phaseRadarView.js` — `buildPhaseRadar({ series, exerciseMuscleGroup, muscleGroups, phases, programStartDate, now })` using `phaseForDate` (D-7/D-8).
- [X] T030 [US3] Implement `getPhaseComparison` in `controllers/loadTracking.controller.js` — read `seriesForAthlete`, exercise→muscle-group map, `muscleGroups`, `trainingPhases`, `athlete.program_start_date`; return `buildPhaseRadar`. Depends on T002, T003, T029.
- [X] T031 [US3] Create `frontend/src/components/charts/RadarChart.jsx` (over `chartGeometry.radarPolygon`) and `frontend/src/pages/loadTracking/PhaseComparison.jsx` — overlaid per-phase polygons + legend + "<2 phases" empty state. Depends on T022, T030.

**Checkpoint**: All three stories functional; the athlete has overview, per-exercise detail, and phase comparison.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T032 [P] Integration test `tests/integration/loadTracking.consistency.test.js` — seed a couple of finished sessions; assert overview status matches the active flag, record/volume match the logged sets, the exercise series matches `one_rep_max_records`, and the projection threshold holds; **also assert a `GET /load-tracking/*` call appends no `progression_flags` / `one_rep_max_records` / `calculation_results` rows (FR-022 read-only) and returns only the current athlete's data (FR-021)**; clean up at the DB level. Live-gated.
- [X] T033 [P] Add a "Phase 5 — Load Tracking" architecture section to `CLAUDE.md` (read-only boundary; `services/loadTracking/` presenter boundary; e1RM series from `one_rep_max_records`; hand-rolled SVG charts; `phaseForDate` shared with `currentTrainingPhase`; status map).
- [X] T034 [P] Record a Phase 5 compliance audit note in `.specify/memory/compliance-log.md` (Constitution I/II/III/IV/V/VI adherence; read-only, no migration, no new dependency).
- [X] T035 Run the full suite `npm test` (unit + integration + contract) + the Phase 5 frontend smoke set; ensure green (integration/contract auto-skip offline).
- [X] T036 Run the `quickstart.md` walkthrough end-to-end against the cloud project (finish a few sessions, then hit the three surfaces).
- [X] T037 [P] Confirm overview/detail assembly latency is within the plan budgets (≤600/500/700 ms) and charts render client-side off the request path.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories**. (T005 needs T003+T004.)
- **US1 (P3)** → after Foundational. **MVP.**
- **US2 (P4)** → after Foundational; `projectOneRm` extends the US1 `trendProjection.js`; integrates into the US1 route tree (so practically after US1).
- **US3 (P5)** → after Foundational; reuses `phaseForDate` (T002) + `seriesForAthlete` (T003).
- **Polish (P6)** → after the desired stories.

Stories are independently testable, but US2/US3 layer onto US1's controller/route tree, so run them in priority order (or `worktree`-isolated parallel agents if staffed concurrently).

### Within each story

Tests (red) → pure helpers `[P]` → presenter → controller handler → frontend → green.

### Parallel opportunities

- **T003, T004, T006** (Foundational, different files).
- **T007–T011** (US1 tests); **T012, T013** (US1 pure helpers).
- **T017–T020** (US2 tests); **T021, T022** (US2 projection + geometry).
- **T026–T028** (US3 tests).
- **T032, T033, T034, T037** (Polish).

---

## Parallel Example: User Story 1 (workflow fan-out)

```text
# Stage 1 — author failing tests (parallel):
Task: T007 statusMap   Task: T008 trendDirection   Task: T009 overviewView   Task: T010 contract   Task: T011 frontend smoke

# Stage 2 — pure helpers (parallel) → confirm unit tests green:
Task: T012 statusMap.js   Task: T013 trendProjection.js (series + trendDirection)

# Stage 3 — compose + wire (sequential):
T014 overviewView.js → T015 controller overview → T016 LoadOverview.jsx + loadTrackingApi

# Stage 4 — adversarial verify (parallel, one per SC/edge):
Verify: no-history neutral rows · status exercise-vs-muscle-group conflict · deload notice distinct · archived exercise listed
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup (T001) → 2. Foundational (T002–T006) → 3. US1 (T007–T016) → **STOP & validate** the overview Independent Test → demo. The whole-program progression overview is already the module's core value.

### Incremental delivery

US1 (overview / MVP) → US2 (per-exercise detail + charts) → US3 (phase radar) — each a shippable increment that doesn't break the prior.

### Notes

- `[P]` = different files, no incomplete dependency. The shared multi-story files (`loadTracking.controller.js`, `App.jsx`, `loadTracking.contract.test.js`, `trendProjection.js`) are sequenced across phases.
- Verify each story's tests fail before implementing (Constitution V).
- Commit after each task or logical group; stop at any checkpoint to validate independently.
- No new formula, no migration, no new dependency: surface existing engine output; charts are bespoke SVG (D-9).
