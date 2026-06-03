# Quickstart — Phase 9: Recovery & Wellbeing

An operator's guide to the three Phase 9 surfaces, the one migration, and how to verify
the slice end-to-end. Assumes the Phase 0–8 stack is running (`npm install && npm start`
for the API, `npm --workspace frontend run dev` for the UI) against the configured
Supabase project.

## What Phase 9 adds

- **`GET/PUT /api/v1/recovery/checkin`** — the daily 30-second check-in (sleep quality
  stars, hours slept, stress, energy, mood, sore zones). One row per day; current-ISO-week
  editable.
- **`GET /api/v1/recovery/alerts`** — smart contextual alerts (cortisol warning,
  reduce-volume, full-rest) recomputed from recent check-ins. Advisory only.
- **`GET /api/v1/recovery/trends`** — energy heatmap, sleep-vs-performance scatter,
  30-day energy/stress/sleep overlay.
- **Frontend**: `/recovery` (check-in + alerts) and `/recovery/trends` (charts), plus a
  **"Récupération"** nav entry.

No new table — **one migration** extends `recovery_log` with `sleep_quality`, `mood`,
`sore_zones`.

## 1. Apply the migration

```bash
# Forward-only; replayable. Adds 3 columns to recovery_log (no new table, RLS unchanged).
supabase db push   # or apply supabase/migrations/20260603000006_extend_recovery_log_phase9.sql
```

Until this is applied, the live contract/integration tests **probe for
`recovery_log.sleep_quality` and skip** (the Phase 7/8 pattern) — the suite stays green.

## 2. Configure (all optional — safe defaults ship)

Add to `.env` only to override (see `.env.example` for the full list with comments):

```bash
RECOVERY_TREND_DAYS=30
RECOVERY_STRESS_HIGH=7
RECOVERY_STRESS_HIGH_DAYS=3
RECOVERY_SLEEP_LOW_HOURS=6
RECOVERY_ENERGY_LOW=4
RECOVERY_LOW_WINDOW_DAYS=3
RECOVERY_REST_SIGNALS=3
RECOVERY_SORE_ZONES_REST=4
RECOVERY_MOOD_OPTIONS=great,good,ok,low,bad
RECOVERY_SORE_ZONES=neck,shoulders,chest,upper_back,lower_back,biceps,triceps,forearms,abs,glutes,quads,hamstrings,calves
```

Number/date formatting reuses the existing `NUTRITION_LOCALE` (no `RECOVERY_LOCALE`).

## 3. Log today's check-in

```bash
# Partial saves are fine — send only what you have.
curl -X PUT localhost:3000/api/v1/recovery/checkin \
  -H 'content-type: application/json' \
  -d '{ "logged_on":"2026-06-03", "sleep_quality":4, "sleep_hours":7.5,
        "energy":6, "stress":5, "mood":"good", "sore_zones":["quads","lower_back"] }'

# Read it back (form state + allowed options + editable flag).
curl 'localhost:3000/api/v1/recovery/checkin?date=2026-06-03'
```

Expected: the same values returned under `data.checkin`, `data.editable: true`, and
`data.options.{moods,sore_zones}` from config.

**Boundaries to try**:
- Future date → `422 FUTURE_DATE`.
- A day in last week → `422 OUTSIDE_EDIT_WINDOW` on PUT (GET still works, read-only).
- `stress: 11` / `sleep_quality: 6` / `mood: "nope"` / `sore_zones:["left_pinky"]` → `400`.
- `sore_zones: []` → saved as "no soreness reported" (distinct from no row).

## 4. See the smart alerts

```bash
curl localhost:3000/api/v1/recovery/alerts
```

With a healthy recent pattern you get `{ data: { all_clear: true, alerts: [] } }`. Seed a
triggering pattern to see each rule (defaults):
- **High-stress/cortisol**: stress ≥ 7 on each of the last 3 check-in days.
- **Reduce volume**: avg sleep ≤ 6h AND avg energy ≤ 4 over the last 3 days.
- **Full rest**: ≥ 3 of {low sleep, low energy, high stress} in one day, OR ≥ 4 sore zones.

Each is advisory — nothing is written to the program, nutrition, or the engine.

## 5. View the trends

```bash
curl 'localhost:3000/api/v1/recovery/trends?month=2026-06'
```

- `data.heatmap.cells` — one per day of the month; `energy: null` for un-logged days.
- `data.scatter.points` — only days with **both** a check-in and a finished session
  (sleep paired with that day's `total_volume_kg`).
- `data.overlap` — aligned energy/stress/sleep arrays over `RECOVERY_TREND_DAYS`; gaps
  are `null`.

In the UI, `/recovery/trends` renders these as a calendar heatmap, an SVG scatter, and the
reused `LineChart` overlay; each shows a clear empty/low-data state when history is sparse.

## 6. Verify

```bash
npm test                      # unit (engine + presenters + chartGeometry), contract, integration, RLS
npm --workspace frontend test # RTL/jsdom smoke: form save, body diagram, mood picker, alerts, charts, empty states
npm run lint                  # import-boundary: no @supabase import outside services/dataAccess/*
```

Test-first order (Constitution V): write the failing specs for `recoveryAlerts`,
`recoveryTrends`, the `chartGeometry` helpers, and the presenters **before** their
implementations. Integration tests **snapshot-and-restore** the current-week rows so they
never destroy real recovery data.

## Boundaries (what Phase 9 does NOT do)

- No new table; no RLS change (extends the Phase 0 `recovery_log`).
- No calculator/progression/audit engine on recovery writes (FR-020) — journaling, not a
  calculation; writes no `calculation_results`.
- Never writes session data — the scatter reads finished-session volume only (FR-018).
- No catalogue/program changes; alerts never mutate any persisted plan (advisory only).
- Dashboard surfacing of alerts (Phase 10), global stats / PDF (Phase 11), and the Phase 8
  weekly self-assessment are out of scope, even where they later consume this data.
