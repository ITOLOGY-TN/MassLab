# Phase 0 Research — Phase 9: Recovery & Wellbeing

This document resolves the design unknowns before Phase 1. Each decision is framed
as **Decision / Rationale / Alternatives considered**. The four 2026-06-03
clarifications (editable window, soreness model, energy/stress scale, alert
thresholds) are already settled in the spec; this file records how they translate
into the implementation, plus the remaining structural choices.

## D-1 — Schema: extend `recovery_log` (no new table); soreness becomes a zone set

**Decision**: Add three columns to the existing Phase 0 `recovery_log` table in **one
forward-only migration** — `sleep_quality int CHECK (sleep_quality between 1 and 5)`,
`mood text`, and `sore_zones text[] NOT NULL DEFAULT '{}'`. Keep the existing scalar
`soreness int (0–10)` column but treat it as **deprecated/superseded** by `sore_zones`
(the clarified soreness model). No new table, no new RLS policy — the migration is a
pure `ALTER TABLE … ADD COLUMN` and the Phase 0 `recovery_log_select_own` /
`recovery_log_modify_own` policies already key on `athlete_id` and cover added columns.

**Rationale**: The per-day check-in already has a home (`recovery_log`, one row per
`(athlete_id, logged_on)`), so a new table would duplicate that grain. "A set of sore
zones with no per-zone intensity" (clarification) is exactly a set — a `text[]` column
models it directly and keeps the per-day save **atomic** (one upsert, no child-row
fan-out, no second RLS policy to maintain). Zones are validated at the controller
against a config-driven allow-list, so the DB stays schema-light. Energy and stress
stay on the existing 0–10 columns (clarification) → zero migration risk to seeded data.

**Alternatives considered**:
- **Child table `recovery_sore_zones(athlete_id, logged_on, zone)`** — more normalized
  and trivially queryable for future "most-sore zone" stats (Phase 11), but adds a
  second migration, a second RLS policy, a second DAO, and a non-atomic save (upsert
  the row + diff the zone set). Rejected: the array column meets every Phase 9
  requirement; if Phase 11 needs zone-frequency analytics, `unnest(sore_zones)` covers
  it without a schema change.
- **`jsonb` blob for all new fields** — flexible but untyped; loses the `CHECK` on
  sleep quality and array semantics. Rejected: explicit typed columns are clearer and
  testable.
- **Replace (drop) the scalar `soreness` column** — cleaner, but a destructive,
  non-forward-only change to a Phase 0 table with possibly-seeded data. Rejected: keep
  it, mark deprecated; the zone set is the source of truth going forward.

## D-2 — Editable window = current ISO week only (reuse the Phase 8 guard)

**Decision**: `PUT /recovery/checkin` accepts a `logged_on` only when it is **not in
the future** AND falls in the **current ISO week** (Monday–Sunday). Prior weeks are
viewable (GET works for any past date) but immutable. Reuse the already-shipped pure
helper `services/supplements/week.js` (`isoWeekStart`, `isCurrentIsoWeek`) for the
guard — it is generic ISO-week math with no supplement coupling.

**Rationale**: Matches the clarification verbatim and the established Phase 8
convention, so the app has **one** editable-window rule across daily-logging features.
Reusing `week.js` avoids a third copy of ISO-week math (Phase 4 `calendar.js` has
`isoDayOfWeek`; Phase 8 `week.js` has the week-start/`isCurrentIsoWeek` helpers).

**Alternatives considered**:
- **Today-only** — simplest, but loses the ability to backfill a forgotten yesterday,
  hurting the 30-day/monthly trends. Rejected by the clarification.
- **Unbounded past (Phase 7 nutrition style)** — easiest validation (future-date guard
  only) but lets the athlete rewrite arbitrarily old history, eroding "honest record".
  Rejected by the clarification.
- **A new `services/recovery/week.js`** duplicating the helper — rejected; the existing
  pure helper is import-safe and identical. (If cross-domain import ever feels wrong,
  a later refactor can hoist it to `services/engine/isoWeek.js`; not needed now.)

## D-3 — Rating scales: energy/stress 0–10 (existing), sleep quality 1–5, hours 0–24

**Decision**: Energy and stress reuse the existing `recovery_log` **0–10** integer
columns. `sleep_quality` is the new **1–5** star column. `sleep_hours` (existing) is
bounded **0–24** at the controller. Mood is a free-text column constrained at the
controller to the config-driven allow-list. The alert thresholds (D-4) are expressed
in these units.

**Rationale**: The clarification chose "keep 0–10" to avoid migrating/re-scaling the
existing columns and any seeded data. Sleep quality is a genuinely new signal, so 1–5
stars is a fresh column with a `CHECK`. Keeping the units explicit lets the pure alert
rules read naturally (`stress >= 7`, `energy <= 4`).

