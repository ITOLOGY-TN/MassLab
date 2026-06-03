# Phase 0 Research — Body Weight & Measurements (Phase 6)

**Feature**: `009-body-weight-measurements` · **Date**: 2026-06-03 · **Spec**: [spec.md](./spec.md)

This phase has **no NEEDS CLARIFICATION** markers (the three open questions were resolved in `/speckit-clarify`, Session 2026-06-03). Research here records the design decisions that shape the plan, each grounded in the existing codebase so Phase 6 reuses rather than reinvents.

## Decisions

### D-1 — Reuse the existing `body_measurements` table; **0 migrations** for measurements

**Decision**: The weigh-in record is the existing `body_measurements` table. It already carries `athlete_id`, `measured_on` (with a `UNIQUE(athlete_id, measured_on)` constraint), `weight_kg`, the seven circumferences (`arm_cm`, `chest_cm`, `thigh_cm`, `shoulder_cm`, `waist_cm`, `neck_cm`, `hip_cm`), and `note`. The DAO already exposes `insert` (an **upsert** on `(athlete_id, measured_on)`), `listForAthlete`, and `latestForAthlete`. The `POST /api/v1/body-measurements` controller already persists a weigh-in **and** cascades to the body-composition estimate + program regeneration.

**Rationale**: Everything FR-001/FR-002/FR-006/FR-007 require already exists. The one-entry-per-day rule (FR-002) is the DB unique constraint + DAO upsert. The auto body-composition trigger (FR-007) is the existing cascade. No schema change is needed for the numeric weigh-in. **Re-save is a merge, not a raw replace** (M1, resolved in analysis): the controller overlays the provided fields on the existing row before the upsert, so a partial re-save keeps untouched circumferences (FR-006 update path) — a raw upsert of the bare payload would null omitted columns and is explicitly disallowed.

**Alternatives considered**: A new `body_weights` table separate from circumferences — rejected; it would split one weigh-in across two rows, duplicate the per-day uniqueness logic, and break the existing composition cascade.

### D-2 — Reuse the existing `athlete_photos` table; **0 migrations** for photos

**Decision**: Progress photos use the existing `athlete_photos` table (`id uuid`, `athlete_id`, `taken_on date`, `storage_key text`, `weight_overlay_kg numeric(5,2)`, `note text`, `created_at`, index on `(athlete_id, taken_on desc)`, RLS `*_own` policies already shipped). It currently has **no DAO, no controller, no routes** — Phase 6 builds those.

**Rationale**: The table was scaffolded in Phase 0 exactly for this. `storage_key` holds the photoStorage adapter key; `weight_overlay_kg` holds the day's weight (FR-009). Net schema change for the whole phase is **zero migrations** — matching Phase 5.

### D-3 — Photo capture is a **dedicated upload action**, separate from saving the weigh-in numbers (clarification)

**Decision**: The numeric weigh-in is saved first via `POST /body-measurements`. The photo is uploaded and deleted through separate endpoints under the body-tracking photo router. A failed photo upload never rolls back an already-saved weigh-in.

**Rationale**: Directly from the 2026-06-03 clarification. It mirrors the **Phase 3 exercise-media pattern** (`POST /exercises/:id/media/image` is a distinct multipart action from creating the exercise), so the multer wrapper, 413/400 envelope handling, and `photoStorage.put/url/delete` flow are reused verbatim. Decoupling binary upload from the numeric transaction removes the atomicity ambiguity the spec previously carried.

**Alternatives considered**: Combined multipart save (weigh-in + photo in one request, rolled back together) — rejected by the clarification; it complicates the controller and couples a 25 MB binary path to the program-regeneration cascade.

### D-4 — Re-saving a day **keeps** its existing photo (clarification)

**Decision**: `POST /body-measurements` for an existing date updates only the numeric fields (DAO upsert on the measurement row); it never touches `athlete_photos`. Photo removal is solely the explicit `DELETE` photo action.

**Rationale**: From the clarification. The two records have independent lifecycles (different tables, different endpoints), so "edit my weight" can never silently destroy a progress photo. No code is needed to enforce this beyond keeping the paths separate — it falls out of D-3.

### D-5 — Monthly table value = **latest entry in the month** (clarification)

**Decision**: For the month-over-month measurements table, each `{month, measurement}` cell uses the value from the most recent `measured_on` within that month that has a non-null value for that measurement. The month-over-month delta is `latest(month) − latest(prevMonth)`, omitted when either side is missing (FR-023).

**Rationale**: From the clarification. End-of-month state is the most meaningful snapshot and is deterministic to compute and unit-test (SC-005). Pure function, no averaging ambiguity.

### D-6 — New pure boundaries: `services/engine/*` for the numbers, `services/bodyTracking/*` for view composition (mirrors Phase 5)

**Decision**: Follow the Phase 5 split exactly.

- **`services/engine/` (new pure, test-first per Constitution V)**:
  - `weightTrajectory.js` — `idealZone({ startKg, targetKg, startDate, totalWeeks, asOf })` returns the upper/lower band endpoints of the ideal-progression zone; `phaseBoundaries({ startDate, phases })` returns the cumulative phase-boundary dates for markers. (`phaseBoundaries` reuses the cumulative-weeks logic that already lives behind `services/sessionJournal/currentPhase.js` → `phaseForDate`; extracted/shared rather than re-derived.)
  - `measurementDeltas.js` — `monthlyLatest(entries)` buckets entries to one latest value per month per field (D-5); `monthOverMonthDeltas(monthly)` returns signed deltas with nulls where a side is missing.
