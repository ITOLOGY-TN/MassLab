---
description: 'Task list — Phase 11: Statistics & Global Progress'
---

# Tasks: Statistics & Global Progress

**Input**: Design documents from `/specs/014-phase11-statistics/`
**Prerequisites**: plan.md, spec.md (4 user stories), research.md (D-1…D-12), data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: INCLUDED. Constitution Principle V (NON-NEGOTIABLE) requires test-first for every number-/recommendation-producing function; the plan's Testing section adds contract, integration, and frontend smoke tests. Engine + presenter unit tests are written FIRST and must FAIL before implementation.

**Organization**: Tasks are grouped by user story (US1 P1 → US4 P3). Phase 11 is a **read-only composition + client-side PDF** — 0 migrations, 0 tables, 0 new DAO. The two endpoints (`GET /api/v1/statistics`, `GET /api/v1/statistics/report`) are scaffolded in the Foundational phase; each story then contributes its engine helper(s), presenter(s), a slice of the composed payload, and its frontend surface.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (setup, foundational & polish carry no story label)
- Exact file paths are included in every task.

## Path Conventions

Web app at repo root (Phase 0–10 layout): backend in `routes/`, `controllers/`, `services/{engine,statistics}/`, `config/`; frontend in `frontend/src/`; tests in `tests/{unit,contract,integration,frontend}/`. All Supabase access stays in the existing `services/dataAccess/*` (Constitution II); no new DAO.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project-level prerequisites for the whole feature.

- [X] T001 Add `jspdf` to `frontend/package.json` dependencies and run `npm install` in `frontend/` (the only new dependency — client-side PDF, research D-10).
- [X] T002 [P] Add config keys `STATISTICS_TOP_EXERCISES` (5), `STATISTICS_REPORT_TOP_PROGRESSIONS` (3), `STATISTICS_HEATMAP_LEVELS` (4), `STATISTICS_MIN_CORRELATION_POINTS` (3) to the zod schema + defaults in `config/schema.js`, and list them in `.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Endpoint scaffolding, the composed-payload skeleton, and the frontend screen shell that every story plugs into.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T003 Create `routes/statistics.routes.js` exposing `GET /` and `GET /report` delegated to the controller (thin HTTP shell, Constitution II; mounted under `/api/v1/statistics`).
- [X] T004 Create controller skeleton `controllers/statistics.controller.js` taking `({ daos, config })` with `getStatistics` and `getReport`: read the clock **once** (`asOf` = server UTC day), derive the program window from `program_start_date`, fan out reads with `Promise.all`, return the `{ data }` envelope; every read parameterised by `req.athleteId` (Constitution I, research D-12). Returns an empty composed shape until stories wire their slices.
- [X] T005 Mount the statistics router in `app.js` with `({ daos, config })` after the existing routers (additive; reuses existing DAOs — no new DAO instantiation).
- [X] T006 [P] Create pure top-level assembler `services/statistics/statisticsView.js` that composes `{ metrics, body, strength, attendance, nutrition, recovery }` from injected slices and emits the cold-start shape for any missing slice (FR-026); no `@supabase` import.
- [X] T007 [P] Create `frontend/src/lib/statisticsApi.js` with `getStatistics()` and `getReport(month?)` thin fetch wrappers over `/api/v1/statistics*`.
- [X] T008 [P] Create `frontend/src/pages/statistics/StatisticsHome.jsx` shell (metric-card region + tab switcher placeholders for Body/Strength/Attendance/Nutrition/Recovery), register the `/statistics` route in `frontend/src/App.jsx`, and add the "Statistiques" nav entry.

**Checkpoint**: Endpoints respond with an empty composed payload; the `/statistics` screen renders its shell. Stories can now proceed.

---

## Phase 3: User Story 1 — Headline transformation metrics (Priority: P1) 🎯 MVP

**Goal**: Four big-number cards — total weight gained, total volume since start, session completion rate, average weekly calories — each with a cold-start empty state.

**Independent Test**: With weight, finished-session, schedule, and nutrition data present, `GET /api/v1/statistics` returns correct `metrics`; the screen shows four cards; a brand-new athlete shows empty states with no error.

### Tests for User Story 1 ⚠️ (write first, must FAIL)

- [X] T009 [P] [US1] Unit test `tests/unit/statisticsMetrics.test.js` for `services/engine/statisticsMetrics.js` — `totalWeightGained`, `totalVolumeSinceStart`, `sessionCompletionRate`, `averageWeeklyCalories` with a fixed `asOf`, the `program_start_date` anchor (D-7), and cold-start (`null`/`0`/`pct:null`) cases.
- [X] T010 [P] [US1] Unit test `tests/unit/statisticsMetricsView.test.js` for `services/statistics/metricsView.js` (shape + cold-start).
- [X] T011 [US1] Contract test `tests/contract/statistics.metrics.contract.test.js` — `GET /statistics` `metrics` slice conforms to `contracts/openapi.yaml` (live-gated; skips without `.env`/Supabase — no migration probe).
- [X] T012 [US1] Integration test `tests/integration/statistics.metrics.test.js` — metrics for the seeded athlete, the cold-start payload, and **no row counts change** across the GET (SC-011).

### Implementation for User Story 1

- [X] T013 [P] [US1] Implement pure `services/engine/statisticsMetrics.js` (the four metrics; injected DAO data + `asOf`/config; no I/O, no clock — Constitution V).
- [X] T014 [US1] Implement pure `services/statistics/metricsView.js` assembling the `metrics` view model (depends on T013).
- [X] T015 [US1] Wire `metrics` into `controllers/statistics.controller.js#getStatistics`: fan out reads via existing DAOs/readers — `athletes.dao` (profile/start/goal), `bodyTracking/weightChartView` inputs (`bodyMeasurements.dao`), `sessions.dao#dailyTrainingVolumes`, `weeklyPlan.dao` (schedule denominator), `nutritionLogs.dao` + `engine/nutritionTrends`/`engine/nutritionMath`, `nutrition/targets.js#resolveTargets` — and pass to `metricsView` + `statisticsView`.
- [X] T016 [P] [US1] Create `frontend/src/components/statistics/StatMetricCard.jsx` and render the four cards (incl. empty states) in `StatisticsHome.jsx`.
- [X] T017 [US1] Frontend smoke test `tests/frontend/statisticsMetrics.test.jsx` — the four cards render from a stub, including cold-start.

