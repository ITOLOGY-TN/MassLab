# Data Model — Phase 4: Session Journal

**Feature**: `007-session-journal` | **Date**: 2026-06-02

Phase 4 is the **first writer** of the Phase 0 session tables. It adds **two small forward-only migrations** to those existing tables (one new column; one uniqueness change) and **zero new tables**. Everything else is write orchestration over tables that already exist, plus engine-owned writes (progression flags, 1RM records, audit log) reused unchanged from Phase 1. This document covers (1) the migrations to existing tables, (2) the existing tables Phase 4 reads/writes, and (3) the composed request/response models served by `/api/v1/sessions/*`.

---

## 1. Migrations to existing tables

### 1.1 `session_journal_entries` — add `day_of_week` (research D-3)

```sql
-- supabase/migrations/<ts>_extend_session_journal_day_of_week.sql  (forward-only)
alter table public.session_journal_entries
  add column if not exists day_of_week int
    check (day_of_week is null or day_of_week between 1 and 7);

create index if not exists session_journal_athlete_active_idx
  on public.session_journal_entries (athlete_id, ended_at)
  where ended_at is null;
```

No RLS change: the existing `session_journal_select_own` / `session_journal_modify_own` policies key on `athlete_id`, so they cover the new column automatically. The partial index supports the frequent "find the athlete's active (in-progress) session" lookup (D-2).

| Field (post-migration) | Type            | Rules                                                                 |
| ---------------------- | --------------- | --------------------------------------------------------------------- |
| `id`                   | bigint identity | PK                                                                    |
| `athlete_id`           | uuid            | NOT NULL, FK → `athletes(id)` ON DELETE CASCADE; tenant scope         |
| `started_at`           | timestamptz     | NOT NULL; session start; drives elapsed time (D-12) + staleness (D-2) |
| `ended_at`             | timestamptz     | NULL ⇒ in-progress (D-2); set once on finish (finish-once guard, D-6) |
| `total_volume_kg`      | numeric(10,2)   | running sum of completed `weight×reps`; finalized on finish (D-11)    |
| `energy_rating`        | int             | CHECK 1–5 (existing); set on finish (FR-024)                          |
| `note`                 | text            | free note; set on finish (FR-024)                                     |
| `day_of_week`          | int             | **NEW**; 1–7 targeted training day, or NULL for ad-hoc (D-3)          |
| `created_at`           | timestamptz     | NOT NULL default now()                                                |

### 1.2 `session_sets` — per-exercise set numbering (research D-4)

```sql
-- supabase/migrations/<ts>_alter_session_sets_set_number_per_exercise.sql  (forward-only)
alter table public.session_sets
  drop constraint if exists session_sets_session_id_set_number_key;        -- Phase 0 unique (session_id, set_number)

alter table public.session_sets
  add constraint session_sets_session_exercise_set_number_key
    unique (session_id, exercise_id, set_number);
```

Safe because Phase 4 is the first writer of `session_sets` (no production rows), and Phase 3 fixtures only insert sets for a single exercise (which satisfy the new key unchanged). RLS unchanged (keys on `athlete_id`).

| Field         | Type          | Rules                                                                          |
| ------------- | ------------- | ------------------------------------------------------------------------------ |
| `id`          | bigint identity | PK                                                                           |
| `athlete_id`  | uuid          | NOT NULL, FK → `athletes(id)` ON DELETE CASCADE; tenant scope                   |
| `session_id`  | bigint        | NOT NULL, FK → `session_journal_entries(id)` ON DELETE CASCADE                  |
| `exercise_id` | bigint        | NOT NULL, FK → `exercises(id)`; any exercise, incl. ad-hoc/off-plan (FR-011a)   |
| `set_number`  | int           | NOT NULL; **per-exercise** index within the session (D-4)                      |
| `weight_kg`   | numeric(6,2)  | NOT NULL; must be > 0 to complete (FR-009)                                      |
| `reps`        | int           | NOT NULL; must be > 0 to complete (FR-009)                                      |
| `rpe`         | int           | CHECK 1–10; nullable/optional (FR-008)                                          |
| `completed`   | boolean       | NOT NULL default false; incomplete rows discarded on finish (D-7)              |
| —             | —             | `unique (session_id, exercise_id, set_number)` (changed); upsert key for D-5    |

