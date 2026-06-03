---
description: 'Task list — Phase 9: Recovery & Wellbeing'
---

# Tasks: Phase 9 — Recovery & Wellbeing

**Input**: Design documents from `/specs/012-phase9-recovery-wellbeing/`
**Prerequisites**: plan.md ✅, spec.md ✅ (clarified 2026-06-03), research.md ✅ (D-1…D-8), data-model.md ✅, contracts/openapi.yaml ✅, quickstart.md ✅

**Tests**: REQUIRED. Constitution V mandates test-first (red→green→refactor) for every status-/number-/recommendation-producing function — the alert evaluator, trend assemblers, chart geometry, and presenters all qualify. Contract + integration + frontend-smoke tests follow the Phase 7/8 live-gated, probe-and-skip pattern.

**Organization**: Tasks are grouped by the three user stories from spec.md so each can be implemented and tested independently:

- **US1 (P1)** — Log today's recovery in 30 seconds (the check-in)
- **US2 (P2)** — Get smart recovery alerts
- **US3 (P3)** — See recovery trends over time

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (Setup, Foundational, Polish carry no story label)
- Every task names exact file path(s). Paths are repo-relative to `/Users/ahmedbengarali/Projects/MassLab`.

## Path Conventions

Web app, existing Phase 0–8 layout: backend at repo root (`routes/`, `controllers/`, `services/`, `config/`, `supabase/migrations/`), tests under `tests/{unit,contract,integration,frontend,rls}`, frontend under `frontend/src/`. **No new dependency. 1 migration / 0 new tables.**

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config keys + the schema change every story reads/writes.

- [x] T001 Add the `RECOVERY_*` config keys to `config/schema.js` (zod, with defaults per research D-8): `RECOVERY_TREND_DAYS` (30), `RECOVERY_STRESS_HIGH` (7), `RECOVERY_STRESS_HIGH_DAYS` (3), `RECOVERY_SLEEP_LOW_HOURS` (6), `RECOVERY_ENERGY_LOW` (4), `RECOVERY_LOW_WINDOW_DAYS` (3), `RECOVERY_REST_SIGNALS` (3), `RECOVERY_SORE_ZONES_REST` (4), `RECOVERY_MOOD_OPTIONS` (csvList default `great,good,ok,low,bad`), `RECOVERY_SORE_ZONES` (csvList default the 13-zone list). Confirm each appears in `.env.example` (already added) and add `.refine(n>0)` guards to the numeric thresholds like the Phase 7/8 keys.
- [x] T002 [P] Create the forward-only migration `supabase/migrations/20260603000006_extend_recovery_log_phase9.sql` — `ALTER TABLE public.recovery_log ADD COLUMN IF NOT EXISTS sleep_quality int CHECK (sleep_quality is null or sleep_quality between 1 and 5)`, `… ADD COLUMN IF NOT EXISTS mood text`, `… ADD COLUMN IF NOT EXISTS sore_zones text[] NOT NULL DEFAULT '{}'`. No new table, no `create policy` (Phase 0 `recovery_log_*_own` RLS already covers added columns). Per data-model.md §1.

**Checkpoint**: Config validated at boot; migration ready to apply (live tests probe-and-skip on `recovery_log.sleep_quality` until applied).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The DAO, the read-only session reader, the router/controller skeleton, and the frontend API client that all three stories build on.

**⚠️ CRITICAL**: No user-story endpoint work can begin until this phase is complete.

- [x] T003 [P] Create `services/dataAccess/recovery.dao.js` — `recoveryDao(supabase)` with `getForDay(athleteId, loggedOn)`, `upsert(athleteId, loggedOn, fields)` (`onConflict: 'athlete_id,logged_on'`; builds the payload from only the keys present so partial saves never substitute omitted fields — FR-003; `sore_zones: []` is an explicit value), and `listRange(athleteId, { from, to })` (ascending). Every query filtered by `athlete_id` (Constitution I); errors → `HttpError(500,'DB_ERROR',…)`. Per data-model.md §3a.
- [x] T004 [P] Extend `services/dataAccess/sessions.dao.js` with a read-only `dailyTrainingVolumes(athleteId, { from, to })` returning finished sessions (`ended_at IS NOT NULL`, in range) as `[{ ended_at, total_volume_kg }]`. Never writes (FR-018, research D-7). Per data-model.md §3b.
- [x] T005 Create `routes/recovery.routes.js` (`recoveryRoutes({ daos, config })` → `GET /checkin`, `PUT /checkin`, `GET /alerts`, `GET /trends`) and `controllers/recovery.controller.js` skeleton (`recoveryController({ daos, config, now = () => new Date() })` exporting the four handlers; include the shared date helpers `isRealIsoDate`/`isoDay`/`resolveDateParam`/`parse` mirroring `controllers/supplements.controller.js`, and import `isoWeekStart`/`isCurrentIsoWeek` from `services/supplements/week.js` — research D-2/D-6). Wire `recovery: recoveryDao(sb)` into the `daos` map and mount `v1.use('/recovery', recoveryRoutes({ daos: resolved, config }))` in `app.js`. Handlers may return `501`/stubs until their story implements them. (Depends on T003, T004.)
- [x] T006 [P] Create `frontend/src/lib/recoveryApi.js` — thin `fetch` wrappers over the existing `api.js` helper for `getCheckin(date)`, `putCheckin(body)`, `getAlerts()`, `getTrends(month)`, mirroring `supplementsApi.js`.

