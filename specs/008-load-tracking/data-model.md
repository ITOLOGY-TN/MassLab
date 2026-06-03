# Data Model — Phase 5: Load Tracking & Progression Algorithm

**Feature**: `008-load-tracking` | **Date**: 2026-06-02

Phase 5 adds **no tables and no migrations**. It is read composition over data the earlier phases already persist. This document covers (1) the existing tables it reads, (2) the read-only DAO additions, and (3) the composed view models served by `/api/v1/load-tracking/*`.

---

## 1. Existing tables Phase 5 reads (no changes)

| Table                     | Read for                                                                                                                                                                                         | Index used                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `one_rep_max_records`     | the per-exercise e1RM + working-load time series (`created_at`, `source_weight_kg`, `source_reps`, `primary_estimate_kg`) — trend, projection, current 1RM, all-time record, radar (D-1/D-4/D-8) | `(athlete_id, exercise_id, created_at)`            |
| `session_journal_entries` | session dates for the per-session volume rollup + last-10 table (D-11)                                                                                                                           | `(athlete_id, started_at desc)`                    |
| `session_sets`            | per-session completed sets → volume (Σ weight×reps), reps, top weight (D-11)                                                                                                                     | `session_sets_athlete_exercise_idx`                |
| `progression_flags`       | active per-exercise + per-muscle-group flags → status badges + deload notice (D-5)                                                                                                               | `progression_flags_one_active_per_scope` (partial) |
| `exercises`               | exercise name/slug/`is_active`/targeted_muscles; muscle-group grouping                                                                                                                           | `exercises_athlete_idx`                            |
| `weekly_plan_slots`       | exercise → muscle-group mapping (for status fallback + radar grouping)                                                                                                                           | `(athlete_id, day_of_week)`                        |
| `muscle_groups`           | muscle-group display name/color for the radar axes + deload notice                                                                                                                               | per-athlete catalogue                              |
| `training_phases`         | phase order + length → `phaseForDate` bucketing for the radar (D-7)                                                                                                                              | `(athlete_id, slug, locale)`                       |
| `athletes`                | `program_start_date` for phase attribution (D-7)                                                                                                                                                 | PK                                                 |

`one_rep_max_records` exists only for sessions finished under Phase 4, so the series is naturally sparse until sessions accumulate — every surface degrades to a documented empty/low-data state.

**Status source** (`progression_flags`): `scope_kind ∈ {exercise, muscle_group}`, `scope_ref` (`String(exercise_id)` or muscle-group name), `flag_type ∈ {add_load, maintain, stagnation, regression, deload_suggested}`, `is_active`. Phase 5 reads only `is_active = true` rows (D-5).

---

## 2. Read-only DAO additions

No write methods. New reads (Supabase confined to `services/dataAccess/*`, Constitution II):

```text
oneRepMaxRecords.dao:
  seriesForAthlete(athleteId)                       -> [{ exercise_id, created_at, source_weight_kg, source_reps, primary_estimate_kg }]  // all records, asc by created_at; build every exercise's series in one read (D-1/D-8)

sessions.dao:
  recentSessionVolumesForExercise(athleteId, exerciseId, { limit = 10 })
                                                    -> [{ session_id, date, top_weight_kg, top_reps, total_volume_kg }]  // per-session rollup over completed sets, newest first (D-11)
```

The existing `oneRepMaxRecords.dao.listForAthlete({ athleteId, exerciseId })`, `progressionFlags.dao.findActiveForAthlete`, `exercises.dao.listForAthlete`, `weeklyPlan.dao.listSlotsWithExercises`, `muscleGroups.dao.listForAthlete`, `trainingPhases.dao.listForAthlete`, and `athletes.dao.findById` are reused unchanged.

---

## 3. Composed view models (`/api/v1/load-tracking/*`)

Produced by the pure `services/loadTracking/*` presenters — documented here so the contract and presenters agree.

### 3.1 Overview (`GET /api/v1/load-tracking/overview` → `{ data: OverviewView }`)