- **`services/bodyTracking/` (new pure presenters)**: `weightChartView.js`, `measurementsTableView.js`, `photoGalleryView.js` — assemble view models from injected DAO output, no I/O, including empty/low-data shapes.

**Rationale**: Constitution II (layering) + V (test-first for any surfaced number). The ideal-zone bounds and month deltas are "numbers surfaced as recommendations," so they are pure and tested first. Composition stays I/O-free and unit-testable, matching `services/loadTracking/*`.

### D-7 — Weight chart reuses Phase 5 SVG charts + `lib/chartGeometry.js`; extend geometry with a pure band helper

**Decision**: The main weight curve renders through the existing `frontend/src/components/charts/LineChart.jsx` driven by the existing pure `frontend/src/lib/chartGeometry.js` (`linearScale`, `linePath`, `niceTicks`). The **ideal-progression zone** is a shaded band and the **goal line** + **phase markers** are overlays; add one pure helper `bandPath({ upper, lower, ... })` (or `areaBetween`) to `chartGeometry.js`, unit-tested alongside the existing geometry.

**Rationale**: D-9 of Phase 5 already established hand-rolled, unit-tested SVG geometry and shipped a `LineChart`. Reusing it keeps the premium look (Constitution VI) and avoids a charting dependency. Only the band/goal-line/marker annotations are new, and the only new *geometry math* (the band path) is pure and testable.

**Alternatives considered**: Introduce a charting library (Recharts/Chart.js) — rejected; Phase 5 deliberately avoided one, and a band + goal line + markers is a few lines of pure geometry.

### D-8 — Read surface: extend `/body-measurements` with a history GET; new composed `/api/v1/body-tracking/*` router

**Decision**:

- Extend the existing `/body-measurements` router with `GET /` (weigh-in history, date-ordered) backed by the existing `listForAthlete` DAO (FR-014). Capture stays on the existing `POST /`.
- New router `/api/v1/body-tracking` (mounted after `/load-tracking` in `app.js`) for composed reads + photos:
  - `GET /weight-chart` → composed weight-chart view model (curve + goal line + ideal zone + phase markers).
  - `GET /measurements-table` → composed monthly table with deltas.
  - `GET /photos` → gallery list (date-ordered, with weight overlay).
  - `POST /photos` → dedicated multipart upload (D-3).
  - `DELETE /photos/:id` → delete photo + best-effort file removal.

**Rationale**: Constitution IV (everything under `/api/v1/`). Keeping weigh-in capture on `/body-measurements` preserves the existing composition cascade; grouping the new composed screens + photo lifecycle under one `/body-tracking` router mirrors how Phase 5 grouped its three screens under `/load-tracking`.

**Alternatives considered**: Put photos under `/body-measurements/:date/photo` — rejected; photos have their own id and lifecycle (delete by id, list across all dates), so a top-level `/body-tracking/photos` collection is cleaner and matches the table's `id` primary key.

### D-9 — Dedicated photo config keys (config over hardcoding)

**Decision**: Add `BODY_PHOTO_MAX_BYTES` (default `26214400` = 25 MiB) and `BODY_PHOTO_IMAGE_TYPES` (default `image/jpeg,image/png,image/webp`) to `config/schema.js`. Reuse the existing `PHOTO_STORAGE_ROOT` for the storage adapter.

**Rationale**: Constitution III. Progress photos are images-only (no video) and may warrant a different cap than exercise media, so they get their own keys rather than overloading `EXERCISE_MEDIA_*`. Defaults match today's values so nothing breaks; limits stay out of source.

**Alternatives considered**: Reuse `EXERCISE_MEDIA_MAX_BYTES`/`EXERCISE_MEDIA_IMAGE_TYPES` — rejected; it couples two unrelated features through one knob and includes video types that progress photos must not accept.

### D-10 — Validation gaps to close on the existing measurement schema

**Decision**: Two small additions to the weigh-in validation (the existing `bodyMeasurementSchema` already enforces per-field ranges):

- **At-least-one-value (FR-003)**: reject a weigh-in whose `weight_kg` and all seven circumferences are absent (a `note`-only or empty body). Add as a zod `.refine`.
- **No future date (FR-005)**: reject `measured_on` later than the server's current date. Done in the controller by comparing to "today" (passed in / read at the request boundary), keeping pure functions time-free per Constitution II.

**Rationale**: The schema validates field ranges and ISO date *format* but not these two business rules. Both are cheap and directly testable.

### D-11 — Units are display-only (FR-028)

**Decision**: Store kg/cm always. The athlete's existing unit preference (kg/lbs, from Phase 2 preferences) governs display conversion on the frontend only; stored values and API payloads stay metric.

**Rationale**: FR-028 + Constitution (single source of truth). Conversion is a presentation concern; the API contract stays metric so downstream modules (dashboard, statistics) read one unit system.

## Resolved unknowns summary

| Question | Resolution |
|----------|------------|
| New tables needed? | No — `body_measurements` and `athlete_photos` both exist (D-1, D-2). 0 migrations. |
| Photo coupled to weigh-in save? | No — separate upload action (D-3, clarification). |
| Overwrite a day → existing photo? | Kept (D-4, clarification). |
| Monthly table value rule? | Latest entry in month (D-5, clarification). |
| Charting library? | No — reuse Phase 5 SVG + extend pure geometry with a band helper (D-7). |
| Where does the new numeric logic live? | Pure `services/engine/*`, composed by pure `services/bodyTracking/*` (D-6). |
| Config for photo limits? | New `BODY_PHOTO_MAX_BYTES` / `BODY_PHOTO_IMAGE_TYPES` (D-9). |
