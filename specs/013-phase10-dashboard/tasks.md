---
description: 'Task list — Phase 10: Dashboard'
---

# Tasks: Phase 10 — Dashboard

**Input**: Design documents from `/specs/013-phase10-dashboard/`
**Prerequisites**: plan.md ✅, spec.md ✅ (clarified 2026-06-03), research.md ✅ (D-1…D-7), data-model.md ✅, contracts/openapi.yaml ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution V mandates test-first (red→green→refactor) for every number-/recommendation-producing function — `consecutiveSessionStreak`/`missedScheduledDays`, `aggregateAlerts`, and the presenters all qualify. Contract + integration tests follow the Phase 5/7/8/9 live-gated pattern (skip when `.env`/Supabase is absent — **no migration probe needed; Phase 10 adds no schema**).

**Organization**: Tasks are grouped by the four user stories from spec.md. Phase 10 is **one composed read-only endpoint** (`GET /api/v1/dashboard`) feeding **one home page** (`DashboardHome` at `/`), so the shared `dashboard.controller.js` and `DashboardHome.jsx` are touched by several stories — those wiring edits are **sequenced** (not `[P]`); every per-tile pure presenter, frontend component, and test file is independent and parallelizable.

- **US1 (P1)** — Start today's session from the home screen (today card + 7-day strip)
- **US2 (P2)** — See progress at a glance (4 metric cards + weight sparkline)
- **US3 (P2)** — Act on smart alerts (≤3, fixed priority, exactly five kinds)
- **US4 (P3)** — Daily motivation (quote of the day)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (Setup, Foundational, Polish carry no story label)
- Every task names exact file path(s), repo-relative to `/Users/ahmedbengarali/Projects/MassLab`.

## Path Conventions

Web app, existing Phase 0–9 layout: backend at repo root (`routes/`, `controllers/`, `services/`, `config/`), tests under `tests/{unit,contract,integration,frontend}`, frontend under `frontend/src/`. **No new dependency. 0 migrations / 0 new tables / 0 new DAO** — Phase 10 composes existing readers.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Add the three `DASHBOARD_*` config keys to `config/schema.js` (zod, with defaults per research D-6): `DASHBOARD_NO_SESSION_DAYS` (intFromString default 2, refine >0), `DASHBOARD_CALORIE_DEFICIT_PCT` (number-from-string default 0.9, refine >0 and ≤1), `DASHBOARD_WEIGHT_SPARKLINE_DAYS` (intFromString default 30, refine >0). Follow the existing `RECOVERY_*`/`NUTRITION_TREND_DAYS` patterns. Confirm `.env.example` lists all three (already added).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The endpoint backbone, the top-level assembler, and the frontend home shell that every tile plugs into.

**⚠️ CRITICAL**: No story tile can be wired until this phase is complete.

- [ ] T002 [P] Implement `services/dashboard/dashboardView.js` (pure assembler) + write its unit test `tests/unit/dashboard.dashboardView.test.js` FIRST — `build({ today, week, metrics, sparkline, alerts, quote })` bundles the tiles and sets a `has_data` flag per tile so the frontend renders cold-start empty states (FR-018/SC-009). No I/O. Per data-model.md §3d.
- [ ] T003 Create `routes/dashboard.routes.js` (`dashboardRoutes({ daos, config })` → `GET /dashboard`) and `controllers/dashboard.controller.js` (`dashboardController({ daos, config, now = () => new Date() })` with `getDashboard`). The controller reads the clock once (`isoDay(now())`, server UTC), fans out the ~9 athlete-scoped reads with `Promise.all` (weeklyPlan.listSlotsWithExercises, sessions.findActiveForAthlete, sessions.historyForEngine, trainingPhases, athletes.findById, bodyMeasurements via weightChartView, nutritionLogs.listForDay + resolveTargets, supplementIntake + supplements, recovery.listRange, progressionFlags.findActiveForAthlete, quotes.pickToday), then calls the four sub-presenters + `aggregateAlerts` + `dashboardView.build`, returning `{ data }`. Import the per-tile presenters/engine (built in the story phases); until each lands, guard the call so the endpoint still returns a partial payload. Mount `v1.use('/dashboard', dashboardRoutes({ daos: resolved, config }))` in `app.js`. Mirror `controllers/recovery.controller.js` for the clock/`isoDay` boundary helpers.
- [ ] T004 [P] Create `frontend/src/lib/dashboardApi.js` — thin wrapper `getDashboard()` over the shared api helper (mirror `recoveryApi.js`).
- [ ] T005 Create `frontend/src/pages/dashboard/DashboardHome.jsx` shell (fetch `getDashboard`, lay out tile slots with cold-start states) and edit `frontend/src/App.jsx` to point `/` at `DashboardHome` (replacing `ScaffoldHome` on the `/` route) and add an "Accueil" nav entry. Tile components are added per story; the shell tolerates missing tiles/data without error. **Keep `frontend/src/pages/ScaffoldHome.jsx` and `tests/frontend/scaffold.test.jsx` unchanged** — only the `/` route and nav move to `DashboardHome`; do NOT delete the scaffold page or its smoke test (the test renders `ScaffoldHome` directly).

