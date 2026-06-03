# Quickstart — Phase 5: Load Tracking & Progression Algorithm

**Feature**: `008-load-tracking` | **Date**: 2026-06-02

Operator's / developer's guide to what Phase 5 adds and how to exercise it. It assumes Phase 0–4 are in place (sessions can be logged and finished, which writes `progression_flags` + `one_rep_max_records`).

---

## What ships

| Surface                     | Route                                                                      | Type               |
| --------------------------- | -------------------------------------------------------------------------- | ------------------ |
| Progression overview        | `GET /api/v1/load-tracking/overview` → frontend `/load-tracking`           | read-only composed |
| Exercise progression detail | `GET /api/v1/load-tracking/exercises/:id` → `/load-tracking/exercises/:id` | read-only composed |
| Phase-comparison radar      | `GET /api/v1/load-tracking/phase-comparison` → `/load-tracking/phases`     | read-only composed |

**0 migrations, 0 new tables, no new runtime dependency.** Charts are hand-rolled SVG (D-9). New pure helpers: `services/engine/trendProjection.js`, `services/loadTracking/*`, `frontend/src/lib/chartGeometry.js`.

---

## 1. Prerequisites — generate some history

Load Tracking reads what Phase 4 writes, so finish a few sessions first (so `one_rep_max_records` + `progression_flags` exist):

```bash
# Start → log a completed set → finish (repeat across a few days/exercises)
SID=$(curl -s -X POST localhost:3000/api/v1/sessions -d '{}' -H 'content-type: application/json' | jq '.data.session_id')
curl -s -X PUT localhost:3000/api/v1/sessions/$SID/sets -H 'content-type: application/json' \
  -d '{"sets":[{"exercise_id":101,"set_number":1,"weight_kg":80,"reps":5,"completed":true}]}' >/dev/null
curl -s -X POST localhost:3000/api/v1/sessions/$SID/finish -d '{}' -H 'content-type: application/json' >/dev/null
```

With **no** finished sessions, every surface returns its documented empty/low-data state — that is correct, not a bug.

## 2. Overview (the MVP)

```bash
curl -s localhost:3000/api/v1/load-tracking/overview | jq '.data.exercises[] | {name, status, current_load_kg, all_time_record_kg, last_session_volume_kg, trend}'
curl -s localhost:3000/api/v1/load-tracking/overview | jq '{deload: .data.deload_notices, empty: .data.empty}'
```

Expected: one row per exercise with a `status` of `ready_to_increase` / `maintain` / `stagnation` / `regressing`, plus muscle-group `deload_notices`. Exercises without history show null load/record/volume/trend and a neutral status.

## 3. Exercise detail

```bash
curl -s localhost:3000/api/v1/load-tracking/exercises/101 | jq '{
  e1rm: .data.current_estimate_1rm_kg,
  record: .data.all_time_record_kg,
  load_points: (.data.load_series|length),
  volume_points: (.data.volume_series|length),
  last10: (.data.recent_sessions|length),
  projection: (.data.projection != null)
}'
```

`projection` is `null` until the exercise has **≥ 3** finished sessions (D-2).

## 4. Phase comparison radar

```bash
curl -s localhost:3000/api/v1/load-tracking/phase-comparison | jq '{axes: [.data.muscle_groups[].name], series: [.data.phases[].slug], empty: .data.empty}'
```

`empty: true` until **≥ 2** training phases have logged data (FR-020).

## 5. Frontend

```bash
cd frontend && npm run dev    # Vite dev server proxies /api to :3000
```

Navigate to `/load-tracking`:

- **Overview** table → tap an exercise row → **detail** with the load line (record annotation + dotted projection), volume bars, and last-10 table.
- A **Phases** tab shows the muscle-group radar across training blocks.
- Rest/empty states render as designed panels, never blank.

---

## How to verify the key behaviors

| Behavior                                  | How to check                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status matches flag (SC-002)              | `overview` status equals the active `progression_flags` row; same as the Session Journal / Program views    |
| Figures from completed sets only (SC-003) | `current_load_kg` / `all_time_record_kg` / `last_session_volume_kg` match the logged completed sets exactly |
| Cross-screen 1RM consistency (FR-023)     | `current_estimate_1rm_kg` equals the latest `one_rep_max_records.primary_estimate_kg`                       |
| Projection threshold (D-2, SC-006)        | < 3 sessions → `projection: null`; ≥ 3 → dotted, labelled line                                              |
| Phase attribution (SC-007)                | each session contributes to exactly one phase by its start date                                             |
| Graceful low-data (SC-005)                | no history → empty states, no errors, on all three surfaces                                                 |

---

## Test commands

```bash
npm test                                                  # full suite
npx vitest run tests/unit/engine.trendProjection.test.js  # trend + least-squares projection
npx vitest run tests/unit/loadTracking.statusMap.test.js  # 5 flags → 4 badges + deload
npx vitest run tests/unit/loadTracking.phaseRadar.test.js # avg working load per group/phase
npx vitest run tests/unit/lib.chartGeometry.test.js       # scales / line / bars / radar geometry
npx vitest run tests/contract/loadTracking.contract.test.js
cd frontend && npx vitest run --config vitest.config.js ../tests/frontend/LoadTracking.*.test.jsx
```

Contract/integration tests probe for finished-session data and skip cleanly when Supabase is unreachable (offline fallback), consistent with Phase 3/4.

---

## Boundaries (what Phase 5 does NOT do)

- Does **not** capture sessions or re-run the progression engine — it reads the `progression_flags` / `one_rep_max_records` written on Phase 4 session finish (FR-022).
- Does **not** introduce a new 1RM or progression formula — it surfaces existing engine output.
- Does **not** add a charting dependency — charts are bespoke SVG over pure geometry helpers (D-9).
- Does **not** add tables or migrations — it is pure read composition.
