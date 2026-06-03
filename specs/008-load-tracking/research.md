# Phase 0 Research — Phase 5: Load Tracking & Progression Algorithm

**Feature**: `008-load-tracking` | **Date**: 2026-06-02

No open `NEEDS CLARIFICATION` markers remain (four spec clarifications were resolved on 2026-06-02). The decisions below shape the data model, contracts, and tasks, each with rationale and rejected alternatives, D-numbered for reference from `tasks.md`.

Phase 5 is a **read-and-visualize layer** — it writes nothing and re-implements no training rule. It reuses, unchanged: `services/engine/oneRepMax.js` (estimate), `services/engine/exerciseHistory.js` (`heaviestCompletedSet`, `lastWeightUsed`, `feedSet`), `services/sessionJournal/currentPhase.js` (phase derivation), and the persisted `progression_flags` / `one_rep_max_records` / `session_journal_entries` / `session_sets` that Phase 4 writes on every session finish. **0 migrations, 0 new tables.**

---

## D-1 — The estimated-1RM time series comes from `one_rep_max_records`

**Decision**: The per-exercise estimated-1RM series (used by the trend, the projection, and the detail's load/1RM charts) is read from `one_rep_max_records` filtered to the exercise, ordered by `created_at`. Each row is one finished session's snapshot: `created_at` (session finish ≈ session date), `source_weight_kg` (the heaviest completed set that session — the feed set), `source_reps`, and `primary_estimate_kg` (the e1RM). So one query yields `[{ date, working_load_kg, estimate_1rm_kg }]` per exercise without touching `session_sets`.

**Rationale**: Phase 4's finish path writes exactly one `one_rep_max_records` row per performed exercise per session, fed by `heaviestCompletedSet`. That makes the table a compact, already-computed time series of both the working load (`source_weight_kg`) and the engine e1RM (`primary_estimate_kg`) — the two things the load/1RM charts and the trend need — with no re-derivation and guaranteed consistency with what the Session Journal showed (clarification Q1; FR-008/FR-011/FR-014/FR-023).

**Alternatives considered**:

- _Re-derive the e1RM series from `session_sets` per session_ — rejected: duplicates the Phase 4 feed-set + `oneRepMax` logic and risks a different number than the persisted record (SC-002/SC-003 consistency).

**Touches**: new `oneRepMaxRecords.dao` read (`seriesForAthlete`), `services/loadTracking/exerciseProgressView.js`.

---

## D-2 — 8-week projection = least-squares linear fit over the e1RM series (≥ 3 points)

**Decision**: A new pure `services/engine/trendProjection.js` exposes `projectOneRm({ series, weeksAhead = 8, minPoints = 3, now })`: fit a least-squares line to the recent estimated-1RM points (x = days since the first point, y = `estimate_1rm_kg`), then emit projected points 8 weeks forward. Returns `null` when fewer than 3 qualifying points exist. The projection is data only; the chart draws it dotted and labelled (clarification Q2, FR-015).

**Rationale**: Least-squares is the standard, noise-robust linear extrapolation and is a small deterministic pure function (Constitution V — testable). A `≥ 3`-point floor avoids drawing a "trend" from two sessions. No AI, no stored prediction.

**Alternatives considered**:

- _First-to-last slope_ — rejected: two outlier sessions distort the whole projection.
- _Average per-week gain_ — rejected: equivalent to first-to-last for evenly spaced points and noisier otherwise.

**Touches**: new pure `services/engine/trendProjection.js`, `exerciseProgressView.js`.

---

## D-3 — Trend direction = signed e1RM change over the last ~30 days, with a flat band

**Decision**: `trendProjection.js` also exposes `trendDirection({ series, windowDays = 30, flatBandPct = 1, now })` → `{ direction: 'up' | 'flat' | 'down', change_pct }`. It compares the latest in-window estimate to the earliest in-window estimate and classifies as `flat` when `|change_pct| ≤ flatBandPct` (a **fixed 1% presentation dead-band**), else `up`/`down`. Neutral (`null`) when the window has < 2 points. `windowDays` defaults to **30**.

**Rationale**: The trend is the estimated-1RM movement (clarification Q1) over a fixed 30-day horizon. The 1% dead-band is a fixed presentation constant — explicitly **NOT** the engine's `on_pace_pct_per_month`, which is a separate "on pace for the goal" threshold and is not used here. A dead-band keeps tiny rounding wobble from reading as a real trend (FR-008). Pinning the window + band makes the trend deterministically testable.

**Touches**: `services/engine/trendProjection.js`, `services/loadTracking/overviewView.js`.

---

## D-4 — All-time record = the heaviest completed set ever (max `source_weight_kg`)

**Decision**: The all-time record is the maximum `source_weight_kg` across the exercise's `one_rep_max_records` (equivalently, the all-time heaviest completed set, since the feed set is the session's heaviest completed set). It is shown as a kg figure and annotated on the load chart, separate from the estimated 1RM (clarification Q3, FR-006/FR-014).