**Checkpoint**: `GET /api/v1/dashboard` responds and `/` renders the shell — stories now fill tiles.

---

## Phase 3: User Story 1 — Start today's session from the home screen (Priority: P1) 🎯 MVP

**Goal**: The today card (muscle group, first 3 exercises, state-aware start/resume/done/rest CTA) and the compact 7-day done/to-do/rest strip.

**Independent Test**: On a training day the card shows the muscle group + first three exercises + a start action opening that session; on a rest day it shows a rest state; the 7-day strip marks each day done/to-do/rest with future training days as to-do.

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [ ] T006 [P] [US1] Unit test `tests/unit/dashboard.todayCard.test.js` — `build({ slot, isRestDay, sessionState, exercises })` → muscle group, first 3 exercises, state ∈ {not_started,in_progress,finished,rest}, matching cta. (data-model.md §3a)
- [ ] T007 [P] [US1] Unit test `tests/unit/dashboard.weekOverview.test.js` — `build({ weekDays, scheduleDays, finishedDays, asOf })` → 7 days each done/todo/rest; future training days = todo (never missed); rest days = rest. (data-model.md §3b)
- [ ] T008 [P] [US1] Contract test `tests/contract/dashboard.contract.test.js` — drives `GET /dashboard` against `contracts/openapi.yaml` (Supertest), asserting the `{ data }` envelope and the documented `today` + `week` shapes; live-gated skip when Supabase is absent. (The full `DashboardView` schema — metrics/sparkline/alerts/quote — is asserted in T038 once every tile is wired, completing contract coverage.)
- [ ] T009 [P] [US1] Integration test `tests/integration/dashboard.today.integration.test.js` — boots `buildApp`; asserts today-card state for rest/not-started/in-progress/finished and the week-strip statuses (incl. future=todo) for a seeded athlete. Read-only (no row changes).
- [ ] T010 [P] [US1] Frontend smoke `tests/frontend/DashboardToday.test.jsx` — `TodaySessionCard` renders muscle group + 3 exercises + a start link to the journal; rest state hides the CTA; `WeekStrip` renders 7 status cells; empty state renders without error.

### Implementation for User Story 1

- [ ] T011 [P] [US1] Implement `services/dashboard/todayCard.js` (pure) per data-model.md §3a — make T006 pass.
- [ ] T012 [P] [US1] Implement `services/dashboard/weekOverview.js` (pure) per data-model.md §3b — make T007 pass.
- [ ] T013 [US1] Wire today + week into `controllers/dashboard.controller.js`: derive today's slot + `isRestDay` from `weeklyPlan` + `isoDayOfWeek`, the session state from `findActiveForAthlete` + today's finished session, `finishedDays`/`scheduleDays` from `historyForEngine` + the schedule, and the ISO week via `supplements/week.js#{isoWeekStart,weekDays}`; call `todayCard.build` + `weekOverview.build`. (Shared controller — sequence before T023/T030/T035.)
- [ ] T014 [P] [US1] Create `frontend/src/components/dashboard/TodaySessionCard.jsx` — muscle group, first 3 exercises, state-aware CTA (start/resume → `/journal`, review when finished, none on rest). Frontend Design skill + Tailwind tokens; large CTA (Constitution VI).
- [ ] T015 [P] [US1] Create `frontend/src/components/dashboard/WeekStrip.jsx` — compact 7-day done/to-do/rest strip, color-coded via Tailwind tokens.
- [ ] T016 [US1] Render `TodaySessionCard` + `WeekStrip` in `frontend/src/pages/dashboard/DashboardHome.jsx`. (Shared page — sequence before T025/T032/T037.) Makes T010 pass.

**Checkpoint**: US1 is a usable MVP — the athlete sees and starts today's session from `/`.

---

## Phase 4: User Story 2 — See progress at a glance (Priority: P2)

