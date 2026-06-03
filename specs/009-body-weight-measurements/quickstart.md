# Quickstart — Body Weight & Measurements (Phase 6)

**Feature**: `009-body-weight-measurements` · **Date**: 2026-06-03

Operator's guide to the four user-facing surfaces this phase adds. Assumes the app boots (`npm install && npm start`) and the seeded athlete exists.

## What's new

| Surface | Route (frontend) | Endpoint(s) |
|---------|------------------|-------------|
| Morning weigh-in form | `/body` | `POST /api/v1/body-measurements` (existing), `GET /api/v1/body-measurements` |
| Weight curve (main chart) | `/body` | `GET /api/v1/body-tracking/weight-chart` |
| Monthly measurements table | `/body/measurements` | `GET /api/v1/body-tracking/measurements-table` |
| Progress photo gallery | `/body/photos` | `GET` / `POST /api/v1/body-tracking/photos` · `DELETE /api/v1/body-tracking/photos/{photoId}` |

Nav link: **"Corps"** added to the top nav alongside "Charges".

## 1. Log a morning weigh-in (P1)

```bash
# Weight only (minimum valid entry)
curl -X POST localhost:3000/api/v1/body-measurements \
  -H 'content-type: application/json' \
  -d '{ "measured_on": "2026-06-03", "weight_kg": 60.5 }'

# Weight + circumferences + note
curl -X POST localhost:3000/api/v1/body-measurements \
  -H 'content-type: application/json' \
  -d '{ "measured_on": "2026-06-03", "weight_kg": 60.5,
        "arm_cm": 38.5, "chest_cm": 104, "waist_cm": 78, "note": "matin, à jeun" }'
```

- Re-posting for the same `measured_on` **merges** into that day's entry (one row per day, FR-002; omitted fields keep their stored values, FR-006) and **does not** touch any photo on that date (D-4).
- Saving with a weight triggers the body-composition estimate + program regeneration (FR-007) — visible in the `data.body_composition` / `data.program_id` fields.
- **Rejected (400)**: no weight and no measurement (`{ "measured_on": "…", "note": "x" }`, FR-003); a future date (FR-005); an out-of-range value (FR-004).

```bash
# History (date-descending)
curl localhost:3000/api/v1/body-measurements
```

## 2. Weight curve (P2)

```bash
curl localhost:3000/api/v1/body-tracking/weight-chart
```

Returns `points` (date-asc from `program_start_date`), `goalKg` (null if no target), `zone` (ideal-progression band; null if start/target/start-date missing), `phaseMarkers`, and `hasTrend` (false with <2 points). The frontend renders this through the reused `LineChart` + extended `chartGeometry.bandPath`. With 0–1 entries the chart still renders the reference lines and an encouraging "log more to see your trend" state (FR-020/FR-027).

## 3. Monthly measurements table (P3)

```bash
curl localhost:3000/api/v1/body-tracking/measurements-table
```

Each month shows the **latest entry in that month** per measurement (D-5) and a signed delta vs the previous month — `direction: up|down|flat`. A missing prior value yields `delta: null` (no misleading change, FR-023). One month of data → values with no deltas, no error.

## 4. Progress photos (P3)

```bash
# Upload (dedicated multipart action, separate from the weigh-in)
curl -X POST localhost:3000/api/v1/body-tracking/photos \
  -F 'file=@front_2026-06-03.jpg' \
  -F 'taken_on=2026-06-03' \
  -F 'weight_overlay_kg=60.5'

# List (gallery)
curl localhost:3000/api/v1/body-tracking/photos

# Delete (row + stored file)
curl -X DELETE localhost:3000/api/v1/body-tracking/photos/<uuid>
```

- Stored via the photoStorage adapter; served at `GET /static/<storage_key>` so `<img>` can load it.
- **Rejected**: file over `BODY_PHOTO_MAX_BYTES` → 413; mimetype not in `BODY_PHOTO_IMAGE_TYPES` → 400 (FR-010).
- Gallery supports full-screen view and side-by-side before/after on the frontend (FR-025/FR-026).

## Config (`.env`, all defaulted)

```
BODY_PHOTO_MAX_BYTES=26214400              # 25 MiB
BODY_PHOTO_IMAGE_TYPES=image/jpeg,image/png,image/webp
PHOTO_STORAGE_ROOT=data/photos             # existing, reused
```

## Tests to run

```bash
npm test -- tests/unit/weightTrajectory.test.js \
            tests/unit/measurementDeltas.test.js \
            tests/unit/weightChartView.test.js \
            tests/unit/measurementsTableView.test.js \
            tests/unit/photoGalleryView.test.js \
            tests/unit/lib.chartGeometry.test.js
npm test -- tests/contract        # body-measurements + body-tracking paths (live-gated, skips offline)
npm test -- tests/integration     # weigh-in upsert, photo upload/delete, RLS probes
npm run test:frontend             # /body screens smoke (form, chart, table, gallery, empty states)
```

## Migrations

**None.** `body_measurements` and `athlete_photos` already exist with RLS. Nothing to push.