**Rationale**: `source_weight_kg` already is the per-session heaviest completed set, so its all-time max is the record with no extra read. Annotating an actual lifted weight on a load-over-time chart is concrete and unambiguous (vs. an abstract e1RM line, which is shown separately).

**Alternatives considered**:

- _Highest estimated 1RM as the "record"_ — rejected (Q3): overlaps with the e1RM figure already displayed and isn't a real lifted weight.

**Touches**: `services/loadTracking/{overviewView,exerciseProgressView}.js`.

---

## D-5 — Progression status maps the persisted flags onto 4 badges + a deload notice

**Decision**: A new pure `services/loadTracking/statusMap.js` → `overviewStatus({ exerciseFlagType, muscleGroupFlagType })` returns one of `ready_to_increase | maintain | stagnation | regressing`, resolved as: the **exercise-scope** flag wins first (`add_load` → `ready_to_increase`, `regression` → `regressing`); when the exercise has no actionable own flag, its **muscle-group** `stagnation` → `stagnation`; otherwise `maintain`. The muscle-group `deload_suggested` flag is returned **separately** as a muscle-group-level notice, never as one of the four per-exercise badges (FR-002/FR-003/FR-004, clarification on the 5→4 mapping in the spec Assumptions).

**Rationale**: The engine emits `add_load`/`regression` at exercise scope and `stagnation`/`deload_suggested` at muscle-group scope; the overview is per-exercise, so the per-exercise badge must privilege the exercise's own signal and only fall back to its muscle group's stagnation. Reading the persisted active flags (not recomputing) keeps Phase 5 read-only and consistent with the Phase 3 indicator (FR-022).

**Alternatives considered**:

- _Recompute the flags in Phase 5_ — rejected: violates FR-022 and duplicates the Phase 1 engine.
- _Fold deload into the stagnation badge_ — rejected: deload is a distinct, time-boxed recommendation; collapsing it loses meaning.

**Touches**: new pure `services/loadTracking/statusMap.js`, `overviewView.js`; reads `progressionFlags.dao.findActiveForAthlete`.

---

## D-6 — Current load & estimated 1RM reuse the Phase 3/4 definitions

**Decision**: "Current working load" = `exerciseHistory.lastWeightUsed` over the exercise's recent sessions (the heaviest completed set of the most recent session); the "current estimated 1RM" = the most recent `one_rep_max_records.primary_estimate_kg` (equivalently the latest series point). No new formula.

**Rationale**: These are the exact figures the Session Journal and Training Program already show; reusing them guarantees no cross-screen contradiction (FR-005/FR-023, SC-002/SC-003).

**Touches**: reuses `services/engine/exerciseHistory.js`, `oneRepMaxRecords.dao`; `overviewView.js`.

---

## D-7 — Phase attribution generalizes `currentTrainingPhase` to `phaseForDate`

**Decision**: Add a pure `phaseForDate({ phases, programStartDate, date })` (a small generalization of Phase 4's `currentTrainingPhase`, which is the special case `date = now`) that returns the phase whose cumulative-weeks window contains the date. Sessions are bucketed into phases by their `started_at` for the radar (FR-018).

**Rationale**: Phase 4 already derives "current phase" from `program_start_date` + cumulative phase `weeks`; the radar needs the same logic for an arbitrary date. Extracting `phaseForDate` and having `currentTrainingPhase` delegate to it (with `date = now`) keeps one source of truth and stays pure.

**Alternatives considered**:

- _Store a phase id on each session_ — rejected: no such column exists and the date-derivation is deterministic; adding state invites drift (consistent with Phase 4 D-8).

**Touches**: `services/sessionJournal/currentPhase.js` (extract `phaseForDate`, reuse), `services/loadTracking/phaseRadarView.js`.

---

## D-8 — Radar metric = average of each session's top working load (kg) per muscle group, per phase

**Decision**: For each (phase, muscle group), the radar value is the **mean over sessions in that phase** of that session's top working load for the muscle group. Computed from `one_rep_max_records` (`source_weight_kg` = the session's heaviest completed set per exercise) grouped exercise → muscle group → phase: per session, take the max `source_weight_kg` across the muscle group's exercises in that session, then average those per-session values across the phase. Muscle groups with no work in a phase read as 0/absent (clarification Q4, FR-017/FR-019).

**Rationale**: Matches PLAN.md's literal "average load per muscle group across phases" and reuses the already-persisted feed-set weights, so the radar agrees with the load shown elsewhere. Averaging per-session tops (not all sets) avoids over-weighting high-volume sessions.

**Alternatives considered**:

- _Average session volume_ / _average e1RM_ — rejected (Q4): volume conflates load and reps; e1RM is abstract on a kg radar axis.

