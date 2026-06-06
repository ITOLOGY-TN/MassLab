# Quickstart — Phase 11: Statistics & Global Progress

Operator's guide to the read-only statistics layer and the monthly PDF export. Phase 11 adds **no schema** (0 migrations / 0 tables / 0 DAO) and **one frontend dependency** (`jspdf`).

## What ships

- **2 endpoints** (additive, read-only):
  - `GET /api/v1/statistics` → `{ data: { metrics, body, strength, attendance, nutrition, recovery } }`
  - `GET /api/v1/statistics/report?month=YYYY-MM` → `{ data: { period, summary, lifetime, topProgressions, weightSeries, recommendations } }` (`month` optional → most recently completed calendar month)
- **6 new pure engine helpers**: `statisticsMetrics`, `exerciseImprovements`, `muscleGroupProgress`, `attendanceHeatmap`, `stressWeightSeries`, `reportRecommendations`.
- **~8 new pure presenters** under `services/statistics/`.
- **1 controller + 1 route** (`statistics.controller.js`, `statistics.routes.js`) mounted with `{ daos, config }`.
- **Frontend**: `/statistics` screen — 4 metric cards + 5 tabs (Body, Strength, Attendance, Nutrition, Recovery) reusing existing SVG charts + a PDF export button; nav "Statistiques".

## Configuration (config/schema.js → .env / .env.example)

| Key | Default | Purpose |
| --- | --- | --- |
| `STATISTICS_TOP_EXERCISES` | `5` | Strength-tab top-N progressions (abs working-weight gain, kg) |
| `STATISTICS_REPORT_TOP_PROGRESSIONS` | `3` | Report top-N load progressions |
| `STATISTICS_HEATMAP_LEVELS` | `4` | Nonzero intensity buckets for the attendance heatmap |
| `STATISTICS_MIN_CORRELATION_POINTS` | `3` | Min paired points before the stress-vs-weight view is shown |

Reused (no new key): the resolved per-athlete nutrition target (`nutrition/targets.js`), `RECOVERY_SLEEP_LOW_HOURS` / `RECOVERY_STRESS_HIGH` (recovery red-flag recommendations), `NUTRITION_LOCALE` (report/recommendation strings + month labels).

## Frontend dependency

```bash
cd frontend && npm install jspdf
```

The PDF is assembled client-side: fetch `GET /statistics/report`, render the existing SVG `LineChart` for the weight series, serialize it to PNG via the browser canvas (`XMLSerializer` → `Image` → `canvas.toDataURL`), then `jspdf.addImage` + text for summary/lifetime/top-3/recommendations. No `html2canvas`, no charting library, no backend PDF infra.

## Definitions (pinned by the 2026-06-06 clarifications)

- **Total weight gained** = latest − starting body weight (signed). **Total volume since start** = Σ finished-session `total_volume_kg`. **Completion rate** = completed ÷ scheduled training sessions elapsed since `program_start_date`. **Avg weekly calories** = mean of per-ISO-week kcal totals.
- **Top-N progressions** rank by **absolute working-weight increase (kg)** since start (series = `one_rep_max_records.source_weight_kg`).
- **Muscle-group radar** axes = **progress % per group** (now vs start); insufficient data → origin.
- **Attendance heatmap** = **graded by daily training volume** (GitHub-style), level 0 = no session.
- **Stress-vs-weight** = paired points only where both a stress check-in and a weight entry exist; insufficient below the configured floor.
- **Recommendations** = deterministic rule mappings over existing signals (progression flags, calorie vs target, recovery red flags) — **no AI**.

## Run & verify

```bash
npm start                       # boots the API + serves the Vite build
# Overview:
curl -s localhost:3000/api/v1/statistics | jq '.data.metrics'
# Report (defaults to last completed month):
curl -s localhost:3000/api/v1/statistics/report | jq '.data.period, .data.recommendations'
curl -s 'localhost:3000/api/v1/statistics/report?month=2026-05' | jq '.data.summary'
```

## Tests

```bash
npm test -- statistics          # unit (engine + presenters), contract, integration
npm --prefix frontend test      # frontend smoke (tabs render, report button works from a stub)
```

- **Unit (test-first, Constitution V)**: the six engine helpers and the presenters, each with a fixed `asOf` and cold-start/insufficient-data cases.
- **Contract**: both GETs against `contracts/openapi.yaml` via Supertest (live-gated — skips without `.env`/Supabase; **no migration probe**, Phase 11 adds no schema).
- **Integration**: boots `buildApp`, asserts the composed overview, the report for a chosen month + the default-month behavior, and the cold-start shapes; asserts **no row counts change** across the GETs (SC-011).
- **Frontend smoke**: `/statistics` renders the 4 cards + 5 tabs from a stub; the report button generates without error.

## Boundary checks (must stay true)

- Read-only: no writes, no `calculation_results`/`auditWriter`, no engine/`programGenerator` call; data identical before/after (SC-011).
- Athlete-scoped: every read uses `req.athleteId`; nothing accepts an athlete id from body/query (SC-012).
- Layering: no `@supabase/supabase-js` import in `services/statistics/*` or the new `services/engine/*`; the controller is the only new DAO caller.
- No AI: every recommendation traces to a deterministic signal (SC-009).
- Determinism: clock read once at the controller (`asOf` = server UTC day); pure functions take `asOf`/config, never read the clock.