**Checkpoint**: US1 is independently functional — the metrics MVP renders and is testable on its own.

---

## Phase 4: User Story 2 — Body & Strength tabs (Priority: P2)

**Goal**: Body tab (weight curve + goal, per-measurement curves) and Strength tab (top-5 progressions by abs working-weight kg, weekly volume, progress-% muscle-group radar).

**Independent Test**: With weight/measurement/strength history, `GET /statistics` returns `body` + `strength`; both tabs render their charts; sparse data degrades to empty/insufficient states.

### Tests for User Story 2 ⚠️ (write first, must FAIL)

- [X] T018 [P] [US2] Unit test `tests/unit/exerciseImprovements.test.js` for `services/engine/exerciseImprovements.js` — top-N by **absolute working-weight gain (kg)** since start, fewer-than-N, tie handling (D-4).
- [X] T019 [P] [US2] Unit test `tests/unit/muscleGroupProgress.test.js` for `services/engine/muscleGroupProgress.js` — **progress % per group** (now vs start), origin on insufficient data (D-5).
- [X] T020 [P] [US2] Unit test `tests/unit/statisticsBodyTab.test.js` for `services/statistics/bodyTab.js` (weight series + goal; measurements with data only; `has_data`).
- [X] T021 [P] [US2] Unit test `tests/unit/statisticsStrengthTab.test.js` for `services/statistics/strengthTab.js` (top progressions, weekly volume, radar axes/values).
- [X] T022 [US2] Contract test `tests/contract/statistics.bodyStrength.contract.test.js` — `body` + `strength` slices conform to the contract (live-gated).
- [X] T023 [US2] Integration test `tests/integration/statistics.bodyStrength.test.js` — body + strength for the seeded athlete and the insufficient-data shapes.

### Implementation for User Story 2

- [X] T024 [P] [US2] Implement pure `services/engine/exerciseImprovements.js` (`rankByWorkingWeightGain`, working-weight series per exercise).
- [X] T025 [P] [US2] Implement pure `services/engine/muscleGroupProgress.js` (`progressByGroup`).
- [X] T026 [P] [US2] Implement pure `services/statistics/bodyTab.js` (reusing `bodyTracking/weightChartView` + `engine/measurementDeltas`).
- [X] T027 [US2] Implement pure `services/statistics/strengthTab.js` (depends on T024, T025; ISO-week volume via `services/supplements/week.js`).
- [X] T028 [US2] Wire `body` + `strength` into the controller fan-out — `oneRepMaxRecords.dao#seriesForAthlete`, the exercise→muscle-group map (`exercises.dao` + `muscleGroups.dao`, as `loadTracking/phaseRadarView` builds it), and `sessions.dao#dailyTrainingVolumes` for weekly volume — into `statisticsView`.
- [X] T029 [P] [US2] Create `frontend/src/pages/statistics/tabs/BodyTab.jsx` reusing `components/charts/LineChart.jsx` for the weight curve (+ goal) and each measurement curve.
- [X] T030 [P] [US2] Create `frontend/src/pages/statistics/tabs/StrengthTab.jsx` reusing `LineChart` (progressions), `BarChart` (weekly volume), and `RadarChart` (progress-% radar).
- [X] T031 [US2] Frontend smoke test `tests/frontend/statisticsBodyStrength.test.jsx` — both tabs render their charts and empty states from a stub.

