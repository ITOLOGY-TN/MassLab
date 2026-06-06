# Phase 1 Data Model — Phase 11: Statistics & Global Progress

Phase 11 introduces **no new stored entity, no table, no migration, no column, no DAO**. It is a pure read-only composition over existing athlete-scoped data plus an on-demand client-side PDF. This document describes the **read inputs** it consumes, the **derived view models** it produces, and the **report shape** — none of which are persisted.

> Tenant rule (Constitution I): every read below is parameterised by `req.athleteId`; no athlete id is ever taken from the body/query. Nothing here writes.

---

## 1. Read inputs (existing tables, via existing DAOs)

| Input | Source table | Reader (existing) |
| --- | --- | --- |
| Athlete profile (`program_start_date`, `starting_weight_kg`, `target_weight_kg`, sex/height/age) | `athletes` | `athletes.dao` |
| Body weight + measurement entries | `body_measurements` | `bodyMeasurements.dao`; series via `bodyTracking/weightChartView.js`, `engine/measurementDeltas.js` |
| Per-exercise working-weight / e1RM time series | `one_rep_max_records` | `oneRepMaxRecords.dao#seriesForAthlete` (`source_weight_kg`, `primary_estimate_kg`, `recorded_at`, `exercise_id`) |
| Finished-session daily volumes | `session_journal_entries` (+ `session_sets`) | `sessions.dao#dailyTrainingVolumes({ from, to })` → `[{ ended_at, total_volume_kg }]` |
| Weekly training schedule | `weekly_plan_slots` (+ `exercises`) | `weeklyPlan.dao` |
| Exercise → muscle-group mapping | `exercises`, `muscle_groups` | `exercises.dao`, `muscleGroups.dao` |
| Training phases | `training_phases` | `trainingPhases.dao`; window via `sessionJournal/currentPhase.js` |
| Nutrition logs (macro snapshots) | `nutrition_logs` | `nutritionLogs.dao`; series via `engine/nutritionTrends.js`, totals via `engine/nutritionMath.js` |
| Resolved daily calorie/macro target | derived | `nutrition/targets.js#resolveTargets({ daos, athleteId })` |
| Recovery check-ins (sleep, stress) | `recovery_log` | `recovery.dao` |
| Active progression flags | `progression_flags` | `progressionFlags.dao#findActiveForAthlete` |

All reads are bounded: the program window `[program_start_date, today]`, a per-exercise series, the schedule, or a single month (report).

## 2. Derived view models (pure presenters, not persisted)

### 2.1 `metrics` — headline cards (`engine/statisticsMetrics.js` + `statistics/metricsView.js`)

```text
metrics: {
  total_weight_gained_kg: number | null,     // latest body weight − athletes.starting_weight_kg (signed); null when no weight logged yet
  total_volume_kg: number,                     // Σ finished-session volume since start (0 cold-start)
  session_completion_rate: {                   // completed ÷ scheduled-to-date
    completed: number, scheduled: number, pct: number | null   // pct null when scheduled = 0
  },
  avg_weekly_calories: number | null           // mean of per-ISO-week kcal totals; null if none logged
}
```

### 2.2 `body` — Body tab (`statistics/bodyTab.js`)

```text
body: {
  weight: { points: [{ date, weight_kg }], goal_kg: number | null, has_data: boolean },
  measurements: [
    { key: string, label: string, unit: 'cm', points: [{ date, value }] }   // only measurements with data
  ]
}
```

### 2.3 `strength` — Strength tab (`engine/exerciseImprovements.js`, `engine/muscleGroupProgress.js`, `statistics/strengthTab.js`)

```text
strength: {
  top_progressions: [                          // ≤ STATISTICS_TOP_EXERCISES (5), ranked by abs working-weight gain (kg)
    { exercise_id, name, gain_kg: number, series: [{ date, working_weight_kg }] }
  ],
  weekly_volume: [{ week_start: 'YYYY-MM-DD', volume_kg: number }],
  muscle_radar: { axes: [{ muscle_group, color }], values: [number] }   // values = progress % per group (≥ 0), origin when insufficient
}
```