**Checkpoint**: Foundation ready — the three stories can now proceed (largely in parallel).

---

## Phase 3: User Story 1 — Log today's recovery in 30 seconds (Priority: P1) 🎯 MVP

**Goal**: A single per-day check-in (sleep quality stars, hours slept, stress, energy, mood, sore zones) that upserts one row per day, is editable only within the current ISO week, and renders saved state on reload.

**Independent Test**: Open `/recovery`, set all fields + tap several body zones, save; reload → values persist; change one + save → same row updated (no dup); future date → 422; a prior-week day → 422; out-of-range/unknown value → 400; empty sore-zones → saved as "no soreness".

### Tests for User Story 1 (write first, ensure they FAIL) ⚠️

- [x] T007 [P] [US1] Unit test `tests/unit/recovery.checkinView.test.js` — `build({ row, date, editable, moodOptions, soreZoneList })` produces the saved values (or `checkin:null` when empty), the `editable` flag, and `options.{moods,sore_zones}`; no I/O. (data-model.md §5a)
- [x] T008 [P] [US1] Contract test `tests/contract/recovery.checkin.contract.test.js` — drives `GET /recovery/checkin` and `PUT /recovery/checkin` against `contracts/openapi.yaml` (Supertest); live-gated, **probes for `recovery_log.sleep_quality` and skips** until the migration is applied (Phase 7/8 pattern).
- [x] T009 [P] [US1] Integration test `tests/integration/recovery.checkin.integration.test.js` — PUT upsert → one row per `(athlete,day)`; partial save stores only provided fields (SC-003); `sore_zones:[]` preserved vs no-row; re-save updates in place (SC-002); future date → 422 `FUTURE_DATE`; prior-ISO-week day → 422 `OUTSIDE_EDIT_WINDOW`; bad rating/mood/zone → 400. **Snapshot-and-restore the current-week row(s)** so real data is never destroyed (Phase 8 pattern).
- [x] T010 [P] [US1] Frontend smoke `tests/frontend/RecoveryHome.test.jsx` (RTL+jsdom) — fill + save persists; reload shows saved values; body-diagram tap toggles a zone; mood picker selects one; empty-state renders without error; a prior-week (non-editable) day disables save.

### Implementation for User Story 1

- [x] T011 [US1] Implement `services/recovery/checkinView.js` (pure presenter) per data-model.md §5a — make T007 pass.
- [x] T012 [US1] Implement `getCheckin` + `putCheckin` in `controllers/recovery.controller.js`: GET resolves the date (default today), reads `recovery.dao.getForDay`, computes `editable = isCurrentIsoWeek(date, today)`, and returns `checkinView.build(...)` with config-driven mood/zone options. PUT validates with a zod schema (sleep_quality 1–5, sleep_hours 0–24, energy/stress 0–10, mood ∈ `RECOVERY_MOOD_OPTIONS`, each `sore_zones` ∈ `RECOVERY_SORE_ZONES`, all optional except `logged_on`), enforces `isRealIsoDate` → 400, future → 422 `FUTURE_DATE`, non-current-week → 422 `OUTSIDE_EDIT_WINDOW`, then `recovery.dao.upsert`. Clock read once via `now()` at the boundary. Runs NO engine (FR-020). Makes T008/T009 pass.
- [x] T013 [P] [US1] Create `frontend/src/components/recovery/BodyDiagram.jsx` — hand-rolled clickable SVG; tap toggles a zone in/out of the selected set; zone list comes from the `options.sore_zones` returned by the API (no hardcoded list). Tailwind tokens; large hit targets (Constitution VI).
- [x] T014 [P] [US1] Create `frontend/src/components/recovery/MoodPicker.jsx` — emoji row over `options.moods` from the API; single-select; Tailwind tokens.
- [x] T015 [US1] Create `frontend/src/pages/recovery/RecoveryHome.jsx` — the 30-second check-in form (star rating for sleep quality, sliders for hours/stress/energy with ±buttons, `MoodPicker`, `BodyDiagram`, optional note), loads via `recoveryApi.getCheckin`, saves via `putCheckin`; disables editing when `editable===false`; designed empty state. Uses the Frontend Design skill + Tailwind tokens. Makes T010 pass.
- [x] T016 [US1] Wire the `/recovery` route and the "Récupération" nav entry in `frontend/src/App.jsx` (mirroring the "Suppléments" wiring).