**Checkpoint**: US1 + US2 both work independently.

---

## Phase 5: User Story 3 — Attendance, Nutrition & Recovery tabs (Priority: P3)

**Goal**: Attendance contribution heatmap (graded by daily volume), Nutrition weekly trend vs resolved target, Recovery sleep averages + stress-vs-weight correlation.

**Independent Test**: With session/nutrition/recovery history, `GET /statistics` returns `attendance` + `nutrition` + `recovery`; each tab renders; a tab with missing data shows its own empty/insufficient state while others render.

### Tests for User Story 3 ⚠️ (write first, must FAIL)

- [X] T032 [P] [US3] Unit test `tests/unit/attendanceHeatmap.test.js` for `services/engine/attendanceHeatmap.js` — `gradeByVolume` levels (0 = no session; 1…N quantile buckets), rest/future days at level 0 (D-6).
- [X] T033 [P] [US3] Unit test `tests/unit/stressWeightSeries.test.js` for `services/engine/stressWeightSeries.js` — paired points only when both exist, `sufficient` below the configured floor (D-9).
- [X] T034 [P] [US3] Unit test `tests/unit/statisticsAttendanceTab.test.js` for `services/statistics/attendanceTab.js`.
- [X] T035 [P] [US3] Unit test `tests/unit/statisticsNutritionTab.test.js` for `services/statistics/nutritionTab.js` (weekly kcal vs weekly target = resolved daily × 7).
- [X] T036 [P] [US3] Unit test `tests/unit/statisticsRecoveryTab.test.js` for `services/statistics/recoveryTab.js` (sleep average; stress-weight pass-through + `sufficient`).
- [X] T037 [US3] Contract test `tests/contract/statistics.anr.contract.test.js` — `attendance` + `nutrition` + `recovery` slices conform to the contract (live-gated).
- [X] T038 [US3] Integration test `tests/integration/statistics.anr.test.js` — the three tabs for the seeded athlete and their insufficient-data shapes.

### Implementation for User Story 3

- [X] T039 [P] [US3] Implement pure `services/engine/attendanceHeatmap.js`.
- [X] T040 [P] [US3] Implement pure `services/engine/stressWeightSeries.js`.
- [X] T041 [P] [US3] Implement pure `services/statistics/attendanceTab.js` — emit `{ from, to, levels, days: [{ date, volume_kg, level }] }` only (backend produces graded day data; the calendar **layout** is a frontend concern handled in T045 via `CalendarHeatmap`/`chartGeometry.calendarMonth`). No frontend-lib import (Constitution II).
- [X] T042 [P] [US3] Implement pure `services/statistics/nutritionTab.js` (reusing `engine/nutritionTrends#caloriesByDay` + `nutrition/targets`; ISO-week bucketing via `services/supplements/week.js`).
- [X] T043 [P] [US3] Implement pure `services/statistics/recoveryTab.js` (sleep averaging from `recovery_log`; stress-weight via T040).
- [X] T044 [US3] Wire `attendance` + `nutrition` + `recovery` into the controller fan-out — `sessions.dao#dailyTrainingVolumes` (attendance), `nutritionLogs.dao` + `resolveTargets` (nutrition), `recovery.dao` + `bodyMeasurements.dao` (recovery) — into `statisticsView`.
- [X] T045 [P] [US3] Create `frontend/src/pages/statistics/tabs/AttendanceTab.jsx` reusing `components/charts/CalendarHeatmap.jsx`.
- [X] T046 [P] [US3] Create `frontend/src/pages/statistics/tabs/NutritionTab.jsx` reusing `LineChart`/`BarChart` (weekly trend + target line).
- [X] T047 [P] [US3] Create `frontend/src/pages/statistics/tabs/RecoveryTab.jsx` reusing `LineChart` (sleep) + `ScatterPlot` (stress vs weight).
- [X] T048 [US3] Frontend smoke test `tests/frontend/statisticsANR.test.jsx` — the three tabs render charts + empty/insufficient states from a stub.

