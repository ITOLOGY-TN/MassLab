# Phase 1 Data Model — Body Weight & Measurements (Phase 6)

**Feature**: `009-body-weight-measurements` · **Date**: 2026-06-03

**Migrations in this phase: 0.** Both backing tables already exist with `athlete_id` scoping, the required columns, and shipped RLS `*_own` policies. Phase 6 adds DAO read/write methods, pure presenters, and composed read endpoints — no schema change.

## Existing tables (reused as-is)

### `body_measurements` — the weigh-in record (one row per athlete per day)

| Column | Type | Notes |
|--------|------|-------|
| `id` | bigint PK | |
| `athlete_id` | uuid FK → athletes | tenant scope (Constitution I) |
| `measured_on` | date | **`UNIQUE(athlete_id, measured_on)`** → one entry per day (FR-002) |
| `weight_kg` | numeric(5,2) | nullable |
| `arm_cm` | numeric(5,2) | nullable |
| `chest_cm` | numeric(5,2) | nullable |
| `thigh_cm` | numeric(5,2) | nullable |
| `shoulder_cm` | numeric(5,2) | nullable |
| `waist_cm` | numeric(5,2) | nullable |
| `neck_cm` | numeric(5,2) | nullable (added migration `…0008`) |
| `hip_cm` | numeric(5,2) | nullable (added migration `…0008`) |
| `note` | text | nullable |

RLS: `body_measurements_select_own` / `_modify_own` (already shipped). Validation: `bodyMeasurementSchema` (existing) enforces per-field plausible ranges + ISO date format.

### `athlete_photos` — progress photos

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | photo identity (delete-by-id) |
| `athlete_id` | uuid FK → athletes | tenant scope; `ON DELETE CASCADE` |
| `taken_on` | date | the photo's date |
| `storage_key` | text NOT NULL | opaque key from the photoStorage adapter |
| `weight_overlay_kg` | numeric(5,2) | nullable — the day's weight (FR-009) |
| `note` | text | nullable |
| `created_at` | timestamptz | default `now()` |

Index: `athlete_photos_athlete_taken_idx (athlete_id, taken_on desc)`. RLS: `athlete_photos_select_own` / `_modify_own` (already shipped). **No DAO/controller/routes yet — built in this phase.**

## DAO changes

### `services/dataAccess/bodyMeasurements.dao.js` (existing — reuse)

- `insert(row)` — **upsert** on `(athlete_id, measured_on)` → enforces one-per-day (FR-002). (Reused by `POST /body-measurements`.) **Merge guard (M1/FR-006)**: the controller MUST read the existing row for that date and overlay only the provided fields before calling `insert`, so a partial re-save never nulls out previously-stored circumferences. A raw upsert of the bare payload would erase omitted columns — do not do that.
- `listForAthlete(athleteId, { limit })` — date-desc history. **Default `limit` is 50** — too small for a 5-month near-daily series. The weight-chart and measurements-table controllers MUST pass an explicit high limit (e.g. `{ limit: 1000 }`) so the curve/table are not truncated (I1); the `GET /body-measurements` history endpoint passes `limit` (default 365). Powers FR-014/FR-016/FR-021.
- `latestForAthlete(athleteId)` — reused where the latest weight is needed.

### `services/dataAccess/athletePhotos.dao.js` (NEW)

| Method | Purpose |
|--------|---------|
| `insert({ athlete_id, taken_on, storage_key, weight_overlay_kg, note })` | persist a photo row after the file is stored |
| `listForAthlete(athleteId)` | date-desc list for the gallery (FR-015) |
| `findById(athleteId, id)` | fetch one (scoped) — used before delete to get `storage_key` |
| `delete(athleteId, id)` | remove the row (scoped by `athlete_id`) → caller then best-effort deletes the file |

All methods filter by `athlete_id` (Constitution I); error mapping mirrors the other DAOs (`HttpError(500,'DB_ERROR', …)`; not-found → `HttpError(404,'NOT_FOUND', …)`).

## New pure engine helpers (`services/engine/`, test-first — Constitution V)

### `weightTrajectory.js`

- `idealZone({ startKg, targetKg, startDate, totalWeeks, asOf })` → `{ lower: [{date, kg}…], upper: [{date, kg}…] }` — the steady lean-gain band from start to target across the program window (D-7). Returns an empty/`null` shape when inputs are missing (graceful omission, FR-018).
- `phaseBoundaries({ startDate, phases })` → `[{ name, startDate, endDate }]` — cumulative phase boundary dates for the chart markers (FR-019). Reuses the cumulative-weeks logic shared with `currentPhase.phaseForDate`.