---

## 2. Existing tables Phase 4 reads / writes

| Table                       | Phase 4 access | For                                                                                  |
| --------------------------- | -------------- | ------------------------------------------------------------------------------------ |
| `session_journal_entries`   | **write** + read | start / auto-save aggregate / finish / discard / find-active (D-2, D-5, D-6, D-7)  |
| `session_sets`              | **write** + read | upsert sets (auto-save), discard incomplete on finish, read for history (D-5, D-7)  |
| `weekly_plan_slots`         | read           | resolve the targeted day's slot + muscle group from `day_of_week` (D-1, D-3)         |
| `weekly_plan_exercises`     | read           | the ordered planned exercises (`position`, `target_sets`, `target_reps_*`) for the day |
| `exercises`                 | read           | exercise name/slug/`is_active`/body-segment for the session view + engine feed        |
| `muscle_groups`             | read           | day header name/color (via `weekly_plan_slots.muscle_group_id`)                       |
| `training_phases`           | read           | `rest_seconds` of the current phase for the rest timer (D-8)                          |
| `athletes`                  | read           | `program_start_date` for current-phase derivation (D-8)                              |
| `app_config`                | read           | `engine_overrides` → `resolveConstants` for the finish engine + suggested target (D-6, D-9) |
| `progression_flags`         | read + **write** | read for suggested target / indicator; **`supersedeAndInsert` on finish** (D-6)    |
| `one_rep_max_records`       | read + **write** | read prior best for PR detection; **`insert` per exercise on finish** (D-6, D-10)   |
| `calculation_results`       | **write**      | audit rows appended by `writeAudit` on finish (D-6)                                   |

All access is athlete-scoped via `req.athleteId`; no endpoint accepts an athlete id from the body (Constitution I).

---

## 3. New DAO surface (`services/dataAccess/sessions.dao.js`)

Phase 3 shipped this DAO **read-only** (`recentSessionsForExercise`, `latestSessionWithSets`). Phase 4 adds the write methods (still the only module importing the Supabase client for sessions):

```text
findActiveForAthlete(athleteId)                          -> { ...session, sets[] } | null   // ended_at IS NULL, latest
getByIdWithSets(athleteId, sessionId)                    -> { ...session, sets[] } | null
startSession(athleteId, { day_of_week, started_at })     -> { id, started_at, day_of_week, ... }
upsertSets(athleteId, sessionId, sets[])                 -> set[]   // upsert on (session_id, exercise_id, set_number); delete missing (D-5)
insertSet(athleteId, sessionId, set)                     -> set     // granular convenience
updateSet(athleteId, sessionId, setId, patch)            -> set
deleteSet(athleteId, sessionId, setId)                   -> void
setRunningVolume(athleteId, sessionId, totalVolumeKg)    -> void    // auto-save aggregate (no ended_at)
finishSession(athleteId, sessionId, { note, energy_rating, total_volume_kg }) -> session
  // internally: delete completed=false rows (D-7), then UPDATE ended_at=now + aggregates; guarded finish-once (D-6)
discardSession(athleteId, sessionId)                     -> void    // DELETE session (cascade deletes sets) (D-2)
```

All methods throw the canonical `HttpError(500,'DB_ERROR',…)` on a Supabase error, matching the existing DAO style. `finishSession` rejects (`409 CONFLICT`) at the controller if the session already has `ended_at` set.

---

## 4. Composed request/response models (`/api/v1/sessions/*`)

These are **not** tables — they are the view models produced by the pure `services/sessionJournal/*` presenters, documented so the contract and the presenters agree.

### 4.1 `SessionView` — start / resume (`POST /sessions` 201, `GET /sessions/:id` 200, `GET /sessions/active` 200)