**Checkpoint**: All five tabs + the metric cards work independently.

---

## Phase 6: User Story 4 — Monthly PDF report (Priority: P3)

**Goal**: Export a downloadable PDF for a selectable month (default = most recently completed month) with summary + lifetime stats, top-3 load progressions, a weight chart, and deterministic recommendations — generating nothing persisted, no AI.

**Independent Test**: `GET /statistics/report?month=` returns the report payload; default month = last completed month; the export button produces a PDF; no stored data changes.

### Tests for User Story 4 ⚠️ (write first, must FAIL)

- [X] T049 [P] [US4] Unit test `tests/unit/reportRecommendations.test.js` for `services/engine/reportRecommendations.js` — deterministic rule mappings (add_load / stagnation / regression / calorie vs target / recovery red flags), fixed ordering, **no free-form/AI output** (SC-009).
- [X] T050 [P] [US4] Unit test `tests/unit/statisticsMonthlyReport.test.js` for `services/statistics/monthlyReport.js` — period resolution incl. **default = most recently completed calendar month**, summary + lifetime figures, and the empty-month valid shape (D-3/D-10).
- [X] T051 [US4] Contract test `tests/contract/statistics.report.contract.test.js` — `GET /statistics/report` with `month`, the default (omitted `month`), and `400` on a malformed `month` (live-gated).
- [X] T052 [US4] Integration test `tests/integration/statistics.report.test.js` — report for a chosen month, the default month, an empty month, and **no row counts change** across the GET (SC-011).

### Implementation for User Story 4

- [X] T053 [P] [US4] Implement pure `services/engine/reportRecommendations.js` (`buildRecommendations(signals, { strings })`; strings via the `NUTRITION_LOCALE` localization seam).
- [X] T054 [US4] Implement pure `services/statistics/monthlyReport.js` (depends on T053; composes period/summary/lifetime/topProgressions/weightSeries/recommendations).
- [X] T055 [US4] Implement `getReport` in `controllers/statistics.controller.js`: parse/validate `month` (`400 VALIDATION_ERROR` on malformed), default to the last completed month from `asOf` at the boundary, fan out the month-scoped reads + `progressionFlags.dao#findActiveForAthlete`, compose via `monthlyReport`.
- [X] T056 [P] [US4] Create `frontend/src/lib/pdfReport.js` — jsPDF assembly: render the existing SVG `LineChart` for `weightSeries`, serialize SVG → PNG via the browser canvas (`XMLSerializer` → `Image` → `canvas.toDataURL`), add summary/lifetime/top-3/recommendations text (no html2canvas).
- [X] T057 [P] [US4] Create `frontend/src/components/statistics/ReportButton.jsx` (month picker + "Export PDF") and mount it in `StatisticsHome.jsx`.
- [X] T058 [US4] Frontend smoke test `tests/frontend/statisticsReport.test.jsx` — the report button triggers generation from a stub without error.

**Checkpoint**: All four user stories complete and independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final verification, design polish, and boundary guarantees.

- [X] T059 [P] Apply the **Frontend Design skill** to `/statistics` (Tailwind tokens, premium sport-focused feel, responsive tabs + cards) per Constitution VI; cite decisions in the PR.
- [X] T060 [P] Update `frontend/src/App.jsx` nav styling/active-state for "Statistiques" and confirm `.env.example` documents the four `STATISTICS_*` keys.
- [X] T061 Boundary verification: assert across both GETs that **no writes / no `calculation_results` / no `auditWriter` / no engine call** occur and row counts are identical (SC-011), every read is `req.athleteId`-scoped (SC-012), and every recommendation traces to a deterministic signal (SC-009). _Verified: no `@supabase` import in `services/statistics/*` or the new `services/engine/*`; no clock/random in pure fns; controller does no insert/upsert/auditWriter/engine call; SC-011 row-count-unchanged asserted by the live integration tests._
- [X] T062 Run `npm test` (unit + contract + integration) and `npm --prefix frontend test` (smoke) green; run ESLint/Prettier clean. _Statistics scope fully green: 547 unit + 119 frontend + 15 statistics contract/integration (live). ESLint/Prettier clean. NOTE: 5 unrelated dashboard/sessions tests fail because they are date-dependent (today = Saturday rest day); proven pre-existing by re-running them with all Phase 11 changes stashed._
- [ ] T063 Run the `quickstart.md` verification (curl both endpoints, export a PDF) and confirm the cold-start athlete renders the whole screen + a valid empty-state report. _Endpoints verified live via the contract/integration suite; the PDF export still needs a manual in-browser check (jsPDF canvas rasterization requires a real browser)._

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — **BLOCKS all user stories** (route, controller skeleton, assembler, frontend shell).
- **User Stories (Phase 3–6)**: all depend on Foundational. US1 → US2 → US3 → US4 by priority; each also independently testable. The only shared-file touch points are the controller fan-out (T015, T028, T044, T055) and `statisticsView.js` — sequence those per story to avoid conflicts.
- **Polish (Phase 7)**: depends on the desired stories being complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. No dependency on other stories (MVP).
- **US2 (P2)**: after Foundational. Independent of US1 (adds `body`/`strength` slices).
- **US3 (P3)**: after Foundational. Independent (adds `attendance`/`nutrition`/`recovery` slices).
- **US4 (P3)**: after Foundational. Uses the same readers but a separate endpoint (`/report`) + presenter; independent of US1–US3.