**Checkpoint**: US1 is a fully usable MVP — the athlete can log and re-edit today's recovery.

---

## Phase 4: User Story 2 — Get smart recovery alerts (Priority: P2)

**Goal**: Deterministic, configurable advisory alerts (high-stress/cortisol, reduce-volume, full-rest) derived from recent check-ins, shown on the recovery screen and never altering any plan.

**Independent Test**: Seed a triggering window for each rule → its alert appears with the right `kind`; seed a healthy window → `all_clear:true`; seed a too-thin window → that rule stays silent; confirm no write to any plan/engine.

### Tests for User Story 2 (write first, ensure they FAIL) ⚠️

- [x] T017 [P] [US2] Unit test `tests/unit/recovery.alerts.test.js` — `evaluateAlerts(recentCheckins, { asOf, thresholds })`: high-stress fires at ≥7 for ≥3 consecutive check-in days and not at 2; reduce-volume fires when avg sleep ≤6 AND avg energy ≤4 over the window (and not when only one holds); full-rest fires at ≥3 poor signals in a day OR ≥4 sore zones; each rule is suppressed on a thin window (FR-011); output is ordered; pure (no clock/I/O). (data-model.md §4a, research D-4)
- [x] T018 [P] [US2] Unit test `tests/unit/recovery.alertsView.test.js` — `build({ alerts })` sets `all_clear` true on empty and shapes alert view models.
- [x] T019 [P] [US2] Contract test `tests/contract/recovery.alerts.contract.test.js` — `GET /recovery/alerts` against the contract; live-gated probe-and-skip.
- [x] T020 [P] [US2] Integration test `tests/integration/recovery.alerts.integration.test.js` — seed check-ins that trigger each rule and assert the returned alert kinds; seed a healthy/thin window → all-clear/silent. Snapshot-and-restore seeded current-week rows.
- [x] T021 [P] [US2] Frontend smoke `tests/frontend/RecoveryAlerts.test.jsx` — renders seeded alerts severity-styled and the all-clear state without error.

### Implementation for User Story 2

- [x] T022 [P] [US2] Implement `services/engine/recoveryAlerts.js` (pure) per data-model.md §4a — make T017 pass. No `Date.now()`/globals; thresholds + `asOf` injected.
- [x] T023 [P] [US2] Implement `services/recovery/alertsView.js` (pure) per data-model.md §5b — make T018 pass.
- [x] T024 [US2] Implement `getAlerts` in `controllers/recovery.controller.js`: read `recovery.dao.listRange` over the alert look-back window (max of the rule windows), resolve the `thresholds` object from `config`, call `evaluateAlerts({ asOf: today })`, return `alertsView.build(...)`. No engine/audit write (FR-012/FR-020). Makes T019/T020 pass.
- [x] T025 [US2] Create `frontend/src/components/recovery/RecoveryAlerts.jsx` (severity-styled cards + all-clear state, copy via the strings/locale seam) and mount it on `RecoveryHome.jsx` (loads via `recoveryApi.getAlerts`). Makes T021 pass.

**Checkpoint**: US1 + US2 both work independently — logging plus contextual guidance.

---

## Phase 5: User Story 3 — See recovery trends over time (Priority: P3)

**Goal**: Three read-only visuals — monthly energy heatmap, sleep-vs-performance scatter (sleep × finished-session volume), and a 30-day energy/stress/sleep overlay — each with a clear empty/low-data state.

**Independent Test**: With check-ins across a month (and some finished sessions), the heatmap colors each day by energy (gaps uncolored), the scatter emits a point only for days with both a check-in and a session, and the overlay plots the three series; sparse history → empty states without error.

