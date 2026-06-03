# Phase 1 Data Model — Phase 9: Recovery & Wellbeing

Derives the persistence + view-model shapes from the spec's Key Entities and the
research decisions (D-1…D-8). **Phase 9 adds no new table** — it extends the Phase 0
`recovery_log` with three columns and reads the Phase 4 `session_journal` (read-only).

## 1. Migration (1 forward-only file, column adds only)

### `20260603000006_extend_recovery_log_phase9.sql`

```sql
-- Phase 9 (012-phase9-recovery-wellbeing) — extend the Phase 0 daily recovery log
-- with the three signals this phase introduces. No new table; RLS unchanged (the
-- Phase 0 recovery_log_select_own / recovery_log_modify_own policies already key on
-- athlete_id and cover added columns). Forward-only, replayable.

-- Sleep quality stars (1–5), distinct from sleep_hours.
alter table public.recovery_log
  add column if not exists sleep_quality int
    check (sleep_quality is null or sleep_quality between 1 and 5);

-- Mood key (validated at the controller against RECOVERY_MOOD_OPTIONS).
alter table public.recovery_log
  add column if not exists mood text;

-- Set of sore muscle zones (no per-zone intensity, research D-1). Empty set = the
-- athlete reported no soreness that day (distinct from "no check-in" = no row).
alter table public.recovery_log
  add column if not exists sore_zones text[] not null default '{}';
```

**Notes**

- **No new RLS**: a pure `ALTER TABLE … ADD COLUMN` inherits the existing row policies.
  The migration ships **no** `create policy` (the table already enables RLS with
  `*_own` select/modify keyed on `athlete_id`).
- **Existing columns reused** (unchanged): `sleep_hours numeric(3,1)`,
  `energy int (0–10)`, `stress int (0–10)`, `note text`,
  `unique (athlete_id, logged_on)` (the per-day upsert key).
- **`soreness int (0–10)`** stays in the table but is **deprecated/superseded** by
  `sore_zones` (clarification). New writes do not set it; reads ignore it.
- **Live tests gate on `recovery_log.sleep_quality`** existing (probe-and-skip), the
  Phase 7/8 pattern, so the suite is green before and after the migration is applied.

## 2. Resulting `recovery_log` shape (post-migration)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | bigint identity PK | existing |
| `athlete_id` | uuid FK → athletes | existing; RLS + tenant key |
| `logged_on` | date | existing; day grain, part of unique key |
| `sleep_hours` | numeric(3,1) | existing; bounded 0–24 at controller |
| `soreness` | int (0–10) | existing; **deprecated** (superseded by `sore_zones`) |
| `energy` | int (0–10) | existing; reused |
| `stress` | int (0–10) | existing; reused |
| `note` | text | existing; optional free note |
| **`sleep_quality`** | **int (1–5)** | **new** — stars |
| **`mood`** | **text** | **new** — one of `RECOVERY_MOOD_OPTIONS` |
| **`sore_zones`** | **text[] NOT NULL DEFAULT '{}'** | **new** — set of `RECOVERY_SORE_ZONES` |
| `created_at` | timestamptz default now() | existing |

Unique: `(athlete_id, logged_on)` → one check-in per athlete per day (FR-002).

## 3. DAO layer (`services/dataAccess/`)

All methods are athlete-scoped (Constitution I) and the only Phase 9 code that imports
the Supabase client (Constitution II). Errors map to `HttpError(500,'DB_ERROR',…)` like
the sibling DAOs.

### 3a. `recovery.dao.js` (NEW — sole reader/writer of `recovery_log` for Phase 9)

| Method | Signature | Purpose |
| --- | --- | --- |
| `getForDay` | `(athleteId, loggedOn) → row \| null` | The check-in for one day (form state). |
| `upsert` | `(athleteId, loggedOn, fields) → row` | Create/replace the day's check-in. `onConflict: 'athlete_id,logged_on'`. Only sets columns present in `fields` (partial save, FR-003); never substitutes a value for an omitted field. |
| `listRange` | `(athleteId, { from, to }) → row[]` | Inclusive date range, ascending — feeds alerts (recent window) + trends (heatmap/overlay). |