### Within Each User Story

- Unit tests (engine + presenter) FIRST and FAILING → engine helpers → presenter → controller wiring → frontend tab → smoke test.
- Engine helpers before their presenter; presenter before controller wiring; controller slice before the frontend tab consuming it.

### Parallel Opportunities

- Setup: T002 ∥ (T001 installs the dep).
- Foundational: T006 ∥ T007 ∥ T008 after T003–T005.
- Per story, all `[P]` unit tests run together; the engine helpers (`[P]`) run together; the frontend tab files (`[P]`) run together. The controller-wiring task in each story is **not** `[P]` (shared file).
- Across stories: once Foundational is done, US1–US4 engine/presenter/test/frontend work can fan out in parallel, **serializing only** the controller fan-out + `statisticsView` edits.

---

## Parallel Example: User Story 2

```bash
# Unit tests first (all [P], must fail):
Task: "Unit test exerciseImprovements in tests/unit/exerciseImprovements.test.js"
Task: "Unit test muscleGroupProgress in tests/unit/muscleGroupProgress.test.js"
Task: "Unit test bodyTab in tests/unit/statisticsBodyTab.test.js"
Task: "Unit test strengthTab in tests/unit/statisticsStrengthTab.test.js"

# Then engine helpers + body presenter (all [P], different files):
Task: "Implement services/engine/exerciseImprovements.js"
Task: "Implement services/engine/muscleGroupProgress.js"
Task: "Implement services/statistics/bodyTab.js"

# Then frontend tabs (all [P]):
Task: "Create frontend/src/pages/statistics/tabs/BodyTab.jsx"
Task: "Create frontend/src/pages/statistics/tabs/StrengthTab.jsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational → 3. Phase 3 US1 → **STOP & VALIDATE** the four metric cards independently → deploy/demo.

### Incremental Delivery

Setup + Foundational → US1 (MVP) → US2 (Body+Strength) → US3 (Attendance/Nutrition/Recovery) → US4 (PDF). Each story adds value without breaking the previous ones.

### Ultracode / parallel-agent execution

This feature is well-suited to multi-agent fan-out because the new logic is a set of **independent pure modules**:

1. One agent completes Setup + Foundational (Phases 1–2) — the shared route/controller/assembler/shell.
2. After the Foundational checkpoint, fan out **one agent per user story** (US1–US4). Within each agent, run the `[P]` unit tests + engine helpers + frontend tab concurrently.
3. **Serialize the shared-file edits** — the controller fan-out wiring (T015 → T028 → T044 → T055) and `statisticsView.js` — through a single integrator (or worktree-isolate each story and merge), since those are the only cross-story write conflicts.
4. Adversarially verify each engine helper against its clarified definition (abs-kg ranking D-4, progress-% radar D-5, volume-graded heatmap D-6, no-AI recommendations D-11) and the read-only boundary (SC-009/SC-011/SC-012) before merge.
5. Finish with Phase 7 polish + the quickstart verification.

---

## Notes

- `[P]` = different files, no incomplete-task dependency. `[Story]` traces a task to its user story.
- 0 migrations / 0 tables / 0 new DAO; the only new dependency is frontend `jspdf`.
- No `@supabase/supabase-js` import in `services/statistics/*` or the new `services/engine/*` — they take injected data (Constitution II). The controller is the only new DAO caller.
- Clock read **once** at the controller (`asOf`); pure functions never read the clock/random/globals (D-12).
- Verify each unit test FAILS before implementing (Constitution V).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