### Tests for User Story 3 (write first, ensure they FAIL) ⚠️

- [x] T026 [P] [US3] Unit test `tests/unit/recovery.trends.test.js` — `energyHeatmap` (null for un-logged days), `sleepPerformanceScatter` (point ONLY when a day has both a check-in and a session-volume entry — FR-014 / "missing pairs" edge case), `overlapSeries` (aligned arrays, gaps `null` not `0`). Pure. (data-model.md §4b)
- [x] T027 [P] [US3] Unit test `tests/unit/recovery.trendsView.test.js` — `build({ heatmap, scatter, overlap })` bundles the three with `has_data` flags for empty states (FR-016).
- [x] T028 [P] [US3] Unit test `tests/frontend/chartGeometry.recovery.test.js` — `calendarMonth({ year, month, weekStartsOn:1 })` lays out a known month into a Monday-start grid; `scatterPoints({ points, xScale, yScale })` maps data → `{cx,cy}`. (data-model.md §8)
- [x] T029 [P] [US3] Contract test `tests/contract/recovery.trends.contract.test.js` — `GET /recovery/trends` against the contract; live-gated probe-and-skip.
- [x] T030 [P] [US3] Integration test `tests/integration/recovery.trends.integration.test.js` — seed check-ins + finished sessions; assert per-day bucketing, scatter pairing (only complete pairs), and overlay alignment. Snapshot-and-restore seeded current-week rows.
- [x] T031 [P] [US3] Frontend smoke `tests/frontend/RecoveryTrends.test.jsx` — heatmap, scatter, and overlay render from stubs; each shows its empty/low-data state without error.

### Implementation for User Story 3

- [x] T032 [P] [US3] Implement `services/engine/recoveryTrends.js` (pure) per data-model.md §4b — make T026 pass.
- [x] T033 [P] [US3] Implement `services/recovery/trendsView.js` (pure) per data-model.md §5c — make T027 pass.
- [x] T034 [P] [US3] Extend `frontend/src/lib/chartGeometry.js` with pure `calendarMonth` + `scatterPoints` (reuse `linearScale`) per data-model.md §8 — make T028 pass.
- [x] T035 [US3] Implement `getTrends` in `controllers/recovery.controller.js`: resolve the month (default current), read `recovery.dao.listRange` over the trend window, read `sessions.dao.dailyTrainingVolumes` and bucket to `{ 'YYYY-MM-DD': total_volume_kg }`, call the three trend functions, return `trendsView.build(...)`. Read-only over sessions (FR-018). Makes T029/T030 pass.
- [x] T036 [P] [US3] Create `frontend/src/components/charts/CalendarHeatmap.jsx` (bespoke SVG, uses `calendarMonth`; color buckets by energy via Tailwind tokens; uncolored for null days).
- [x] T037 [P] [US3] Create `frontend/src/components/charts/ScatterPlot.jsx` (bespoke SVG, uses `scatterPoints` + `linearScale`/`niceTicks`).
- [x] T038 [US3] Create `frontend/src/pages/recovery/RecoveryTrends.jsx` — energy heatmap (`CalendarHeatmap`) + sleep-vs-performance scatter (`ScatterPlot`) + 30-day energy/stress/sleep overlay (reuse `components/charts/LineChart.jsx`: energy + stress on the shared 0–10 axis, sleep hours on a secondary right-hand axis); loads via `recoveryApi.getTrends`; designed empty states. Makes T031 pass.
- [x] T039 [US3] Wire the `/recovery/trends` route and a link from `RecoveryHome` / nav in `frontend/src/App.jsx`.

