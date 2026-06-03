---
description: 'Task list — Phase 6: Body Weight & Measurements'
---

# Tasks: Body Weight & Measurements (Phase 6)

**Input**: Design documents from `/specs/009-body-weight-measurements/`
**Prerequisites**: plan.md ✓, spec.md ✓ (clarified 2026-06-03), research.md ✓, data-model.md ✓, contracts/openapi.yaml ✓

**Status**: ✅ Implemented 2026-06-03 via ultracode workflow `wf_2daee0b3-694` (22 agents). Unit **272/272 green**, lint clean, US1 contract+integration **11/11 green** live against cloud Supabase. One adversarial finding (measurementDeltas gap-bridging) fixed in Polish. Two **pre-existing, out-of-scope** frontend test failures remain (`scaffold.test.jsx` Phase 0, `nutritionView.test.jsx` Phase 2) — not touched by this feature.

**Tests**: INCLUDED and REQUIRED. Constitution V (NON-NEGOTIABLE) mandates test-first (red → green → refactor) for every number-producing function. All `services/engine/*` and `services/bodyTracking/*` tasks have a failing unit test authored before implementation; contract + integration + frontend-smoke tests follow the Phase 0–5 pattern.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md) so each story is an independently testable, independently shippable increment. **MVP = US1.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Parallelizable — different files, no dependency on an incomplete task in the same wave.
- **[Story]**: US1–US4. Setup/Foundational/Polish carry no story label.
- Every task names exact file path(s). Paths are repo-root relative (web app layout per plan.md).

## Reuse baseline (do NOT rebuild — verified in plan/research)

- `body_measurements` table + `bodyMeasurements.dao.js` (`insert` = upsert-on-`(athlete_id,measured_on)`, `listForAthlete`, `latestForAthlete`) — **exists**.
- `POST /api/v1/body-measurements` controller — **exists**, already cascades to body-composition + program regen (FR-007).
- `athlete_photos` table (RLS + index) — **exists**; no DAO/routes yet.
- `photoStorage` adapter (`put/get/delete/url`), `/static/*` serving, multer `uploadSingle` 413/400 wrapper — **exists** (Phase 3 pattern).
- `frontend/src/components/charts/LineChart.jsx` + `frontend/src/lib/chartGeometry.js` (`linearScale/linePath/niceTicks`) — **exists** (Phase 5).
- **0 migrations. 0 new tables. 0 new dependencies.**

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Config + confirm the zero-migration assumption before any code.

- [x] T001 Add `BODY_PHOTO_MAX_BYTES` (int, default `26214400`) and `BODY_PHOTO_IMAGE_TYPES` (csv, default `image/jpeg,image/png,image/webp`) to `config/schema.js`, and list both in `.env.example` (research D-9).
- [x] T002 [P] Confirm zero-migration: verify `body_measurements` and `athlete_photos` exist with the columns + RLS `*_own` policies in `supabase/migrations/`; record the confirmation in `specs/009-body-weight-measurements/quickstart.md` ("Migrations: none"). No SQL is written.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared scaffolding every story mounts onto. **No user story can begin until this is done.**

**⚠️ CRITICAL**: Complete this phase first.

- [x] T003 Create `services/dataAccess/athletePhotos.dao.js` with `insert(row)`, `listForAthlete(athleteId)` (`taken_on` desc), `findById(athleteId, id)`, `delete(athleteId, id)` — every query filtered by `athlete_id`; error mapping mirrors existing DAOs (`HttpError(500,'DB_ERROR')`, not-found → `HttpError(404,'NOT_FOUND')`). (Shared by US1 upload + US4 gallery/delete.)
- [x] T004 Create `routes/bodyTracking.routes.js` (Router skeleton) and `controllers/bodyTracking.controller.js` (empty handler stubs: `weightChart`, `measurementsTable`, `listPhotos`, `uploadPhoto`, `deletePhoto`); add the multer instance + reuse the `uploadSingle` 413/400 wrapper bound to `BODY_PHOTO_MAX_BYTES`.
- [x] T005 Wire into `app.js`: add `athletePhotos: athletePhotosDao(sb)` to the `daos` object, import `bodyTrackingRoutes`, and mount `v1.use('/body-tracking', bodyTrackingRoutes({ daos: resolved, config, photoStorage }))` directly after the `/load-tracking` mount.
- [x] T006 [P] Frontend scaffold: `frontend/src/lib/bodyTrackingApi.js` (thin wrappers: `saveWeighIn`, `getHistory`, `getWeightChart`, `getMeasurementsTable`, `listPhotos`, `uploadPhoto`, `deletePhoto`); add the `/body`, `/body/measurements`, `/body/photos` route tree (placeholder pages) and a **"Corps"** nav `Link` in `frontend/src/App.jsx`.