```jsonc
{
  "exercises": [
    {
      "exercise_id": 101,
      "slug": "bench-press",
      "name": "Bench Press",
      "muscle_group": { "name": "Chest + Triceps", "color": "#E54D2E" }, // null if unmapped
      "is_active": true,
      "current_load_kg": 80.0, // lastWeightUsed; null when no history (D-6)
      "all_time_record_kg": 85.0, // max source_weight_kg; null when none (D-4)
      "last_session_volume_kg": 1280.0, // Σ weight×reps of completed sets, most recent session (FR-007)
      "trend": { "direction": "up", "change_pct": 3.2 }, // null when too little history (D-3)
      "status": "ready_to_increase", // ready_to_increase | maintain | stagnation | regressing (D-5)
      "status_increment_kg": 2.5, // present only for ready_to_increase (from the active add_load flag)
    },
  ],
  "deload_notices": [
    // muscle-group-level deload suggestions (D-5), distinct from badges
    { "muscle_group": { "name": "Legs Quads", "color": "#3E63DD" } },
  ],
  "empty": false, // true when the athlete has no logged history at all (FR/edge)
}
```

Rules: one row per exercise (archived flagged via `is_active=false`, still listed); `status` per D-5; history-derived fields null when absent; `empty=true` only when there is no session history anywhere.

### 3.2 Exercise progression detail (`GET /api/v1/load-tracking/exercises/:id` → `{ data: ExerciseProgressView }`)

```jsonc
{
  "exercise_id": 101,
  "slug": "bench-press",
  "name": "Bench Press",
  "is_active": true,
  "current_estimate_1rm_kg": 96.2, // latest primary_estimate_kg; null when none (D-6)
  "all_time_record_kg": 85.0, // D-4; annotated on the load chart
  "load_series": [
    // working load over time (D-1); [] when none
    { "date": "2026-05-28", "working_load_kg": 80.0, "estimate_1rm_kg": 93.3 },
  ],
  "volume_series": [
    // per-session volume (D-11); [] when none
    { "date": "2026-05-28", "session_id": 900, "total_volume_kg": 1280.0 },
  ],
  "recent_sessions": [
    // up to last 10 (D-11); [] when none
    {
      "session_id": 900,
      "date": "2026-05-28",
      "top_weight_kg": 80.0,
      "top_reps": 5,
      "total_volume_kg": 1280.0,
    },
  ],
  "projection": {
    // null when < 3 qualifying points (D-2)
    "method": "least_squares_linear",
    "weeks_ahead": 8,
    "points": [{ "date": "2026-07-23", "estimate_1rm_kg": 99.0 }],
  },
}
```

Rules: `load_series`/`volume_series` ordered ascending by date; `projection` null below the 3-point floor; static identity always present (FR-016). The detail chart's **primary line is `estimate_1rm_kg`** (the line the projection extends); `working_load_kg` is a secondary line and `all_time_record_kg` the working-load reference marker (I1).

### 3.3 Phase comparison radar (`GET /api/v1/load-tracking/phase-comparison` → `{ data: PhaseRadarView }`)

```jsonc
{
  "muscle_groups": [
    // radar axes, stable order
    { "name": "Chest + Triceps", "color": "#E54D2E" },
    { "name": "Legs Quads", "color": "#3E63DD" },
  ],
  "phases": [
    // one series per phase that has data
    {
      "slug": "hypertrophy",
      "name": "Hypertrophie",
      "values": [
        // aligned to muscle_groups order; kg, 0 when absent (D-8/FR-019)
        { "muscle_group": "Chest + Triceps", "avg_working_load_kg": 78.5 },
        { "muscle_group": "Legs Quads", "avg_working_load_kg": 120.0 },
      ],
    },
  ],
  "empty": true, // true when fewer than 2 phases have logged data (FR-020)
}
```

Rules: each `avg_working_load_kg` = mean over the phase's sessions of that session's top working load for the muscle group (D-8); a muscle group absent in a phase reads 0; `empty=true` (and `phases` short/empty) when < 2 phases have data.

---

## 4. Entity relationship summary

```text
athletes (1) ──< exercises ──< one_rep_max_records        (read: e1RM/load series, record — D-1/D-4)
   │                │
   │                ├──< session_sets >── session_journal_entries   (read: volume / last-10 — D-11)
   │                └── (via weekly_plan_slots) ── muscle_groups     (read: grouping, radar axes)
   ├── progression_flags                                  (read: status badges + deload — D-5)
   ├── program_start_date ──> training_phases             (read: phaseForDate bucketing — D-7)
```

All reads are athlete-scoped. Phase 5 introduces no new edge and no new table — only composed read models over the existing graph.
