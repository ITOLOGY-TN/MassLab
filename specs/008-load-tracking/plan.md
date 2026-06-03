# Implementation Plan: Phase 5 — Load Tracking & Progression Algorithm

**Branch**: `008-load-tracking` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-load-tracking/spec.md`

## Summary

Phase 5 is the **expert read-and-visualize layer** over the data Phase 4 now writes and the Phase 1 engine persists. It ships three read-only screens — a **progression overview** (one row per exercise: current load, all-time record, last-session volume, estimated-1RM trend, and a four-state status badge), a **per-exercise detail** (load-over-time line with all-time-record annotation + dotted 8-week projection, volume-per-session bars, last-10 table, current estimated 1RM), and a **phase-comparison radar** (average working load per muscle group per training phase).

It introduces **no training capture and no new training math**. The status badges read the persisted `progression_flags`; the load/1RM series and all-time record come straight from `one_rep_max_records` (Phase 4 writes one row per exercise per finished session); volume and the last-10 table come from `session_sets`. The only genuinely new logic is **presentation math**, all pure and test-first (Constitution V): a least-squares 8-week projection + a 30-day estimated-1RM trend (`services/engine/trendProjection.js`), the 5-flags→4-badges+deload status map, the per-phase radar averaging, and the SVG chart geometry helpers. Charts are **hand-rolled SVG** (no charting dependency) so the look stays premium and the geometry stays unit-testable. Backend adds **three composed `/api/v1/load-tracking/*` read endpoints**, a pure `services/loadTracking/*` presenter boundary, two read-only DAO methods, and **zero migrations**. Frontend adds one `/load-tracking` route tree with three views and a small `components/charts/*` set built on pure geometry.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–4; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. Presenters and engine helpers are pure JavaScript reusing Phase 1/3/4 modules (`oneRepMax`, `exerciseHistory`, `currentPhase`).
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — the load line, volume bars, dotted projection, and radar are bespoke SVG over pure geometry helpers (research D-9). `@dnd-kit/*` (Phase 2) is not needed.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 5 ships 0 migrations and 0 new tables** — it is pure read composition over `one_rep_max_records`, `session_journal_entries`, `session_sets`, `progression_flags`, `exercises`, `weekly_plan_slots`, `muscle_groups`, `training_phases`, and `athletes.program_start_date`.

**Testing**: Vitest. Per Constitution V, every number-producing function is unit-tested first (red → green → refactor):

- `services/engine/trendProjection.js` (new, pure): `oneRmSeries(records)`, `trendDirection({ series, windowDays, now })` (signed % change + flat band, D-3), `projectOneRm({ series, weeksAhead, minPoints, now })` (least-squares fit, ≥3 points, D-2).
- `services/loadTracking/statusMap.js` (new, pure): `overviewStatus({ exerciseFlagType, muscleGroupFlagType })` → 4 badges; deload surfaced separately (D-5).
- `services/loadTracking/{overviewView,exerciseProgressView,phaseRadarView}.js` (new, pure presenters): assemble the view models from synthetic DAO output with **no I/O**, including empty/low-data shapes.
- `services/sessionJournal/currentPhase.js` (extended): a new test pins `phaseForDate` (D-7) and that `currentTrainingPhase` still delegates correctly.
- `frontend/src/lib/chartGeometry.js` (new, pure): `linearScale`, `linePath`, `barRects`, `radarPolygon`, `niceTicks` — geometry asserted against fixed inputs (D-9).
- Contract: every `/api/v1/load-tracking/*` path in `contracts/openapi.yaml` via Supertest (live-gated, skips offline).
- Integration: seed a couple of finished sessions → assert overview status/record/volume, exercise series/projection threshold, and phase attribution; cleans up.
- Frontend smoke (RTL + jsdom): overview renders rows + statuses; detail renders charts from a stub series and shows the "<3 sessions" projection empty state; radar renders axes/series; low-data empty states.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–4 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 5 adds one pure service sub-directory `services/loadTracking/` (presenters, mirroring `services/trainingProgram/`), one new pure `services/engine/` helper, and a frontend `components/charts/` + `lib/chartGeometry.js`. All Supabase imports stay in `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Overview assembly ≤ 600 ms server-side: a small bounded set of indexed reads — `one_rep_max_records.seriesForAthlete` (one query), active `progression_flags` (one query), exercises + slots + muscle groups, and one most-recent-session volume read per exercise.
- Exercise detail assembly ≤ 500 ms: the exercise's 1RM series (one query) + a last-10 session-volume rollup (one query).
- Phase comparison ≤ 700 ms: the full `seriesForAthlete` (one query) bucketed in-memory by `phaseForDate`.
- Charts render on the client from already-composed series; geometry is O(points). No chart computation blocks the server.

**Constraints**:

- **Read-only** (FR-022): Phase 5 writes nothing and never re-runs the engine; it reads the flags/records persisted on Phase 4 session finish. The DAO additions are read methods only.
- **No engine reinvention**: 1RM = the persisted `primary_estimate_kg`; status = persisted `progression_flags`; "current load" = `exerciseHistory.lastWeightUsed`. The only new math is presentation (trend %, least-squares projection, per-phase averaging, SVG geometry), all pure and tested.
- **Determinism**: all new engine/presenter/geometry functions are pure — caller supplies `now`; no `Date.now()`/random/globals inside pure functions.
- **Cross-screen consistency** (FR-023, SC-002/SC-003): current load, estimated 1RM, and status are sourced from the same persisted values the Session Journal and Training Program show, so no figure contradicts another screen.
- **Tenant scoping** (Constitution I): every read is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body. No new table ⇒ no new RLS (existing policies already cover every table read).
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/loadTracking/*`, `services/engine/*`, and `frontend/src/lib/chartGeometry.js` take injected data and never import the client; dependency direction is `controllers → loadTracking (+ engine) → dataAccess`.
- **No AI**: trends, projections, and radar are deterministic functions of logged data (no prediction model), consistent with the project's no-AI boundary.

**Scale/Scope**: 1 athlete; 0 new tables / migrations; 3 new `/api/v1/load-tracking/*` endpoints; 2 read-only DAO methods; ~1 new engine helper + 4 presenters + 1 frontend geometry lib + 3 chart components; ~1,300 LOC backend; ~1,900 LOC frontend (3 views + 3 chart components + geometry); ~1,700 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. No new table; every read is parameterised by `req.athleteId` and hits tables already RLS-protected. No endpoint trusts a caller-supplied tenant id. No schema change ⇒ no RLS change.

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; the controller orchestrates; the new `services/loadTracking/*` presenters, `services/engine/trendProjection.js`, and `frontend/src/lib/chartGeometry.js` are pure (no I/O, no globals, caller-supplied `now`); the only new Supabase-touching code is two read methods on existing DAOs. The frontend reaches every surface through `/api/v1/` and never touches the secret key.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. No new config is required; thresholds that shape output (projection horizon 8 weeks, ≥3-point floor, 30-day trend window, flat dead-band) are documented constants in the pure helpers, and the engine's existing constants (`on_pace_pct_per_month`, increments) are resolved through `resolveConstants`. No athlete data, URLs, or secrets in source.

- **IV. Versioned API Contract** — **PASS**. All new endpoints live under `/api/v1/load-tracking` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the Phase 0 canonical error envelope, and are additive within v1. They are pure reads (200 / 404), no breaking change to any existing contract.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every number surfaced is produced by a pure function tested first: `trendProjection` (trend %, least-squares projection), `statusMap` (flag→badge mapping), the three presenters (assembly + empty-state shapes), `phaseForDate`, and `chartGeometry` (scales/paths/polygon). 1RM and progression reuse the already-tested Phase 1/4 output. UI views are exempt from strict TDD but ship smoke tests.

- **VI. Athlete-First UX** — **PASS**. Each screen answers a real post-session question (where am I across my program / how is this lift trending / how did each block compare). Frontend goes through the Frontend Design skill on the existing Tailwind tokens; the bespoke SVG charts (rather than a generic chart library) keep the premium, sport-focused look the constitution demands. Empty/low-data states are designed, not blank. (No journal/auto-save flow is introduced — those Principle-VI standards do not apply here.)

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables and only read-only DAO methods; every figure traces to an existing athlete-scoped table.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; reads only.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, presentation math inside pure `services/loadTracking/*` + `services/engine/*`, and chart geometry inside the pure `frontend/src/lib/chartGeometry.js`; no `models/` directory is added.
- Performance budgets hold: each screen is a small bounded set of indexed reads plus O(points) in-memory composition; charts render client-side.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/008-load-tracking/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-02)
├── research.md          # Phase 0 of plan — D-1…D-11 decisions + rationale
├── data-model.md        # Phase 1 of plan — read composition (0 migrations) + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 3 screens
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — 3 read endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 5 extends the Phase 0–4 layout. **Bold** = new in Phase 5; everything else already exists.

```text
masslab/
├── routes/
│   └── loadTracking.routes.js              # NEW: GET /overview, /exercises/:id, /phase-comparison
├── controllers/
│   └── loadTracking.controller.js          # NEW: thin orchestration → pure presenters
├── services/
│   ├── engine/
│   │   ├── trendProjection.js              # NEW pure: oneRmSeries, trendDirection, projectOneRm
│   │   ├── oneRepMax.js                    # reused (estimate source)
│   │   └── exerciseHistory.js              # reused (lastWeightUsed / heaviestCompletedSet)
│   ├── loadTracking/                       # NEW pure presenter boundary
│   │   ├── statusMap.js                    # 5 flags → 4 badges + deload notice (D-5)
│   │   ├── overviewView.js                 # compose overview rows
│   │   ├── exerciseProgressView.js         # compose series + last-10 + 1RM + record + projection
│   │   └── phaseRadarView.js               # avg working load per muscle group / phase (D-8)
│   ├── sessionJournal/
│   │   └── currentPhase.js                 # EXTENDED: extract phaseForDate; currentTrainingPhase delegates (D-7)
│   └── dataAccess/
│       ├── oneRepMaxRecords.dao.js         # EXTENDED: seriesForAthlete (read)
│       ├── sessions.dao.js                 # EXTENDED: recentSessionVolumesForExercise (read)
│       ├── progressionFlags.dao.js         # reused: findActiveForAthlete
│       ├── exercises.dao.js                # reused
│       ├── weeklyPlan.dao.js               # reused (exercise → muscle group)
│       ├── muscleGroups.dao.js             # reused (radar axes)
│       ├── trainingPhases.dao.js           # reused (phase order/length)
│       └── athletes.dao.js                 # reused (program_start_date)
├── app.js                                  # EXTENDED: one line — v1.use('/load-tracking', loadTrackingRoutes(...))
└── frontend/src/
    ├── pages/loadTracking/
    │   ├── LoadOverview.jsx                 # NEW /load-tracking
    │   ├── ExerciseProgress.jsx             # NEW /load-tracking/exercises/:id
    │   └── PhaseComparison.jsx              # NEW /load-tracking/phases
    ├── components/charts/
    │   ├── LineChart.jsx                    # NEW (load line + record annotation + dotted projection)
    │   ├── BarChart.jsx                     # NEW (volume per session)
    │   └── RadarChart.jsx                   # NEW (phase comparison)
    ├── lib/
    │   ├── chartGeometry.js                 # NEW pure geometry (scales/paths/polygon) — unit-tested
    │   └── loadTrackingApi.js               # NEW thin wrappers (overview/exercise/phase-comparison)
    └── App.jsx                              # EXTENDED: /load-tracking route tree + "Charges" nav link
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–4. The architectural additions mirror Phase 3 exactly: a pure `services/loadTracking/` presenter boundary (so the controller stays thin and view assembly is unit-testable without I/O) and one new pure `services/engine/` helper for the only new numeric logic (trend + projection). Charts are a new pure-geometry-driven `components/charts/*` set rather than a third-party library, keeping the premium look and the geometry testable. `phaseForDate` is extracted from Phase 4's `currentTrainingPhase` so phase attribution has one source of truth.

## Complexity Tracking

> No Constitution Check violations. No entries required.