**Checkpoint**: Router resolves, nav renders, photo DAO ready — stories can start in parallel.

---

## Phase 3: User Story 1 — Log a morning weigh-in (Priority: P1) 🎯 MVP

**Goal**: Athlete records weight + optional circumferences + note, optionally attaches a photo; one entry per day; body-composition cascade fires.

**Independent Test**: POST a weight-only weigh-in → persisted + retrievable via GET; POST again same day → updates (no duplicate); POST measurements+note → all persist; upload a photo for that date → stored + linked with weight overlay; POST empty body → 400; POST future date → 400.

### Tests (author first — must fail)

- [x] T007 [P] [US1] Unit test the at-least-one-value refine on `bodyMeasurementSchema` in `tests/unit/bodyMeasurementSchema.test.js` (weight-only ✓, single circumference ✓, note-only → reject, empty → reject) — FR-003.
- [x] T008 [P] [US1] Unit/contract test the future-date guard (inject "today"; `measured_on` > today → 400) in `tests/unit/bodyMeasurementsController.futureDate.test.js` — FR-005.
- [x] T009 [P] [US1] Contract test `POST /body-measurements` (201 shape) + `GET /body-measurements` (date-desc) against `contracts/openapi.yaml` in `tests/contract/bodyMeasurements.contract.test.js` (live-gated, skips offline).
- [x] T010 [P] [US1] Integration test in `tests/integration/weighIn.lifecycle.test.js`: upsert one-per-day; **partial re-save merges** (save weight+arm, then re-save weight-only for the same date → `arm_cm` is retained, M1/FR-002/FR-006); the 201 response carries `body_composition` + `program_id` (FR-007 cascade, U1); FR-003/FR-005 rejections; photo upload → `athlete_photos` row + stored file; **oversized upload (> `BODY_PHOTO_MAX_BYTES`) → 413 and non-image mimetype → 400** (SC-008/FR-010); cleans up.

### Implementation

- [x] T011 [US1] Add `.refine` to `bodyMeasurementSchema` in `services/engine/inputSchemas.js` rejecting a body with no `weight_kg` and no circumference (FR-003); keep existing range checks.
- [x] T012 [US1] Extend `controllers/bodyMeasurements.controller.js`: add `list(req,res,next)` (calls `daos.bodyMeasurements.listForAthlete(req.athleteId, { limit })`, default 365); add a future-date guard in `create` comparing `measured_on` to server today → `HttpError(400,'VALIDATION_FAILED')` (FR-005); on `create`, **merge before upsert** — fetch the existing row for `(athleteId, measured_on)` and overlay only the provided fields so a partial re-save never nulls stored circumferences (M1/FR-002/FR-006). Re-save never touches photos (D-4).
- [x] T013 [US1] Add `r.get('/', c.list)` to `routes/bodyMeasurements.routes.js` (POST already mounted).
- [x] T014 [US1] Implement `uploadPhoto` in `controllers/bodyTracking.controller.js`: validate mimetype ∈ `BODY_PHOTO_IMAGE_TYPES` (else 400), `photoStorage.put(req.athleteId, req.file.buffer, ext)`, insert via `daos.athletePhotos.insert({ athlete_id, taken_on, storage_key, weight_overlay_kg, note })`, return `{ data: <Photo> }` (201) with `url = photoStorage.url(storage_key)`; mount `r.post('/photos', uploadSingle(upload), c.uploadPhoto)` in `routes/bodyTracking.routes.js` (FR-009/FR-010, D-3).
- [x] T015 [US1] Build `frontend/src/pages/body/BodyHome.jsx` weigh-in form (date default today, weight, the 7 circumferences, note; one-handed-friendly large inputs, optional fields) submitting via `saveWeighIn`; add a separate "Ajouter une photo" upload control posting to `uploadPhoto` after save (D-3). Use Frontend Design skill + Tailwind tokens.
- [x] T016 [P] [US1] Frontend smoke test `tests/frontend/BodyHome.weighIn.test.jsx`: form submits weight; empty submit shows validation; photo control posts.