**Checkpoint**: All three stories complete and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T040 [P] RLS isolation test `tests/rls/recovery.policies.test.js` — a per-test JWT on the publishable-key client cannot read/write another athlete's `recovery_log` rows (incl. the new columns); live-gated like the other RLS suites (Constitution I defense-in-depth).
- [x] T041 [P] Verify `services/dataAccess/reset.dao.js` needs no change — `recovery_log` is already in `MODULE_TABLES.recovery` and `FULL_WIPE_ORDER`; add a brief assertion/comment confirming Phase 9's new columns are covered by the existing row delete.
- [x] T042 [P] Run the import-boundary lint (`npm run lint`) and confirm no `@supabase/supabase-js` import appears outside `services/dataAccess/*`; confirm `services/recovery/*` and `services/engine/recovery*` are pure.
- [x] T043 Document Phase 9 in `CLAUDE.md` — add a "Phase 9 — Recovery & Wellbeing" section (extends `recovery_log`; `/api/v1/recovery/*`; pure `services/recovery/` + `services/engine/recovery{Alerts,Trends}`; reuses `week.js` + `LineChart` + new `chartGeometry` helpers; no engine/audit on writes; current-ISO-week editable window; `RECOVERY_*` config keys), matching the Phase 7/8 entries.
- [x] T044 [P] Run the full suite (`npm test` + `npm --workspace frontend test`) and walk the `quickstart.md` steps end-to-end against the migrated DB; confirm all acceptance scenarios (SC-001…SC-010) hold.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** must finish before any story phase.
- **US1 (T007–T016)**, **US2 (T017–T025)**, **US3 (T026–T039)** depend only on Foundational and are otherwise **independent** — they touch disjoint engine/presenter/page files. The only shared mutable files are `controllers/recovery.controller.js` (each story adds its own handler — sequence the handler edits T012 → T024 → T035 or have one agent own the controller) and `frontend/src/App.jsx` (T016 then T039 — sequence these two).
- Within a story: **tests first** (must fail), then pure modules, then the controller handler, then frontend.
- **Polish (T040–T044)** last.

### Story dependency notes

- US2's alerts and US3's trends both read the check-ins US1 writes, but each is testable in isolation by seeding `recovery_log` directly — no code dependency on US1's frontend.

## Parallel Execution Examples

- **Foundational fan-out**: T003, T004, T006 in parallel (distinct files); T005 after T003/T004.
- **US1 tests fan-out**: T007, T008, T009, T010 together; then T011/T012 (backend) parallel with T013/T014 (components), then T015, then T016.
- **Cross-story fan-out** (after Foundational): the pure-logic + test pairs of all three stories — T007/T011, T017/T022, T026/T032, T028/T034 — are independent files and can be built concurrently; serialize only the shared `controller`/`App.jsx` edits.

## Implementation Strategy

- **MVP = US1** (T001–T016): a working daily check-in is independently shippable and delivers the core value.
- **Increment 2 = US2**, **Increment 3 = US3** — each adds a self-contained surface without touching the others' logic.

---

## Ultracode Execution Strategy (workflows + xhigh effort)

This task list is shaped for multi-agent **workflow** orchestration at maximum effort. To run it that way, invoke with the `ultracode` opt-in (e.g. start the implementation request with **`ultracode`**, or say "use a workflow") so the harness authors a `Workflow` script; otherwise `/speckit-implement` executes the tasks sequentially.

**Recommended workflow shape** (one phase = one fan-out, read results between phases):

1. **Setup + Foundational** — run T001–T006 as a small `parallel()` fan-out (T003/T004/T006 concurrent; T005 after). Barrier before stories so every story sees the DAO, router, and API client.
2. **Test-author fan-out (red)** — `pipeline()` the three stories: one agent per test file (T007–T010, T017–T021, T026–T031) writing failing specs. Independent files → high parallelism. **Completeness critic**: a final agent checks every FR/SC in spec.md maps to at least one test.
3. **Pure-logic fan-out (green)** — one agent each for `recoveryAlerts`, `recoveryTrends`, the three presenters, and the two `chartGeometry` helpers (T011, T022/T023, T032/T033/T034). These are pure and conflict-free → run concurrently. **Adversarially verify** each engine module: spawn skeptic agents that try to refute the alert/trend math against the clarified defaults (stress≥7/≥3d, sleep≤6 & energy≤4, ≥3 signals / ≥4 zones, scatter only on complete pairs) — kill any finding ≥majority refute.
4. **Controller + frontend** — serialize the three controller-handler edits (T012→T024→T035) and the two `App.jsx` edits (T016→T039) since they share files; everything else (components, pages, charts) fans out. Use `isolation:'worktree'` only if agents would otherwise write the controller concurrently.
5. **Polish + verify** — T040–T044 as a final fan-out; run the full suite and an adversarial pass against SC-001…SC-010 and the Constitution gates (tenant scoping, no `@supabase` outside dataAccess, no engine/audit on recovery writes, charts test-first).

**Effort**: treat every pure module and its tests at xhigh effort (exhaustive edge cases — thin windows, gaps-as-null, empty sore-zones, future/prior-week rejection, leap/rollover dates). Lean on adversarial verification for the alert thresholds and the scatter-pairing rule, which are the easiest places to get subtly wrong.