**Alternatives considered**:
- **Uniform 1–5 for energy/stress** — nicer UI symmetry but requires repurposing the
  0–10 columns and re-scaling seeded data. Rejected by the clarification.
- **Store sleep quality on 0–10 too** — over-precise for a star rating; 1–5 matches the
  "stars" UX and the Phase 8 self-assessment scale.

## D-4 — Smart alerts: deterministic, configurable, advisory, not persisted

**Decision**: A single pure function `evaluateAlerts(recentCheckins, { asOf,
thresholds })` returns an **ordered list** of alert objects
(`{ kind, severity, message_key, context }`). Three rules with **configurable defaults**
(from the clarification):
- `high_stress` — stress ≥ `RECOVERY_STRESS_HIGH` (default **7**) on each of the last
  `RECOVERY_STRESS_HIGH_DAYS` (default **3**) **consecutive** days that have a check-in.
- `reduce_volume` — over the last `RECOVERY_LOW_WINDOW_DAYS` (default **3**) days with a
  check-in, **average** sleep ≤ `RECOVERY_SLEEP_LOW_HOURS` (default **6**) **AND**
  average energy ≤ `RECOVERY_ENERGY_LOW` (default **4**).
- `full_rest` — on a single recent day, **≥ `RECOVERY_REST_SIGNALS`** (default **3**) of
  {low sleep, low energy, high stress} hold at once, **OR** that day's `sore_zones`
  count ≥ `RECOVERY_SORE_ZONES_REST` (default **4**).
A rule is **suppressed** when its window has fewer check-ins than it needs (FR-011).
Alerts are **recomputed on read**, **never persisted**, and the function performs **no
I/O** and triggers **no engine** (FR-012/FR-020).

**Rationale**: Constitution V puts "any function … surfaced as a recommendation" under
test-first — alerts are recommendations, so they live in a pure, unit-tested engine
module with the clock and thresholds injected. Configurable thresholds satisfy
Constitution III (no magic numbers in source). Not persisting them keeps the data model
honest (the log holds facts; alerts are a derived view).

**Alternatives considered**:
- **Persist alerts as rows** — would let the dashboard (Phase 10) read them directly,
  but introduces staleness and a write path on a read concern. Rejected: recompute on
  read; Phase 10 can call the same pure function.
- **Hardcode thresholds** — violates Constitution III. Rejected.
- **One alert at a time (highest severity)** — simpler UI, but the spec shows multiple
  simultaneous alerts; return an ordered list and let the view cap how many it shows.

## D-5 — No engine, no audit (recovery logging is journaling)

**Decision**: Recovery check-in writes call **only** `recovery.dao.upsert`. They do
**not** invoke the calculators, the progression engine, `programGenerator`, or
`auditWriter`, and write **no** `calculation_results` row.

**Rationale**: Mirrors the Phase 7 food/water and Phase 8 supplement boundary — a
subjective daily log is recording, not a calculation whose replay must survive default
changes. The audit log is reserved for persisted engine calculations (1RM, progression,
body composition).

**Alternatives considered**: Auditing check-ins "for completeness" — rejected; it would
pollute `calculation_results` with non-calculations and contradict FR-020.

## D-6 — Reuse the pure ISO-week + chart primitives; add only what's missing

**Decision**: Reuse `services/supplements/week.js` (ISO-week guard) and the Phase 5
`components/charts/LineChart.jsx` + `frontend/src/lib/chartGeometry.js`
(`linearScale`, `linePath`, `niceTicks`). Add **only** two new pure geometry helpers:
`calendarMonth({ year, month, weekStartsOn })` (lays out a month's day cells into a
7-column grid → `{ date, row, col, x, y }[]`) and `scatterPoints({ points, xScale,
yScale })` (`{ cx, cy, datum }[]`). Both are unit-tested like `gaugeArc`/`donutSegments`.

**Rationale**: The 30-day energy/stress/sleep overlay is three line series on a shared
day axis — exactly what `LineChart`/`linePath` already render (energy & stress on 0–10;
sleep hours normalized to its own scale or a secondary axis). The heatmap and scatter
are the only genuinely new geometry, and they are small, pure, and testable. No charting
library is introduced (Constitution VI / existing precedent).

**Alternatives considered**:
- **A charting library (recharts/visx)** — rejected; the project deliberately
  hand-rolls SVG with unit-tested geometry (Phase 5 decision D-9).
- **Render the heatmap as an HTML table** (like the Phase 8 weekly grid) — viable, but a
  month calendar with color buckets reads better as positioned SVG cells, and the
  geometry helper keeps the layout testable. Either is acceptable; SVG chosen for
  consistency with the other two charts on the same page.

## D-7 — Scatter performance axis = per-day finished-session volume (read-only)

