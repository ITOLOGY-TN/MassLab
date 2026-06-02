# Data Model — Phase 3: Training Program & Exercise Library

**Feature**: `006-training-program-library` | **Date**: 2026-06-02

Phase 3 adds **one** new table and **zero** column changes. Everything else is read composition over tables that already exist. This document covers (1) the new table, (2) the existing tables Phase 3 reads, and (3) the composed read models returned by the `/program/*` endpoints.

---

## 1. New table: `exercise_alternatives`

One-directional athlete-owned link from a source exercise to an alternative exercise (research D-6, D-7).

```sql
create table if not exists public.exercise_alternatives (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  exercise_id bigint not null references public.exercises(id) on delete cascade,
  alternative_exercise_id bigint not null references public.exercises(id) on delete cascade,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  constraint exercise_alternatives_no_self check (exercise_id <> alternative_exercise_id),
  unique (athlete_id, exercise_id, alternative_exercise_id)
);

create index if not exists exercise_alternatives_athlete_source_idx
  on public.exercise_alternatives (athlete_id, exercise_id, display_order);

alter table public.exercise_alternatives enable row level security;

drop policy if exists exercise_alternatives_select_own on public.exercise_alternatives;
create policy exercise_alternatives_select_own on public.exercise_alternatives
  for select using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));

drop policy if exists exercise_alternatives_modify_own on public.exercise_alternatives;
create policy exercise_alternatives_modify_own on public.exercise_alternatives
  for all
  using (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()))
  with check (athlete_id in (select id from public.athletes where auth_user_id = auth.uid()));
```

| Field                     | Type          | Rules                                                                 |
| ------------------------- | ------------- | -------------------------------------------------------------------- |
| `id`                      | bigint identity | PK                                                                  |
| `athlete_id`              | uuid          | NOT NULL, FK → `athletes(id)` ON DELETE CASCADE; tenant scope (Constitution I) |
| `exercise_id`             | bigint        | NOT NULL, FK → `exercises(id)` ON DELETE CASCADE; the source exercise |
| `alternative_exercise_id` | bigint        | NOT NULL, FK → `exercises(id)` ON DELETE CASCADE; the alternative     |
| `display_order`           | int           | NOT NULL default 0; render order of alternatives on the source page  |
| `created_at`              | timestamptz   | NOT NULL default now()                                               |

**Constraints**

- `exercise_alternatives_no_self` CHECK → self-links rejected (FR-023). The application also pre-validates and returns the canonical `422`/`409` envelope before hitting the constraint.
- `UNIQUE (athlete_id, exercise_id, alternative_exercise_id)` → duplicate links rejected (FR-023); the DAO maps the `23505` unique-violation to a `409 CONFLICT`.
- Both FKs `ON DELETE CASCADE` → no dangling links when an exercise is hard-deleted (D-7). Soft-deleted (`is_active = false`) exercises keep their links and are surfaced with an archived marker.

**Migration**: `supabase/migrations/<timestamp>_init_exercise_alternatives.sql` — forward-only, RLS in the same file, replayable from an empty project (Operational Standards: schema migrations).

---

## 2. Existing tables Phase 3 reads (no changes)

| Table                       | Read for                                                                 | Index used                                            |
| --------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `weekly_plan_slots`         | week cards (day, muscle group, color, order) + day header               | `unique (athlete_id, day_of_week)`                    |
| `weekly_plan_exercises`     | ordered exercises per slot (`position`, `target_sets`, `target_reps_*`)  | `unique (slot_id, position)`                          |
| `muscle_groups`             | muscle-group display name/color (via `weekly_plan_slots.muscle_group_id`) | per-athlete catalogue                                 |
| `exercises`                 | static content: name, targeted_muscles, instructions, technique_points, media_image_url, media_video_url, is_active | `exercises_athlete_idx`        |
| `session_journal_entries`   | most-recent-session scoping (`started_at DESC`), session date for last-5 | `session_journal_athlete_started_idx`                 |
| `session_sets`              | per-exercise sets (weight, reps, completed) for last-weight, last-5, 1RM feed | `session_sets_athlete_exercise_idx`              |
| `progression_flags`         | active per-exercise flag → progression indicator                        | `progression_flags_one_active_per_scope` (partial)    |
| `app_config.engine_overrides` | resolve `load_increment_*` constants for the load recommendation       | n/a (single row per athlete)                          |

**Media columns reused** (no migration): `exercises.media_image_url`, `exercises.media_video_url`. The image/uploaded-video values hold a `photoStorage` key/URL; the YouTube value holds a `youtube.com`/`youtu.be` URL. The presenter classifies the video value (YouTube URL vs. stored key) for the frontend.

