# Implementation Plan: Phase 6 — Body Weight & Measurements

**Branch**: `009-body-weight-measurements` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-body-weight-measurements/spec.md`

## Summary

Phase 6 is the **physical-transformation tracking layer**. It ships four athlete-facing surfaces: a **morning weigh-in form** (weight + optional circumferences + note + an optional progress photo), a **weight curve** across the 5-month program with an ideal-progression zone / goal line / phase markers, a **monthly measurements table** with month-over-month deltas, and a **dated photo gallery** with full-screen and before/after comparison.

It introduces **no new physiological math and 0 migrations**. The weigh-in record is the existing `body_measurements` table (one row per athlete per day, upsert-on-conflict) whose `POST` already cascades to the Phase 1 body-composition estimate + program regeneration. Progress photos use the already-scaffolded `athlete_photos` table (which has had no DAO/routes until now). The only genuinely new logic is **presentation math**, all pure and test-first (Constitution V): the ideal-progression-zone band + phase-boundary dates (`services/engine/weightTrajectory.js`), the latest-per-month value + signed month-over-month deltas (`services/engine/measurementDeltas.js`), three composed presenters (`services/bodyTracking/*`), and one new pure SVG band helper added to the Phase 5 `chartGeometry.js`. Per the 2026-06-03 clarifications: photo upload/delete is a **dedicated action separate** from saving the weigh-in numbers (mirroring the Phase 3 exercise-media pattern), re-saving a day **keeps** its photo, and the monthly table uses the **latest entry in each month**.

Backend adds the progress-photo DAO/controller/router, a history `GET` + composed reads under `/api/v1/body-tracking/*`, two pure engine helpers, three pure presenters, two config keys, and two small validation rules. Frontend adds one `/body` route tree reusing the Phase 5 `LineChart` + `chartGeometry`.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–5; **no new dependency**):

- Backend: `express`, `multer` (already used for exercise media), `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New presenters/engine helpers are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — the weight curve reuses the Phase 5 hand-rolled `components/charts/LineChart.jsx` over the pure `lib/chartGeometry.js` (extended with one band helper).

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 6 ships 0 migrations and 0 new tables** — `body_measurements` and `athlete_photos` already exist with `athlete_id` scoping and shipped RLS `*_own` policies (research D-1, D-2).

**Testing**: Vitest. Per Constitution V, every number-producing function is unit-tested first (red → green → refactor):

- `services/engine/weightTrajectory.js` (new, pure): `idealZone(...)` (band endpoints; null when inputs missing), `phaseBoundaries(...)` (cumulative phase marker dates, shared with `currentPhase.phaseForDate`).
- `services/engine/measurementDeltas.js` (new, pure): `monthlyLatest(entries)` (latest non-null per month, D-5), `monthOverMonthDeltas(monthly)` (signed deltas, null where missing).
- `services/bodyTracking/{weightChartView,measurementsTableView,photoGalleryView}.js` (new, pure presenters): assemble view models from synthetic DAO output with **no I/O**, including empty/low-data shapes.
- `frontend/src/lib/chartGeometry.js` (extended): new `bandPath`/`areaBetween` asserted against fixed inputs alongside the existing geometry tests.
- Contract: every `/api/v1/body-measurements` + `/api/v1/body-tracking/*` path in `contracts/openapi.yaml` via Supertest (live-gated, skips offline).
- Integration: weigh-in upsert (one-per-day), at-least-one-value (400), future-date (400), photo upload → list → delete (file removed), RLS probes on both tables; cleans up.
- Frontend smoke (RTL + jsdom): weigh-in form submits; weight chart renders curve + goal line + zone from a stub; "<2 entries" empty state; table renders deltas + missing-delta gap; gallery renders, opens full-screen, selects before/after.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–5 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 6 adds one pure service sub-directory `services/bodyTracking/` (presenters, mirroring `services/loadTracking/`), two new pure `services/engine/` helpers, a new photo DAO/controller/router, and a frontend `/body` page tree. All Supabase imports stay in `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Weigh-in save responds well under the journal 100 ms interactive budget for the row write; the body-composition + program-regeneration cascade is the existing Phase 1 path (unchanged) and runs off the interactive set-logging path.
- Weight-chart assembly ≤ 400 ms: one indexed `listForAthlete` read + O(points) in-memory composition (zone + markers from profile/phases already in memory).
- Measurements table ≤ 400 ms: the same single history read bucketed in-memory by month.
- Photo gallery list ≤ 300 ms: one indexed `(athlete_id, taken_on desc)` read; files stream from `/static/*`.
- Charts render client-side from the composed view model; geometry is O(points).

**Constraints**:

- **0 migrations / reuse-first** (research D-1, D-2): both tables exist; Phase 6 adds DAO methods, presenters, endpoints, and config — no schema change.
- **Photo decoupled from the weigh-in** (clarification, D-3): a failed photo upload never rolls back an already-saved weigh-in; re-saving a day never alters its photo (D-4).
- **Merge-on-re-save** (FR-002/FR-006): a re-save of an existing day **merges** the provided fields over the stored row — the controller reads the existing measurement for that date and overlays only the supplied fields before the upsert, so a partial re-save never nulls out previously-entered circumferences. (A naive upsert of the raw payload would erase omitted columns; the controller MUST guard against that.)
- **Photo serving & privacy** (Principle I, multi-user follow-up): progress photos reuse the unauthenticated `/static/*` path with opaque athlete-scoped keys (Phase 3 pattern). Acceptable for single-user/local; an authenticated photo-fetch path is a documented follow-up before `SINGLE_USER_MODE=false` because body photos are sensitive (spec Assumptions). Out of scope for Phase 6 delivery.
- **No engine reinvention**: body-fat % / lean mass remain the existing Phase 1 cascade (FR-007); "current weight" is the latest `body_measurements.weight_kg`. The only new math is presentation (ideal zone, phase dates, monthly deltas, band geometry), all pure and tested.
- **Determinism**: all new engine/presenter/geometry functions are pure — caller supplies `asOf`/`now`; no `Date.now()`/random/globals inside pure functions. Future-date validation reads "today" at the request boundary (controller), not inside a pure service.
- **Tenant scoping** (Constitution I): every read/write is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body/query. No new table ⇒ no new RLS (existing `*_own` policies already cover both tables).
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/bodyTracking/*`, `services/engine/*`, and `frontend/src/lib/chartGeometry.js` take injected data and never import the client; dependency direction is `controllers → bodyTracking (+ engine) → dataAccess`.
- **Config over hardcoding** (Constitution III): photo size/type limits are new `.env` keys (`BODY_PHOTO_MAX_BYTES`, `BODY_PHOTO_IMAGE_TYPES`); the storage root reuses `PHOTO_STORAGE_ROOT`.
- **Units display-only** (FR-028, D-11): stored/API values stay kg/cm; lbs/in is a frontend conversion governed by the existing preference.
- **No AI**: the zone, markers, and deltas are deterministic functions of logged data, consistent with the project's no-AI boundary.

**Scale/Scope**: 1 athlete; 0 new tables / migrations; 2 new config keys; ~6 new endpoints (`POST`/`GET /body-measurements`, 3 `GET /body-tracking/*`, `POST`/`DELETE /body-tracking/photos`); 1 new DAO (4 methods) + reuse of the measurements DAO; 2 new pure engine helpers + 3 presenters + 1 frontend geometry helper; ~900 LOC backend; ~1,400 LOC frontend (form + 3 views + gallery/lightbox); ~1,300 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS (with a recorded multi-user follow-up)**. No new table; both backing tables already carry `athlete_id` and ship `*_own` RLS. Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The new photo DAO filters every query by `athlete_id`. No schema change ⇒ no RLS change. **Caveat**: progress photos are served via the unauthenticated `/static/*` path (opaque athlete-scoped keys, reusing the Phase 3 exercise-media decision). This satisfies isolation under `SINGLE_USER_MODE=true`; an **authenticated photo-fetch path is a documented follow-up before multi-user** (spec Assumptions → "Photo serving & privacy") so SC-009 holds against URL guessing once tenants share an origin. Not a MUST-violation for this single-user phase.

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; controllers orchestrate; the new `services/bodyTracking/*` presenters and `services/engine/{weightTrajectory,measurementDeltas}.js` are pure (no I/O, no globals, caller-supplied `asOf`); the only new Supabase-touching code is the `athletePhotos.dao.js` read/write methods. The frontend reaches every surface through `/api/v1/` and never touches the secret key. Photo files go through the existing `photoStorage` adapter, not the DB.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. Photo limits become `.env` keys (`BODY_PHOTO_MAX_BYTES`, `BODY_PHOTO_IMAGE_TYPES`) with safe defaults; the storage root reuses `PHOTO_STORAGE_ROOT`. The ideal-zone shape (program duration = Σ phase weeks) is derived from seeded data, not hardcoded; no athlete data, URLs, or secrets in source.

- **IV. Versioned API Contract** — **PASS**. All endpoints live under `/api/v1/` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the canonical error envelope, and are additive within v1 (`POST /body-measurements` keeps its existing 201 shape; new reads return 200; photo create 201 / delete 204). No breaking change to any existing contract.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every number surfaced is produced by a pure function tested first: `weightTrajectory` (zone bounds, phase dates), `measurementDeltas` (monthly latest + signed deltas), the three presenters (assembly + empty-state shapes), and the new `chartGeometry` band helper. Body-fat % / lean mass reuse the already-tested Phase 1 estimator. UI views are exempt from strict TDD but ship smoke tests.

- **VI. Athlete-First UX** — **PASS**. Each surface answers a real transformation question (am I gaining on pace / how have my measurements moved / what does the change look like). The weigh-in form is the same one-handed-friendly input style as the journal (large targets, optional fields). Frontend goes through the Frontend Design skill on the existing Tailwind tokens; the weight chart reuses the bespoke SVG `LineChart` (no generic chart library) to keep the premium look. Empty/low-data states are designed, not blank.

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables; the one new DAO and all reads/writes trace to existing athlete-scoped tables with shipped RLS.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; the only mutations are the day-scoped weigh-in upsert and the athlete-scoped photo create/delete.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, presentation math inside pure `services/bodyTracking/*` + `services/engine/*`, and chart geometry inside the pure `frontend/src/lib/chartGeometry.js`; no `models/` directory is added.
- Performance budgets hold: each screen is one indexed read plus O(points) in-memory composition; charts render client-side; the only heavy path (composition + program regen) is the unchanged existing cascade.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/009-body-weight-measurements/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-03)
├── research.md          # Phase 0 of plan — D-1…D-11 decisions + rationale
├── data-model.md        # Phase 1 of plan — read/write composition (0 migrations) + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 4 surfaces
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — weigh-in + body-tracking endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 6 extends the Phase 0–5 layout. **Bold** = new in Phase 6; everything else already exists.

```text
masslab/
├── routes/
│   ├── bodyMeasurements.routes.js          # EXTENDED: add GET / (history) alongside POST /
│   └── bodyTracking.routes.js              # NEW: GET /weight-chart, /measurements-table, /photos; POST /photos; DELETE /photos/:id (multer)
├── controllers/
│   ├── bodyMeasurements.controller.js      # EXTENDED: list(); add future-date guard (FR-005)
│   └── bodyTracking.controller.js          # NEW: weightChart, measurementsTable, listPhotos, uploadPhoto, deletePhoto
├── services/
│   ├── engine/
│   │   ├── weightTrajectory.js             # NEW pure: idealZone, phaseBoundaries
│   │   ├── measurementDeltas.js            # NEW pure: monthlyLatest, monthOverMonthDeltas
│   │   ├── bodyComposition.js              # reused (estimate source, FR-007)
│   │   └── inputSchemas.js                 # EXTENDED: bodyMeasurementSchema gains at-least-one-value refine (FR-003)
│   ├── bodyTracking/                       # NEW pure presenter boundary
│   │   ├── weightChartView.js              # curve + goal line + zone + phase markers
│   │   ├── measurementsTableView.js        # monthly latest + signed deltas (D-5)
│   │   └── photoGalleryView.js             # gallery items (+ url())
│   ├── sessionJournal/
│   │   └── currentPhase.js                 # reused: phaseForDate / cumulative-weeks (shared by phaseBoundaries)
│   ├── photoStorage/                       # reused: put/get/delete/url adapter
│   └── dataAccess/
│       ├── bodyMeasurements.dao.js         # reused: insert(upsert)/listForAthlete/latestForAthlete
│       ├── athletePhotos.dao.js            # NEW: insert/listForAthlete/findById/delete
│       ├── athletes.dao.js                 # reused (starting/target weight, program_start_date)
│       └── trainingPhases.dao.js           # reused (phase order/length → markers + zone duration)
├── config/
│   └── schema.js                           # EXTENDED: BODY_PHOTO_MAX_BYTES, BODY_PHOTO_IMAGE_TYPES
├── app.js                                  # EXTENDED: wire athletePhotos dao + v1.use('/body-tracking', …) after /load-tracking
└── frontend/src/
    ├── pages/body/
    │   ├── BodyHome.jsx                     # NEW /body — weigh-in form + weight chart
    │   ├── MeasurementsTable.jsx            # NEW /body/measurements
    │   └── PhotoGallery.jsx                 # NEW /body/photos — grid + lightbox + before/after compare
    ├── components/charts/
    │   └── LineChart.jsx                    # reused (curve); band/goal/markers via geometry
    ├── lib/
    │   ├── chartGeometry.js                # EXTENDED: bandPath/areaBetween (pure, unit-tested)
    │   └── bodyTrackingApi.js              # NEW thin wrappers (weigh-in, chart, table, photos)
    └── App.jsx                             # EXTENDED: /body route tree + "Corps" nav link
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–5. The additions mirror Phase 5 exactly: a pure `services/bodyTracking/` presenter boundary (so controllers stay thin and view assembly is unit-testable without I/O) and new pure `services/engine/` helpers for the only new numeric logic (ideal zone, phase dates, monthly deltas). The progress-photo lifecycle reuses the Phase 3 exercise-media pattern (multer memory storage + `uploadSingle` 413/400 wrapper + `photoStorage.put/url/delete`). The weight chart reuses the Phase 5 `LineChart` + `chartGeometry`, extended with one pure band helper. No `models/` directory is added; all Supabase access stays behind `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