**Goal**: Four metric cards (weight vs start, yesterday's calories vs resolved target, consecutive-session streak, current phase + days remaining) and the 30-day weight sparkline with goal line.

**Independent Test**: Each card shows the correct derived value; the sparkline plots 30 days + goal; missing sources show clear empty states.

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [ ] T017 [P] [US2] Unit test `tests/unit/engine.sessionStreak.test.js` — `consecutiveSessionStreak({ finishedDays, scheduleDays, asOf, programStart })` (rest days don't break, future days don't count, never before programStart, 0 when latest elapsed scheduled day missed) and `missedScheduledDays({ finishedDays, scheduleDays, asOf })`. (data-model.md §2a)
- [ ] T018 [P] [US2] Unit test `tests/unit/dashboard.metricsView.test.js` — `build({ weight, calories, streak, phase })` shapes the four cards and `null`/empty-flags missing sources (FR-018). (data-model.md §3c)
- [ ] T019 [P] [US2] Integration test `tests/integration/dashboard.metrics.integration.test.js` — asserts weight delta vs start, yesterday's calories vs resolved target, streak count, current phase + days remaining, and the sparkline series for a seeded athlete; empty states when sources are bare.
- [ ] T020 [P] [US2] Frontend smoke `tests/frontend/DashboardMetrics.test.jsx` — four `MetricCard`s render their values and the weight sparkline renders from a stub; empty states render without error.

### Implementation for User Story 2

- [ ] T021 [P] [US2] Implement `services/engine/sessionStreak.js` (pure) per data-model.md §2a — make T017 pass. (Also consumed by US3's `aggregateAlerts`.)
- [ ] T022 [P] [US2] Implement `services/dashboard/metricsView.js` (pure) per data-model.md §3c — make T018 pass.
- [ ] T023 [US2] Wire metrics + sparkline into `controllers/dashboard.controller.js`: weight from `weightChartView.build` (+ profile start/goal), calories from `nutritionLogs.listForDay(yesterday)` + `nutritionMath.dayTotals` vs `resolveTargets`, streak from `consecutiveSessionStreak`, phase from `currentTrainingPhase` with **days-remaining computed from the active phase's duration (`weeks`) and `program_start_date` relative to today** (use the phase's end date if `phaseForDate` already exposes one — check its return shape before adding a calc); build the sparkline series over `DASHBOARD_WEIGHT_SPARKLINE_DAYS`. (Shared controller — after T013.)
- [ ] T024 [P] [US2] Create `frontend/src/components/dashboard/MetricCard.jsx` — one quick-metric tile (reused ×4), with a delta/over-under indicator and an empty state.
- [ ] T025 [US2] Render the four `MetricCard`s + the 30-day weight sparkline (reuse `components/charts/LineChart.jsx` with the goal line) in `DashboardHome.jsx`. (Shared page — after T016.)

**Checkpoint**: US1 + US2 — today's action plus the at-a-glance progress read.

---

## Phase 5: User Story 3 — Act on smart alerts (Priority: P2)

**Goal**: Up to three smart alerts, exactly the five kinds, in the fixed priority order, each reflecting the real condition and linking into the relevant module; "all clear" when none.

**Independent Test**: Seed >3 conditions → exactly the top 3 in order; healthy → empty; each alert's context/link is correct; the dashboard writes nothing.

### Tests for User Story 3 (write first, ensure they FAIL) ⚠️

- [ ] T026 [P] [US3] Unit test `tests/unit/engine.dashboardAlerts.test.js` — `aggregateAlerts(signals, { thresholds })`: returns only active alerts, in the fixed order (low_sleep_high_stress → no_session → calorie_deficit → ready_to_add_load → creatine_streak_broken), capped at 3; empty when none; each carries kind/message_key/context/link. (data-model.md §2b, research D-3)
- [ ] T027 [P] [US3] Integration test `tests/integration/dashboard.alerts.integration.test.js` — seed conditions so >3 hold and assert exactly the top-3 in order; seed a healthy state → empty; assert each shown alert's context (exercise, calorie gap, missed-day count) and link; assert a brand-new athlete who **never logged creatine** does NOT get `creatine_streak_broken` (lapsed-from-positive only, SC-009).
- [ ] T028 [P] [US3] Frontend smoke `tests/frontend/DashboardAlerts.test.jsx` — `AlertList` renders up to three severity-styled cards and an encouraging "all clear" state without error.

### Implementation for User Story 3

- [ ] T029 [P] [US3] Implement `services/engine/dashboardAlerts.js` (pure) per data-model.md §2b — make T026 pass. (Depends on `missedScheduledDays` from T021.)
- [ ] T030 [US3] Wire alert signal-building into `controllers/dashboard.controller.js`: low_sleep_high_stress from the latest `recovery.dao` row vs `RECOVERY_SLEEP_LOW_HOURS`/`RECOVERY_STRESS_HIGH`; no_session from `missedScheduledDays ≥ DASHBOARD_NO_SESSION_DAYS`; calorie_deficit from yesterday < `DASHBOARD_CALORIE_DEFICIT_PCT` × target; ready_to_add_load from an active `add_load` progression flag (name the exercise); creatine_streak_broken when the `SUPPLEMENT_PRIMARY_SLUG` streak (via `streakForSupplement`) has **lapsed from a positive run to 0** — NOT when it was never started (a brand-new athlete who never logged creatine must not trigger it, per SC-009); pass the `signals` to `aggregateAlerts`. (Shared controller — after T023.)
- [ ] T031 [P] [US3] Create `frontend/src/components/dashboard/AlertList.jsx` — up-to-3 alert cards (severity-styled, French copy via the locale seam, link targets) + an "all clear" state.
- [ ] T032 [US3] Render `AlertList` in `DashboardHome.jsx`. (Shared page — after T025.)

**Checkpoint**: US1 + US2 + US3 — actionable home with prioritized guidance.

---

## Phase 6: User Story 4 — Daily motivation (Priority: P3)

**Goal**: A quote of the day, stable within a calendar day and rotating daily; gracefully absent when no quotes exist.

**Independent Test**: A quote renders, is identical across reloads within a day, differs the next day, and the area is absent (no error) when no quotes exist.

### Tests for User Story 4 (write first, ensure they FAIL) ⚠️

- [ ] T033 [P] [US4] Integration test `tests/integration/dashboard.quote.integration.test.js` — `data.quote` is stable for a fixed `now` (reuses `quotes.pickToday`), changes for a next-day `now`, and is `null` when no quotes exist — without error.
- [ ] T034 [P] [US4] Frontend smoke `tests/frontend/DashboardQuote.test.jsx` — `QuoteCard` renders a quote and renders nothing/graceful placeholder when absent.

### Implementation for User Story 4

- [ ] T035 [US4] Wire `quotes.pickToday({ athleteId, now })` into `controllers/dashboard.controller.js` and pass it to `dashboardView.build`. (Shared controller — after T030.)
- [ ] T036 [P] [US4] Create `frontend/src/components/dashboard/QuoteCard.jsx` — the quote of the day tile (Tailwind tokens; absent when null).
- [ ] T037 [US4] Render `QuoteCard` in `DashboardHome.jsx`. (Shared page — after T032.) Makes T034 pass.

**Checkpoint**: All four stories complete — the full dashboard.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T038 [P] Extend `tests/integration/dashboard.today.integration.test.js` (or a new `tests/integration/dashboard.coldstart.integration.test.js`) with: the **cold-start** case (brand-new athlete: every tile empty/`null`/`has_data:false`, `streak.count:0`, no alerts, no error — SC-009); the **read-only** assertion (row counts in `recovery_log`/`nutrition_logs`/`session_journal_entries` unchanged across a GET, no `calculation_results` written — SC-010); an **athlete-scoping** assertion that `GET /dashboard` returns only the requesting athlete's data (FR-017/SC-011 — the dashboard adds no table and is covered by the reused tables' RLS + the controller's `req.athleteId` scoping; assert no other athlete's rows leak into any tile); and the **full `DashboardView` schema** from `contracts/openapi.yaml` (today/week/metrics/sparkline/alerts/quote) now that every tile is wired (completes T008's contract coverage — U2).
- [ ] T039 [P] Run the import-boundary lint (`npm run lint`) and confirm no `@supabase/supabase-js` import in `services/dashboard/*` or `services/engine/{sessionStreak,dashboardAlerts}.js`; confirm those modules are pure (no clock/globals).
- [ ] T040 Document Phase 10 in `CLAUDE.md` — add a "Phase 10 — Dashboard" section (read-only composition; `GET /api/v1/dashboard`; pure `services/dashboard/*` + `services/engine/{sessionStreak,dashboardAlerts}`; reuses resolveTargets/currentTrainingPhase/weightChartView/streakForSupplement/quotes.pickToday/LineChart; no migration/engine/audit; exactly-five fixed-priority alerts; `DashboardHome` replaces `ScaffoldHome` at `/`; `DASHBOARD_*` config keys), matching the Phase 7/8/9 entries.
- [ ] T041 [P] Run the full suite (`npm test` + `npm --workspace frontend test`) and walk the `quickstart.md` steps; confirm SC-001…SC-011 hold and the alert-priority/cold-start scenarios behave.

---

## Dependencies & Execution Order

- **Setup (T001)** → **Foundational (T002–T005)** before any story.
- **US1 (T006–T016)** → **US2 (T017–T025)** → **US3 (T026–T032)** → **US4 (T033–T037)** in priority order; each is independently testable by seeding the underlying module data directly.
- **Shared-file serialization** (the only cross-story coupling):
  - `controllers/dashboard.controller.js` wiring: **T013 → T023 → T030 → T035** (one story's tile wired at a time, or have a single agent own the controller).
  - `frontend/src/pages/dashboard/DashboardHome.jsx` render edits: **T016 → T025 → T032 → T037**.
- **Cross-story logic dependency**: T029 (`dashboardAlerts`) consumes `missedScheduledDays` from **T021** (`sessionStreak`) — build T021 before T029.
- Within a story: **tests first** (must fail) → pure presenter/engine → controller wiring → frontend component → page render.
- **Polish (T038–T041)** last.

## Parallel Execution Examples

- **Foundational fan-out**: T002, T004 in parallel; T003 then T005 (T003 mounts the route, T005 wires `/`).
- **Pure-logic fan-out** (after Foundational): the test+impl pairs across stories are independent files — T006/T011, T007/T012, T017/T021, T018/T022, T026/T029 (T029 after T021) — build concurrently; serialize only the shared controller (T013/T023/T030/T035) and `DashboardHome` (T016/T025/T032/T037) edits.
- **Frontend components**: TodaySessionCard, WeekStrip, MetricCard, AlertList, QuoteCard (T014, T015, T024, T031, T036) are all independent files — fully parallel.

## Implementation Strategy

- **MVP = US1** (T001–T016): a home screen that shows and starts today's session is independently shippable.
- **Increment 2 = US2**, **3 = US3**, **4 = US4** — each adds tiles to the same endpoint/page without touching the others' pure logic.

---

## Ultracode Execution Strategy (workflows + xhigh effort)

This list is shaped for multi-agent **workflow** orchestration. Invoke with the `ultracode` opt-in (start the implement request with **`ultracode`**, or say "use a workflow") so the harness authors a `Workflow` script; otherwise `/speckit-implement` runs the tasks sequentially.

**Recommended workflow shape** (one phase = one fan-out; read results between phases):

1. **Setup + Foundational** — small `parallel()` for T001/T002/T004; then T003 (controller+route+mount) and T005 (home shell + `/` swap). Barrier so the endpoint + page shell exist before tiles.
2. **Pure-logic fan-out (test-first, red→green)** — one agent per pure module + its unit test: `todayCard`, `weekOverview`, `sessionStreak`, `metricsView`, `dashboardAlerts` (after `sessionStreak`), `dashboardView`. Independent files → high parallelism. **Adversarially verify** the two riskiest: `aggregateAlerts` (fixed priority + top-3 cap + exactly-five) and `sessionStreak`/`missedScheduledDays` (rest-skip, future-not-counted, programStart floor, schedule-aware missed count) — spawn skeptic agents that try to refute against research D-3/D-4; repair on a majority refute.
3. **Controller wiring (single owner, serialized)** — one agent owns `dashboard.controller.js` and lands T013→T023→T030→T035 in order (fan-out of reads, signal-building, presenter calls). Then the contract + integration tests (T008/T009/T019/T027/T033) fan out.
4. **Frontend** — components (TodaySessionCard, WeekStrip, MetricCard, AlertList, QuoteCard) fan out in parallel; one agent owns `DashboardHome.jsx` and lands the render edits T016→T025→T032→T037 in order; frontend smokes (T010/T020/T028/T034) alongside.
5. **Polish + verify** — T038–T041 as a final fan-out; run the full suite and an adversarial pass against SC-001…SC-011 and the Constitution gates (read-only/no-write, no `@supabase` outside dataAccess, no engine/audit, tenant scoping).

**Effort**: treat each pure module + its tests at xhigh effort (exhaustive edge cases — cold start, rest days, future days, exactly-3-vs-4 alerts, deficit boundary, streak gaps). Lean on adversarial verification for the alert priority/cap and the schedule-aware streak/missed-day math.