---

## 3. Composed read models (API response shapes)

These are **not** tables — they are the assembled view models returned by `/program/*` and produced by the pure `services/trainingProgram/*` presenters. They are documented here so the contract and the presenters agree.

### 3.1 Week view (`GET /api/v1/program/week` → `{ data: WeekView }`)

```jsonc
{
  "days": [
    {
      "day_of_week": 1,                 // 1=Mon … 7=Sun
      "kind": "training",               // "training" | "rest"
      "slot_id": 12,                    // null when kind=rest
      "muscle_group": { "name": "Chest + Triceps", "color": "#E54D2E" },
      "exercise_count": 3
    },
    { "day_of_week": 4, "kind": "rest" }
    // ... always 7 entries, in week order; rest entries omit slot/muscle/count
  ],
  "training_day_count": 5,
  "empty": false                        // true when zero training days configured (FR-006)
}
```

Rules: exactly 7 entries in `day_of_week` order; `kind` derives from whether a `weekly_plan_slots` row exists for that day; `exercise_count` = number of `weekly_plan_exercises` for the slot (0 allowed, FR-002/edge case); `muscle_group` resolved from `muscle_groups` via the slot FK.

### 3.2 Day view (`GET /api/v1/program/day/:dayOfWeek` → `{ data: DayView }`)

```jsonc
{
  "day_of_week": 1,
  "muscle_group": { "name": "Chest + Triceps", "color": "#E54D2E" },
  "exercises": [
    {
      "exercise_id": 101,
      "slug": "bench-press",
      "name": "Bench Press",
      "position": 1,
      "target_sets": 4,
      "target_reps_low": 6,
      "target_reps_high": 8,
      "is_active": true,                 // false → render archived marker (edge case)
      "last_weight_kg": 72.5,            // null when no history (FR-009)
      "progression": "ready_to_increase" // "ready_to_increase" | "stable" | "regressing" (FR-010)
    }
  ],
  "empty_exercises": false               // true → "no exercises assigned" state (FR-012)
}
```

Rules: exercises ordered by `position`; `last_weight_kg` from `exerciseHistory.lastWeightUsed` (D-2); `progression` from the active flag mapping (D-4). A 404 is returned only for an out-of-range `dayOfWeek` (not 1–7); a configured-but-restless day returns a normal payload.

### 3.3 Exercise view (`GET /api/v1/program/exercises/:id` → `{ data: ExerciseView }`)

```jsonc
{
  "exercise_id": 101,
  "slug": "bench-press",
  "name": "Bench Press",
  "targeted_muscles": ["chest", "triceps", "front delts"],
  "instructions": "…",
  "technique_points": ["retract scapula", "…"],
  "is_active": true,
  "media": {
    "image_url": "/media/…",            // null when none
    "video": { "kind": "youtube", "url": "https://www.youtube-nocookie.com/embed/…" }
    // video.kind: "youtube" | "upload" | null; upload → url is a photoStorage URL
  },
  "alternatives": [
    { "exercise_id": 145, "slug": "dumbbell-press", "name": "Dumbbell Press", "is_active": true }
  ],
  "history": {
    "recent_sessions": [                 // up to 5, most-recent first (FR-016); [] when none
      {
        "session_id": 900,
        "date": "2026-05-28",
        "sets": [ { "weight_kg": 72.5, "reps": 8, "rpe": 8, "completed": true } ]
      }
    ],
    "estimated_1rm_kg": 90.6,            // engine primary_estimate_kg (D-1); null when no history
    "recommended_load_kg": 75.0,         // D-3; null when no history
    "has_history": true
  }
}
```

Rules: static content always present (FR-019); `media.video.kind` classified by the presenter from `media_video_url`; `alternatives` from `exercise_alternatives` joined to `exercises` (ordered by `display_order`), each flagged with `is_active`; `history.*` null/empty when no qualifying sets exist; `estimated_1rm_kg` and `recommended_load_kg` both derive from the same heaviest-completed-set so they stay consistent with the day view (SC-003).

---

## 4. Entity relationship summary

```text
athletes (1) ──< exercises (1) ──< weekly_plan_exercises >── (1) weekly_plan_slots >── (1) muscle_groups
                      │
                      ├──< exercise_alternatives >── exercises        (NEW, one-directional, athlete-scoped)
                      ├──< session_sets >── session_journal_entries   (read-only here; written in Phase 4)
                      └──< progression_flags                          (read-only here; written by Phase 1 engine)
```

All relationships are athlete-scoped. The only new edge is `exercises ──< exercise_alternatives >── exercises`.