**Upsert semantics (FR-002/FR-003)**: build the upsert payload from only the keys the
controller validated as present; absent signals are left untouched on an existing row
and `NULL`/`'{}'` on a fresh row. `sore_zones: []` is an **explicit** value ("no
soreness"), distinct from omitting it.

### 3b. `sessions.dao.js` (EXTENDED — one thin read-only method, FR-018/D-7)

| Method | Signature | Purpose |
| --- | --- | --- |
| `dailyTrainingVolumes` | `(athleteId, { from, to }) → [{ ended_at, total_volume_kg }]` | Finished sessions (`ended_at IS NOT NULL`) in range. Read-only — Phase 9 never writes sessions. The pure `sleepPerformanceScatter` buckets these by calendar day. |

### 3c. `reset.dao.js` — **no change**

`recovery_log` is already a reset module (`MODULE_TABLES.recovery = ['recovery_log']`)
and in `FULL_WIPE_ORDER`. Adding columns does not change the wipe; the array column is
removed with the row. No edit required.

## 4. Pure engine modules (`services/engine/`) — test-first (Constitution V)

### 4a. `recoveryAlerts.js`

```
evaluateAlerts(recentCheckins, { asOf, thresholds }) → Alert[]
```
- `recentCheckins`: ascending `recovery_log` rows over the alert look-back window.
- `thresholds`: `{ stressHigh, stressHighDays, sleepLowHours, energyLow, lowWindowDays,
  restSignals, soreZonesRest }` (resolved from config at the controller boundary).
- `asOf`: server "today" (`YYYY-MM-DD`), injected — never read inside.
- Returns an ordered `Alert[]` (`{ kind, severity, message_key, context }`) for the
  rules in research D-4; each rule is **suppressed** when its window lacks enough
  check-ins (FR-011). No I/O, no clock, no globals.

### 4b. `recoveryTrends.js`

```
energyHeatmap(checkins, { year, month }) → { cells: [{ date, energy|null }], … }
sleepPerformanceScatter(checkins, volumeByDay) → [{ date, sleep_hours, volume_kg }]
overlapSeries(checkins, { from, to }) → { days: string[], energy:(n|null)[], stress:(n|null)[], sleep:(n|null)[] }
```
- `energyHeatmap`: one entry per calendar day of the month; `energy = null` for days with
  no check-in (rendered uncolored, FR-013).
- `sleepPerformanceScatter`: emits a point **only** for days present in **both**
  `checkins` (with a sleep value) and `volumeByDay` (FR-014, edge case "missing pairs").
  `volumeByDay` is `{ 'YYYY-MM-DD': total_volume_kg }`, built by bucketing
  `sessions.dao.dailyTrainingVolumes` at the controller.
- `overlapSeries`: aligned arrays over the day axis; gaps are `null` (never `0`).

## 5. Pure presenters (`services/recovery/`) — view assembly, no I/O

### 5a. `checkinView.js`

```
build({ row, date, editable, moodOptions, soreZoneList }) → CheckinView
```
- `CheckinView`: `{ date, editable, checkin: { sleep_quality, sleep_hours, energy,
  stress, mood, sore_zones, note } | null, options: { moods, sore_zones } }`.
- `editable` = `isCurrentIsoWeek(date, asOf)` (computed at controller, passed in).
- `options.moods` / `options.sore_zones` come from config so the UI hardcodes neither.

### 5b. `alertsView.js`

```
build({ alerts }) → { alerts: Alert[], all_clear: boolean }
```
- `all_clear` true when `alerts` is empty (renders an encouraging state, FR-016).

### 5c. `trendsView.js`

```
build({ heatmap, scatter, overlap }) → TrendsView
```
- Bundles the three engine outputs + low-data flags (`has_data` per chart) so each chart
  renders a clear empty/low-data state without error (FR-016/SC-009).

## 6. View-model contracts (response `data` shapes)

`GET /recovery/checkin?date=YYYY-MM-DD`
```json
{
  "data": {
    "date": "2026-06-03",
    "editable": true,
    "checkin": {
      "sleep_quality": 4, "sleep_hours": 7.5, "energy": 6, "stress": 5,
      "mood": "good", "sore_zones": ["quads", "lower_back"], "note": null
    },
    "options": {
      "moods": ["great", "good", "ok", "low", "bad"],
      "sore_zones": ["neck", "shoulders", "chest", "upper_back", "lower_back",
        "biceps", "triceps", "forearms", "abs", "glutes", "quads", "hamstrings", "calves"]
    }
  }
}
```
(`"checkin": null` when nothing is logged for `date`.)

`PUT /recovery/checkin`  → body any subset of the check-in fields + `logged_on`; returns
the persisted row under `data`.

`GET /recovery/alerts`
```json
{ "data": { "all_clear": false, "alerts": [
  { "kind": "high_stress", "severity": "warning", "message_key": "recovery.alert.high_stress",
    "context": { "days": 3, "threshold": 7 } },
  { "kind": "reduce_volume", "severity": "advice", "message_key": "recovery.alert.reduce_volume",
    "context": { "avg_sleep": 5.5, "avg_energy": 3 } }
] } }
```

`GET /recovery/trends?month=YYYY-MM`
```json
{ "data": {
  "heatmap": { "year": 2026, "month": 6, "cells": [{ "date": "2026-06-01", "energy": 6 }, …] },
  "scatter": { "has_data": true, "points": [{ "date": "2026-06-02", "sleep_hours": 7, "volume_kg": 4200 }, …] },
  "overlap": { "days": ["…"], "energy": [6, null, 7], "stress": [5,4,6], "sleep": [7,6.5,null] }
} }
```

## 7. Validation rules (controller boundary)

| Field | Rule | On violation |
| --- | --- | --- |
| `logged_on` | real `YYYY-MM-DD` (rollover-safe, `isRealIsoDate`) | 400 VALIDATION_FAILED |
| `logged_on` | not in the future | 422 FUTURE_DATE |
| `logged_on` | within current ISO week (`isCurrentIsoWeek`) | 422 OUTSIDE_EDIT_WINDOW |
| `sleep_quality` | int 1–5 (optional) | 400 VALIDATION_FAILED |
| `sleep_hours` | number 0–24 (optional) | 400 VALIDATION_FAILED |
| `energy` / `stress` | int 0–10 (optional) | 400 VALIDATION_FAILED |
| `mood` | in `RECOVERY_MOOD_OPTIONS` (optional) | 400 VALIDATION_FAILED |
| `sore_zones` | array; each in `RECOVERY_SORE_ZONES` (optional; `[]` allowed) | 400 VALIDATION_FAILED |
| `note` | string ≤ reasonable cap (optional) | 400 VALIDATION_FAILED |

All fields except `logged_on` are individually optional (partial save, FR-003). The
clock is read **once** at the controller (`isoDay(now())`) and passed to the pure
guards/engine — never read inside a pure function (determinism, mirrors Phase 6/7/8).

## 8. Frontend chart geometry (`frontend/src/lib/chartGeometry.js`) — pure, unit-tested

| Helper | Signature | Returns |
| --- | --- | --- |
| `calendarMonth` | `({ year, month, weekStartsOn = 1 })` | `[{ date, row, col, x, y, inMonth }]` — month grid (Monday-start), for `CalendarHeatmap`. |
| `scatterPoints` | `({ points, xScale, yScale })` | `[{ cx, cy, datum }]` — pixel positions, for `ScatterPlot`. Reuses `linearScale` for the axes. |

The 30-day overlay reuses `linePath` + `linearScale` + `niceTicks` and the existing
`LineChart` (energy + stress share the 0–10 axis; sleep hours are plotted against a secondary right-hand axis so its scale stays honest).