**Decision**: "Performance" is the day's **finished-session `total_volume_kg`**. Add one
thin read-only method `sessions.dao.dailyTrainingVolumes(athleteId, { from, to })` that
returns finished sessions (`ended_at IS NOT NULL`) in range as
`[{ ended_at, total_volume_kg }]`; the pure `sleepPerformanceScatter` buckets them by
calendar day and pairs each day's volume with that day's check-in sleep. Only days with
**both** a check-in and a finished session emit a point (FR-014, edge case). Phase 9
**never writes** session data (FR-018).

**Rationale**: `total_volume_kg` is the canonical per-session performance number already
finalized at session finish (Phase 4) and reused by Phase 5. Bucketing by day lives in
the pure trends function (testable); the DAO stays a thin reader. Keeping the DAO method
read-only honors the Phase 3/5 rule that only Phase 4 writes sessions.

**Alternatives considered**:
- **e1RM or top-set weight as the performance axis** — richer but ambiguous across a
  multi-exercise day; total volume is the natural daily scalar. Rejected for the scatter
  (per-exercise strength trends are Phase 5's job).
- **Compute per-day volume inside the DAO** — pushes bucketing logic into the data layer;
  rejected to keep the DAO thin and the math unit-tested in the pure function.

## D-8 — Config keys (Constitution III)

**Decision**: Add the following `.env` keys (zod-validated in `config/schema.js`, listed
in `.env.example`), all with safe defaults so the phase boots with no `.env` edits:

| Key | Default | Meaning |
| --- | --- | --- |
| `RECOVERY_TREND_DAYS` | `30` | Rolling window (days) for the energy/stress/sleep overlay. |
| `RECOVERY_STRESS_HIGH` | `7` | Stress ≥ this counts as "high" (0–10). |
| `RECOVERY_STRESS_HIGH_DAYS` | `3` | Consecutive high-stress days that trigger the cortisol warning. |
| `RECOVERY_SLEEP_LOW_HOURS` | `6` | Average sleep ≤ this is "low". |
| `RECOVERY_ENERGY_LOW` | `4` | Average energy ≤ this is "low" (0–10). |
| `RECOVERY_LOW_WINDOW_DAYS` | `3` | Window (days) for the reduce-volume averages. |
| `RECOVERY_REST_SIGNALS` | `3` | Poor-signal count in a day that triggers full-rest. |
| `RECOVERY_SORE_ZONES_REST` | `4` | Sore-zone count in a day that triggers full-rest. |
| `RECOVERY_MOOD_OPTIONS` | `great,good,ok,low,bad` | Allowed mood keys (UI maps to emoji + localized label). |
| `RECOVERY_SORE_ZONES` | `neck,shoulders,chest,upper_back,lower_back,biceps,triceps,forearms,abs,glutes,quads,hamstrings,calves` | Allowed body-diagram zones. |

`RECOVERY_LOCALE` is **not** added — reuse the existing `NUTRITION_LOCALE` for
number/date formatting (single localization seam).

**Rationale**: Every threshold and list the spec calls "configurable" becomes an env key
with a default, so acceptance tests assert concrete behavior while nothing is hardcoded.
The mood/zone lists are surfaced by `GET /recovery/checkin` so the frontend renders
allowed options from server config (localization seam intact).

**Alternatives considered**:
- **Frontend Vite vars for the mood/zone lists** (Phase 4 autosave-cadence style) —
  rejected; the backend must validate against the same list, so it owns the source of
  truth and exposes it to the client.
- **A single JSON blob env key for all thresholds** — compact but unvalidated per-field;
  rejected in favor of typed, individually-defaulted zod keys.

## Summary of decisions

| ID | Decision |
| --- | --- |
| D-1 | Extend `recovery_log` (+`sleep_quality`/`mood`/`sore_zones[]`), no new table; scalar soreness superseded by the zone set. |
| D-2 | Editable window = current ISO week only; reuse the pure `week.js` guard. |
| D-3 | Energy/stress 0–10 (existing), sleep quality 1–5, hours 0–24. |
| D-4 | Three deterministic, configurable, **non-persisted**, advisory alerts via one pure `evaluateAlerts`. |
| D-5 | No calculator/progression/audit engine on recovery writes (journaling, not calculation). |
| D-6 | Reuse ISO-week + `LineChart`/`chartGeometry`; add only `calendarMonth` + `scatterPoints`. |
| D-7 | Scatter performance = per-day finished-session volume via one thin read-only `sessions.dao` method. |
| D-8 | `RECOVERY_*` config keys (thresholds, window, mood/zone lists) with safe defaults; reuse `NUTRITION_LOCALE`. |

All NEEDS CLARIFICATION items are resolved (the spec's four clarifications + these
structural decisions). Ready for Phase 1 design artifacts.