**Checkpoint**: US1 shippable — weigh-ins persist, photos attach, composition cascade verified. **This is the MVP.**

---

## Phase 4: User Story 2 — Weight curve over the program (Priority: P2)

**Goal**: Weight plotted across the program with goal line, ideal-progression zone, and phase markers; graceful with 0–1 points.

**Independent Test**: With a multi-week series, `GET /body-tracking/weight-chart` returns date-asc points matching entries, `goalKg` at target (null when unset), `zone` spanning start→target across program weeks (null when inputs missing), `phaseMarkers` at correct dates, `hasTrend=false` with <2 points.

### Tests (author first — must fail)

- [x] T017 [P] [US2] Unit test `services/engine/weightTrajectory.js` in `tests/unit/weightTrajectory.test.js`: `idealZone` band endpoints from fixed `{startKg,targetKg,startDate,totalWeeks,asOf}`, null when inputs missing; `phaseBoundaries` cumulative dates vs fixed phases (FR-018/FR-019).
- [x] T018 [P] [US2] Unit test `services/bodyTracking/weightChartView.js` in `tests/unit/weightChartView.test.js`: full view model; `hasTrend=false` at 0–1 points; zone/goal omitted gracefully (FR-016–FR-020).
- [x] T019 [P] [US2] Unit test the new band geometry in `tests/unit/chartGeometry.band.test.js`: `bandPath`/`areaBetween` produces a closed path from upper+lower point arrays.
- [x] T020 [P] [US2] Contract test `GET /body-tracking/weight-chart` in `tests/contract/bodyTracking.weightChart.contract.test.js`.

### Implementation

- [x] T021 [US2] Implement `services/engine/weightTrajectory.js` (`idealZone`, `phaseBoundaries`) — pure, caller-supplied `asOf`; `phaseBoundaries` reuses the cumulative-weeks logic shared with `services/sessionJournal/currentPhase.js` (`phaseForDate`).
- [x] T022 [US2] Implement `services/bodyTracking/weightChartView.js` composing points (from measurements) + `goalKg` + `zone` + `phaseMarkers` + `hasTrend` from injected `{ measurements, profile, phases }`.
- [x] T023 [US2] Extend `frontend/src/lib/chartGeometry.js` with a pure `bandPath`/`areaBetween` helper (keep existing exports intact).
- [x] T024 [US2] Implement `weightChart` in `controllers/bodyTracking.controller.js` (read `bodyMeasurements.listForAthlete(req.athleteId, { limit: 1000 })` — explicit high limit so the 5-month series is not truncated by the DAO default of 50, I1; plus `athletes.findById`, `trainingPhases.listForAthlete`; hand to the presenter) and mount `r.get('/weight-chart', c.weightChart)`.
- [x] T025 [US2] Render the curve in `frontend/src/pages/body/BodyHome.jsx` using the reused `LineChart` + `bandPath` (zone), goal line, and phase markers; design the "<2 entries — log more for a trend" state (FR-020/FR-027).
- [x] T026 [P] [US2] Frontend smoke test `tests/frontend/BodyHome.chart.test.jsx`: chart renders from a stub series; low-data empty state shows.

**Checkpoint**: US2 shippable independently of US3/US4.

---

## Phase 5: User Story 3 — Monthly measurements table (Priority: P3)

**Goal**: Circumferences by month, each with a signed month-over-month delta, color-coded; no misleading delta when a prior value is missing.

**Independent Test**: With ≥2 months logged, `GET /body-tracking/measurements-table` returns per-month latest values (D-5) and signed deltas vs prior month with `direction`; a missing prior value → `delta:null`; one month → values, no deltas, no error.

### Tests (author first — must fail)

- [x] T027 [P] [US3] Unit test `services/engine/measurementDeltas.js` in `tests/unit/measurementDeltas.test.js`: `monthlyLatest` picks the latest non-null per field per month (D-5); `monthOverMonthDeltas` signs + nulls (FR-022/FR-023).
- [x] T028 [P] [US3] Unit test `services/bodyTracking/measurementsTableView.js` in `tests/unit/measurementsTableView.test.js`: month rows, delta directions, single-month no-delta shape.
- [x] T029 [P] [US3] Contract test `GET /body-tracking/measurements-table` in `tests/contract/bodyTracking.measurementsTable.contract.test.js`.

### Implementation