```jsonc
{
  "session_id": 900,
  "day_of_week": 1,                       // null for ad-hoc
  "started_at": "2026-06-02T07:40:00Z",   // server-authoritative; drives the live timer (D-12)
  "stale": false,                          // true ⇒ started before today ⇒ client prompts resume/discard (D-2)
  "rest_seconds": 120,                     // current phase rest interval (D-8); rest-timer default
  "muscle_group": { "name": "Chest + Triceps", "color": "#E54D2E" },  // null for ad-hoc
  "exercises": [
    {
      "exercise_id": 101,
      "slug": "bench-press",
      "name": "Bench Press",
      "position": 1,
      "is_active": true,
      "target_sets": 4,
      "target_reps_low": 6,
      "target_reps_high": 8,
      "previous_weight_kg": 72.5,          // heaviest completed set in most recent session (D-9); null when none
      "suggested_target_kg": 75.0,         // Phase 3 load recommendation (D-9); null when none
      "sets": [                             // already-logged sets for THIS session (empty on a fresh start)
        { "set_id": 5001, "set_number": 1, "weight_kg": 72.5, "reps": 8, "rpe": 8, "completed": true }
      ]
    }
  ]
}
```

`GET /sessions/active` returns `{ data: SessionView | null }` (null when the athlete has no in-progress session).

### 4.2 Auto-save payload (`PUT /sessions/:id/sets` 200)

```jsonc
// request
{ "sets": [
  { "exercise_id": 101, "set_number": 1, "weight_kg": 72.5, "reps": 8, "rpe": 8, "completed": true },
  { "exercise_id": 101, "set_number": 2, "weight_kg": 75.0, "reps": 6, "rpe": null, "completed": false }
] }
// response: { "data": { "sets": [ { "set_id": …, "exercise_id": …, "set_number": …, … } ], "total_volume_kg": 580.0 } }
```

Idempotent (D-5): the stored set list converges to the payload; resending is a no-op. A set marked `completed: true` is rejected (`422 VALIDATION_FAILED`) unless `weight_kg > 0` and `reps > 0` (FR-009).

### 4.3 `PostSessionSummary` — finish (`POST /sessions/:id/finish` 200)

```jsonc
// request:  { "note": "felt strong", "energy_rating": 4 }
// response:
{
  "session_id": 900,
  "duration_seconds": 3720,                // ended_at − started_at (D-11)
  "total_volume_kg": 5820.0,               // Σ weight×reps over completed sets (D-11)
  "top_performance": {                      // heaviest completed set, ties → reps (D-11, Q3)
    "exercise_id": 101, "name": "Bench Press", "weight_kg": 80.0, "reps": 5
  },
  "personal_records": [                     // D-10; [] when none
    { "exercise_id": 101, "name": "Bench Press", "kind": "weight", "value_kg": 80.0, "previous_kg": 77.5 },
    { "exercise_id": 101, "name": "Bench Press", "kind": "estimated_1rm", "value_kg": 90.6, "previous_kg": 88.1 }
  ],
  "energy_rating": 4,
  "note": "felt strong",
  "engine": {                               // result of the finish engine block (D-6)
    "progression_flags_updated": 2,
    "one_rep_max_records_created": 3
  }
}
```

Rules: every figure derives from **completed** sets only (FR-028); incomplete sets were discarded before computation (D-7). `top_performance` is null only if the session had zero completed sets.

---

## 5. Entity relationship summary

```text
athletes (1) ──< session_journal_entries (1) ──< session_sets >── (1) exercises
   │                    │ day_of_week ─────────────> weekly_plan_slots (read) >── muscle_groups
   │                    └── (on finish) ──> progression_flags        (write via engine, D-6)
   │                                    ──> one_rep_max_records       (write via engine, D-6)
   │                                    ──> calculation_results       (audit append, D-6)
   ├── program_start_date ──> training_phases (read; current phase rest_seconds, D-8)
   └── app_config.engine_overrides ──> resolveConstants (read; finish + suggested target)
```

All relationships are athlete-scoped. The only schema deltas are the `day_of_week` column on `session_journal_entries` and the per-exercise uniqueness on `session_sets`. Every other write reuses an existing Phase 1 DAO unchanged.