**Touches**: `services/loadTracking/phaseRadarView.js`, `phaseForDate` (D-7), `muscleGroups.dao` (names/colors).

---

## D-9 — Charts are hand-rolled lightweight SVG with pure geometry helpers (no new dependency)

**Decision**: Render the load line (+ record annotation + dotted projection), the volume bars, and the phase radar as **bespoke SVG components** driven by pure geometry helpers in `frontend/src/lib/chartGeometry.js` (`linearScale`, `linePath`, `barRects`, `radarPolygon`, `niceTicks`). No charting library is added.

**Rationale**: The frontend has **no** chart dependency today, and the constitution mandates a premium, sport-focused, Tailwind-token aesthetic (generic chart libraries fight that). Hand-rolled SVG (1) adds **no runtime dependency**, (2) gives full styling control via design tokens, and (3) makes the chart math pure and unit-testable (Constitution V) — the scales/paths/polygon are deterministic functions of the data. The three chart types (line, bars, radar) are each a small amount of SVG.

**Alternatives considered**:

- _recharts / chart.js / nivo_ — rejected: a heavy new runtime dependency, a generic look that the Frontend Design skill would reject, and chart internals that aren't unit-testable. (Revisit only if later phases need many complex interactive chart types.)

**Touches**: new `frontend/src/lib/chartGeometry.js` (pure, tested), `frontend/src/components/charts/{LineChart,BarChart,RadarChart}.jsx`.

---

## D-10 — Composed read-only `/api/v1/load-tracking/*` endpoints + a pure `services/loadTracking/` boundary

**Decision**: Add three read endpoints — `GET /load-tracking/overview`, `GET /load-tracking/exercises/:id`, `GET /load-tracking/phase-comparison` — each returning a fully composed view model produced by the pure `services/loadTracking/*` presenters (mirroring Phase 3's `services/trainingProgram/`). Controllers read DAOs and hand plain data to the presenters; the only Supabase imports stay in `services/dataAccess/*`. No write endpoints, no migration.

**Rationale**: Server-side composition keeps the client thin, makes the empty/low-data rules testable in one pure place, and keeps every figure consistent (computed once). Mirrors the established Phase 3/4 layering (thin route → controller → pure presenter → DAO).

**Touches**: new `routes/loadTracking.routes.js`, `controllers/loadTracking.controller.js`, `services/loadTracking/*`, one `v1.use('/load-tracking', …)` line in `app.js`.

---

## D-11 — Volume-per-session and the last-10 table come from session history, not the 1RM records

**Decision**: The volume-per-session bars and the last-10-sessions table are sourced from `session_journal_entries` + `session_sets` (via `sessions.dao`), because `one_rep_max_records` only carries the feed set, not the full set list needed for per-session volume (Σ weight×reps) and per-session reps. A new read `sessions.dao.recentSessionVolumesForExercise(athleteId, exerciseId, { limit })` returns `[{ session_id, date, top_weight_kg, total_volume_kg, top_reps }]`.

**Rationale**: Per-session volume needs every completed set, which only `session_sets` has. Keeping the read in the DAO (Supabase boundary) and returning a small per-session rollup keeps the presenter pure and the table/bars accurate (FR-007/FR-012/FR-013).

**Touches**: new `sessions.dao` read, `exerciseProgressView.js`.

---

## Summary of decisions

| ID   | Decision                                                        | Primary artifact(s)                                 |
| ---- | --------------------------------------------------------------- | --------------------------------------------------- |
| D-1  | e1RM/working-load series from `one_rep_max_records`             | `oneRepMaxRecords.dao`, `exerciseProgressView.js`   |
| D-2  | 8-week projection = least-squares fit (≥3 pts)                  | `engine/trendProjection.js`                         |
| D-3  | Trend = signed e1RM change over ~30 days, flat band             | `engine/trendProjection.js`, `overviewView.js`      |
| D-4  | Record = max `source_weight_kg` (heaviest completed set)        | `overviewView.js`, `exerciseProgressView.js`        |
| D-5  | Status map 5 flags → 4 badges + deload notice                   | `loadTracking/statusMap.js`                         |
| D-6  | Current load / e1RM reuse Phase 3/4                             | `exerciseHistory.js`, `overviewView.js`             |
| D-7  | `phaseForDate` generalizes `currentTrainingPhase`               | `sessionJournal/currentPhase.js`                    |
| D-8  | Radar = avg per-session top working load per muscle group/phase | `loadTracking/phaseRadarView.js`                    |
| D-9  | Hand-rolled SVG charts + pure geometry (no new dep)             | `lib/chartGeometry.js`, `components/charts/*`       |
| D-10 | Composed `/load-tracking/*` read endpoints + pure presenters    | `routes/`, `controllers/`, `services/loadTracking/` |
| D-11 | Volume/last-10 from `session_sets` rollup                       | `sessions.dao`, `exerciseProgressView.js`           |

No unresolved unknowns remain. Ready for Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).