- [x] T030 [US3] Implement `services/engine/measurementDeltas.js` (`monthlyLatest`, `monthOverMonthDeltas`) — pure.
- [x] T031 [US3] Implement `services/bodyTracking/measurementsTableView.js` composing `{ months: [{ month, fields }] }` from injected measurements.
- [x] T032 [US3] Implement `measurementsTable` in `controllers/bodyTracking.controller.js` (read `listForAthlete(req.athleteId, { limit: 1000 })` — explicit high limit so the full multi-month history is not truncated by the DAO default of 50, I1; hand to presenter) and mount `r.get('/measurements-table', c.measurementsTable)`.
- [x] T033 [US3] Build `frontend/src/pages/body/MeasurementsTable.jsx`: monthly table with up/down/flat color-coded deltas (FR-022) and graceful gaps (FR-023). Frontend Design skill + tokens.
- [x] T034 [P] [US3] Frontend smoke test `tests/frontend/MeasurementsTable.test.jsx`: deltas render with direction; missing-prior gap shows no delta.

**Checkpoint**: US3 shippable independently.

---

## Phase 6: User Story 4 — Progress photo gallery & comparison (Priority: P3)

**Goal**: Date-ordered photo grid with weight overlay; full-screen view; before/after side-by-side; delete removes row + file.

**Independent Test**: With photos on several dates, `GET /body-tracking/photos` lists date-desc with date + weight overlay; open full-screen; pick before+after for side-by-side; `DELETE /body-tracking/photos/:id` removes the gallery entry and the stored file; a date with no photo doesn't break the grid.

### Tests (author first — must fail)

- [x] T035 [P] [US4] Unit test `services/bodyTracking/photoGalleryView.js` in `tests/unit/photoGalleryView.test.js`: maps rows → `{ id, takenOn, weightKg, url, note }`, date-desc, handles empty.
- [x] T036 [P] [US4] Contract test `GET /body-tracking/photos` + `DELETE /body-tracking/photos/:id` (204; 404 when not owned) in `tests/contract/bodyTracking.photos.contract.test.js`.
- [x] T037 [P] [US4] Integration test `tests/integration/photos.lifecycle.test.js`: upload → list → delete; assert `athlete_photos` row gone and `photoStorage.get(key)` rejects (file removed); cleans up.

### Implementation

- [x] T038 [US4] Implement `services/bodyTracking/photoGalleryView.js` (inject `athletePhotos.listForAthlete` rows + `photoStorage.url`).
- [x] T039 [US4] Implement `listPhotos` and `deletePhoto` in `controllers/bodyTracking.controller.js`: `listPhotos` → presenter; `deletePhoto` → `findById` (404 if missing) then `daos.athletePhotos.delete` + best-effort `photoStorage.delete(storage_key)` → 204. Mount `r.get('/photos', c.listPhotos)` and `r.delete('/photos/:id', c.deletePhoto)`.
- [x] T040 [US4] Build `frontend/src/pages/body/PhotoGallery.jsx`: date-ordered grid with weight overlay (FR-024), full-screen lightbox (FR-025), before/after side-by-side selector (FR-026), delete with confirm (FR-012). Frontend Design skill + tokens.
- [x] T041 [P] [US4] Frontend smoke test `tests/frontend/PhotoGallery.test.jsx`: grid renders with overlay; opens full-screen; selects two for compare.

**Checkpoint**: US4 shippable independently.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [x] T042 [P] Extend `tests/integration/rls.policies.test.js` with per-test-JWT probes confirming `body_measurements` and `athlete_photos` `*_own` policies block cross-tenant read/write (SC-009).
- [x] T043 [P] Units display (FR-028): apply the existing kg/lbs preference as a display-only conversion across BodyHome/MeasurementsTable/PhotoGallery; assert stored/API values stay metric.
- [x] T044 [P] Empty-state pass (FR-027/SC-007): confirm chart, table, and gallery each render a designed empty state with zero data — add a frontend smoke assertion per screen.
- [x] T045 [P] Run `npm run lint` + Prettier; fix `services/bodyTracking/*`, `services/engine/*`, controllers, routes, and `frontend/src/pages/body/*`.
- [x] T046 Full-suite green gate: `npm test` (unit/contract/integration) + `npm run test:frontend`; verify the quickstart curls end-to-end against the running app.

---

## Dependencies & Execution Order