### 2.4 `attendance` — Attendance tab (`engine/attendanceHeatmap.js`, `statistics/attendanceTab.js`)

```text
attendance: {
  from: 'YYYY-MM-DD', to: 'YYYY-MM-DD',
  levels: number,                              // STATISTICS_HEATMAP_LEVELS (4) nonzero buckets
  days: [{ date: 'YYYY-MM-DD', volume_kg: number, level: 0..levels }]   // level 0 = no session (empty shade)
}
```

### 2.5 `nutrition` — Nutrition tab (`statistics/nutritionTab.js`)

```text
nutrition: {
  weekly: [{ week_start: 'YYYY-MM-DD', kcal: number }],
  weekly_target_kcal: number | null            // resolved daily target × 7; null if unresolved
}
```

### 2.6 `recovery` — Recovery tab (`engine/stressWeightSeries.js`, `statistics/recoveryTab.js`)

```text
recovery: {
  sleep: { points: [{ date, hours: number }], average_hours: number | null },
  stress_weight: {
    points: [{ date, stress: number, weight_kg: number }],   // a point only when BOTH exist
    sufficient: boolean                                        // false below STATISTICS_MIN_CORRELATION_POINTS (3)
  }
}
```

## 3. Report shape (`GET /statistics/report`, `statistics/monthlyReport.js` + `engine/reportRecommendations.js`)

Composed for one month; consumed by the client PDF builder. Persists nothing.

```text
report: {
  period: { month: 'YYYY-MM', from: 'YYYY-MM-DD', to: 'YYYY-MM-DD', label: string },
  summary: {                                   // the selected month
    volume_kg: number,
    sessions_completed: number,
    weight_change_kg: number | null,
    avg_daily_calories: number | null,
    avg_sleep_hours: number | null
  },
  lifetime: {                                  // "since start" header figures (mirror §2.1)
    total_weight_gained_kg: number | null,
    total_volume_kg: number,
    session_completion_pct: number | null,
    avg_weekly_calories: number | null
  },
  topProgressions: [                           // ≤ STATISTICS_REPORT_TOP_PROGRESSIONS (3), abs working-weight gain (kg)
    { exercise_id, name, gain_kg: number }
  ],
  weightSeries: [{ date, weight_kg }],         // drives the embedded weight chart (client renders + rasterizes)
  recommendations: [                           // deterministic, rule-based, ordered; no AI
    { key: string, message: string, context?: object }
  ]
}
```

## 4. Cold-start / insufficient-data shapes (FR-026, SC-010)

Every presenter emits a defined empty/insufficient shape so a brand-new athlete renders without error:

- `metrics`: `total_weight_gained_kg`/`avg_weekly_calories` → `null`; `total_volume_kg` → `0`; completion `{ completed: 0, scheduled: 0, pct: null }`.
- Each tab: empty arrays + `has_data: false` / `sufficient: false`; charts render their empty state.
- `report`: a valid payload with zeroed/`null` summary, empty `topProgressions`/`weightSeries`, and a single "log more data to see recommendations" line — the PDF still generates (empty-state).

## 5. Invariants

- **No mutation**: reads only; row counts identical before/after any request (SC-011).
- **Athlete-scoped**: every figure derives from `req.athleteId`-filtered reads (SC-012).
- **Since-start anchor**: lifetime/program windows start at `program_start_date`; nothing earlier is counted (FR-024).
- **Determinism**: `asOf` (server UTC day) and all thresholds/config are injected at the controller; pure functions read no clock/random/globals (D-12).
- **Pinned semantics**: top-N by abs working-weight kg (D-4); radar = progress % per group (D-5); heatmap graded by daily volume (D-6).
- **No AI**: every recommendation traces to a deterministic existing signal (FR-020, SC-009).