### `measurementDeltas.js`

- `monthlyLatest(entries)` → `{ 'YYYY-MM': { field: value } }` — latest non-null value per measurement per month (D-5).
- `monthOverMonthDeltas(monthly)` → per-month, per-field signed delta vs previous month, `null` where a side is missing (FR-022/FR-023).

All pure: caller supplies `asOf`/`now`; no `Date.now()`, no I/O, no globals.

## New pure presenters (`services/bodyTracking/`)

| File | Composes | Inputs (injected) | Output (view model) |
|------|----------|-------------------|---------------------|
| `weightChartView.js` | weight curve + goal line + ideal zone + phase markers (FR-016–FR-020) | measurements (date-asc), `{ starting_weight_kg, target_weight_kg, program_start_date }`, phases | `{ points, goalKg|null, zone|null, phaseMarkers, hasTrend }` |
| `measurementsTableView.js` | monthly table + deltas (FR-021–FR-023) | measurements, field list | `{ months: [{ month, fields: { name: { value, delta|null, direction } } }] }` |
| `photoGalleryView.js` | gallery items (FR-024) | photo rows, adapter `url()` | `{ items: [{ id, takenOn, weightKg|null, url, note }] }` |

Each handles the empty/low-data shape (FR-027) explicitly.

## View-model shapes (consumed by the frontend)

```jsonc
// GET /body-tracking/weight-chart
{ "data": {
  "points":   [ { "date": "2026-04-27", "kg": 58.0 }, … ],     // date-asc, from program_start_date
  "goalKg":   66.0,                                            // null if target unset (FR-017)
  "zone":     { "lower": [ {"date","kg"}… ], "upper": [ … ] }, // null if inputs missing (FR-018)
  "phaseMarkers": [ { "name": "Volume", "date": "2026-04-27" }, … ], // FR-019
  "hasTrend": true                                             // false when <2 points (FR-020)
} }

// GET /body-tracking/measurements-table
{ "data": { "months": [
  { "month": "2026-05",
    "fields": { "arm_cm":     { "value": 38.5, "delta":  0.7, "direction": "up" },
                "waist_cm":   { "value": 78.0, "delta": -1.2, "direction": "down" },
                "chest_cm":   { "value": 104.0,"delta": null, "direction": "flat" } } },
  …
] } }

// GET /body-tracking/photos   (and items returned by POST)
{ "data": { "items": [
  { "id": "uuid", "takenOn": "2026-05-01", "weightKg": 60.5,
    "url": "/static/photos/<athlete>/<uuid>.jpg", "note": null }, …
] } }
```

## Update (re-save) semantics — M1

`POST /body-measurements` for an existing `(athlete_id, measured_on)` **merges**: the controller fetches the stored row, overlays the provided fields, then upserts the merged row. Result — omitted fields keep their stored values (FR-006 update path), the day stays a single row (FR-002), and the existing photo for that date is untouched (D-4). A new date with no stored row persists exactly the provided fields (FR-006 new path).

## Validation additions (D-10)

- `bodyMeasurementSchema` (existing): add a `.refine` rejecting a body where `weight_kg` and all seven circumferences are absent → `400 VALIDATION_FAILED` (FR-003).
- `POST /body-measurements` controller: reject `measured_on` after server today → `400 VALIDATION_FAILED` (FR-005).
- Photo upload: multer `limits.fileSize = BODY_PHOTO_MAX_BYTES` → `413 MEDIA_TOO_LARGE`; mimetype ∉ `BODY_PHOTO_IMAGE_TYPES` → `400 VALIDATION_FAILED` (FR-010).

## Config additions (`config/schema.js`, D-9)

| Key | Default | Purpose |
|-----|---------|---------|
| `BODY_PHOTO_MAX_BYTES` | `26214400` | progress-photo upload size cap |
| `BODY_PHOTO_IMAGE_TYPES` | `image/jpeg,image/png,image/webp` | allowed image mimetypes (no video) |
| `PHOTO_STORAGE_ROOT` | `data/photos` (existing) | reused storage root |

## Tenant & RLS

No new table ⇒ no new RLS. Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The RLS integration test (`tests/integration/rls.policies.test.js`) already probes `athlete_photos` and `body_measurements` policies.