- **Setup (T001–T002)** → **Foundational (T003–T006)** block everything.
- **US1 (T007–T016)** is the MVP; do first. It delivers the photo DAO consumers + capture.
- **US2 (T017–T026)**, **US3 (T027–T034)**, **US4 (T035–T041)** depend only on Foundational — after the MVP they can proceed **in parallel** (disjoint files: `weightTrajectory`/`weightChartView` vs `measurementDeltas`/`measurementsTableView` vs `photoGalleryView`; disjoint frontend pages; each adds its own controller method + route line).
- Within each story: **tests authored first (red)** → engine/presenter → controller+route → frontend → smoke.
- **Polish (T042–T046)** last.

Shared-file note: US2/US3/US4 each append one method to `controllers/bodyTracking.controller.js` and one route line to `routes/bodyTracking.routes.js`. If run in parallel by separate agents, serialize the final mount edits (or isolate via worktrees) to avoid collisions — the presenter/engine/page files are fully disjoint and safe to parallelize.

## Parallel Execution Examples

- **Foundational wave**: T006 ‖ (T003 → T004 → T005). T003/T004/T005 touch backend wiring sequentially; T006 is independent frontend scaffold.
- **US1 tests**: T007 ‖ T008 ‖ T009 ‖ T010 (distinct test files).
- **Post-MVP stories**: the entire US2, US3, US4 test+impl sets run as three parallel tracks (one agent each), converging only at the shared route/controller mount edits and Polish.

## Implementation Strategy

- **MVP** = Phases 1–3 (Setup + Foundational + US1). Ship the weigh-in + photo capture; it already feeds the dashboard weight metric and the composition cascade.
- **Increment 2** = US2 (the headline chart).
- **Increment 3** = US3 ‖ US4 in parallel.
- **Finalize** = Polish.

---

## Ultracode Execution Guide (Workflow + extra-high effort)

> Requested: drive `/speckit-implement` for this feature via the **Workflow** tool (multi-agent "ultracode" orchestration) at **extra-high effort**, with adversarial verification. This section maps the tasks above onto a workflow so an agent can author it directly. Ultracode is opt-in — only run it when the user has said "ultracode" / "use a workflow" for the implement step.

**Phase → workflow shape**:

1. **Phase A — Setup + Foundational (barrier)**: a single sequenced track does T001→T006 (config, photo DAO, router skeleton, app wiring, frontend scaffold). These mutate shared wiring (`app.js`, `config/schema.js`, `App.jsx`) so they are **not** parallelized. One agent, verified before fan-out.

2. **Phase B — US1 MVP (test-first pipeline)**: `pipeline` per US1 task-group — stage 1 authors the failing tests (T007–T010), stage 2 implements (T011–T016), stage 3 runs the targeted suite and reports red→green. Gate: MVP must be green before Phase C.

3. **Phase C — US2 ‖ US3 ‖ US4 (parallel tracks, xhigh)**: three independent tracks via `parallel`, each its own test-first pipeline. **Isolate file collisions**: give each track `isolation: 'worktree'` OR serialize the two shared edits (the per-story method on `bodyTracking.controller.js` + route line) in a short barrier after the tracks return. Engine/presenter/page files are disjoint and run fully concurrent.

4. **Phase D — Adversarial verification (per pure-math task)**: for every `services/engine/*` and `services/bodyTracking/*` function (idealZone, phaseBoundaries, monthlyLatest, monthOverMonthDeltas, the three presenters, `bandPath`), spawn 2–3 independent skeptic agents prompted to **refute** the implementation against the spec's acceptance scenarios + edge cases (future date, missing prior month, <2 points, unset target, missing program-start). Majority-refute → kick back to the implementing track. This is the "x-high effort" core — the numbers are the product (Constitution V), so they get the deepest scrutiny.

5. **Phase E — Polish + full-suite gate (barrier)**: T042–T046 after all tracks confirmed; one agent runs lint + the complete `npm test` / `test:frontend` and the quickstart curls, reporting the final green state.

**Effort knobs**: run finder/verifier agents at high reasoning effort; prefer perspective-diverse verifiers (correctness lens, edge-case lens, cross-screen-consistency lens) over identical retries. Log any task dropped or capped — never silently truncate coverage.

**Determinism guard for verifiers**: all engine/presenter functions take a caller-supplied `asOf`/`now`; verifiers MUST pass fixed timestamps (no `Date.now()`), matching the unit tests.
