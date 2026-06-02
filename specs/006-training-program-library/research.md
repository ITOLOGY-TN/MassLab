# Phase 0 Research — Phase 3: Training Program & Exercise Library

**Feature**: `006-training-program-library` | **Date**: 2026-06-02

This phase has no open `NEEDS CLARIFICATION` markers (the four spec clarifications were resolved on 2026-06-02). The research below records the implementation decisions that shape the data model, contracts, and tasks, each with rationale and the alternatives rejected. Decisions are D-numbered for reference from `tasks.md`.

---

## D-1 — Estimated 1RM on the exercise detail page uses the engine's `primary_estimate_kg`

**Decision**: The detail page displays the existing engine estimate `oneRepMax({ weight, reps }).primary_estimate_kg` (the average of Epley, Brzycki, Lander, Lombardi), fed by the athlete's **heaviest completed set** across recent history. It does **not** introduce an Epley-only path and does **not** read the `one_rep_max_records` table.

**Rationale**: Consistency with how 1RM is already presented in the Phase 1 calculator (same engine function, same blended estimate) avoids two contradictory "1RM" numbers in the app. Computing on the fly from the heaviest completed set keeps the figure live (it tracks new sessions automatically once Phase 4 logs them) without a write path. PLAN.md's reference to "Epley" is treated as shorthand for the engine estimate (clarification Q1).

**Alternatives considered**:

- _Epley-only per PLAN.md literal_ — rejected: diverges from the rest of the app, needs a dedicated formula path, and produces a different number than the 1RM calculator screen for the same input.
- _Read latest `one_rep_max_records` row_ — rejected: that table is populated only when the athlete manually uses the 1RM calculator/record path, so it is frequently empty or stale relative to the latest logged session; it would not reflect actual training history.

**Touches**: `services/engine/oneRepMax.js` (reused), `services/engine/exerciseHistory.js` (heaviest-set feed), `services/trainingProgram/exerciseView.js`.

---

## D-2 — "Last weight used" = heaviest completed set in the most recent session containing the exercise

**Decision**: `lastWeightUsed` is the `weight_kg` of the **heaviest `completed = true` set** within the **most recent session** (`session_journal_entries.started_at DESC`) that contains at least one completed set for the exercise. Warm-up/incomplete (`completed = false`) and invalid (non-positive weight/reps) sets are excluded (FR-027). When no qualifying session exists, the value is `null` and the UI renders the neutral empty state.

**Rationale**: "Heaviest completed set" is the single most meaningful "what did I lift" signal and is the same set that should feed the 1RM estimate (D-1), so the day-detail row and the exercise-detail page stay internally consistent (SC-003). Scoping to the most-recent session (not all-time) matches the athlete's mental model of "last time".

**Alternatives considered**:

- _Top/first working set of the last session_ — rejected: ambiguous when a later set is heavier; under-reports on ascending-load days.
- _Most recent set by time regardless of weight/completion_ — rejected: a logged-then-failed warm-up would misrepresent the working load.

**Touches**: `services/engine/exerciseHistory.js`, consumed by `dayView.js` and `exerciseView.js`.

---

## D-3 — Recommended working load reuses the progression engine increments

**Decision**: `recommendWorkingLoad` returns, when history exists:

- if the exercise has an **active `add_load` progression flag**: `lastWeightUsed + load_increment`, where `load_increment` is `constants.load_increment_upper_kg` or `load_increment_lower_kg` selected by the exercise's body segment (the same upper/lower split the progression engine already uses);
- otherwise (`maintain` / `regression` / `stagnation` / `deload_suggested` / no flag): **hold** `lastWeightUsed`.

When no history exists, it returns `null` and the UI shows an empty state. The increment constants are resolved through the existing `resolveConstants(override)` helper.

**Rationale**: The progression engine (Phase 1) already owns the "ready to add load" decision and the increment magnitudes; deriving the recommendation from its output guarantees the load recommendation and the day-detail progression indicator never disagree, and keeps a single source of truth for progression math. No new tunable constants are introduced.

**Alternatives considered**:

- _Percentage of estimated 1RM (from the `percentage_table`)_ — rejected for this phase: requires a target-rep-band→% mapping decision and would produce a recommendation that can contradict the progression flag; deferred as a possible Phase 5 enhancement.
- _Defer the recommendation entirely to Phase 5_ — rejected: the spec (FR-018) requires a load recommendation now, and the progression-flag-based rule is a small, deterministic, testable reuse of existing logic.

**Touches**: `services/engine/loadRecommendation.js`, `services/engine/constants.js` (read only), `services/trainingProgram/exerciseView.js` + `dayView.js`.

---

## D-4 — Progression indicator maps directly onto existing `progression_flags`

**Decision**: The three-state indicator is derived from the **active** `progression_flags` row for `scope_kind = 'exercise'`, `scope_ref = <exercise slug/id>`:

| `flag_type`        | Indicator           |
| ------------------ | ------------------- |
| `add_load`         | ready to increase   |
| `regression`       | regressing          |
| `maintain` / `stagnation` / `deload_suggested` / none | stable |

No new evaluation runs in Phase 3 — it reads whatever the progression engine last persisted. When there is no active flag, the indicator is the neutral "stable"/empty state.

**Rationale**: The flag table and its "one active per scope" partial-unique index already exist (Phase 1). Reusing them keeps Phase 3 strictly read-only over progression state and avoids re-implementing the evaluation. Mapping the five engine flag types onto the three spec states is a presentation concern living in the pure `dayView.js`.

**Alternatives considered**:

- _Recompute progression in Phase 3_ — rejected: violates the read-only constraint (FR-026) and duplicates Phase 1 logic.
- _Surface all five flag types verbatim_ — rejected: the spec defines exactly three indicator states (FR-010); the mapping keeps the UI simple while preserving the underlying detail on the exercise page if needed later.

**Touches**: `services/dataAccess/progressionFlags.dao.js` (reused read), `services/trainingProgram/dayView.js`.

---

## D-5 — A new read-only `sessions.dao.js` is the first reader of the Phase 0 session tables

**Decision**: Introduce `services/dataAccess/sessions.dao.js` exposing read-only methods: `recentSessionsForExercise(athleteId, exerciseId, { limit })` (joins `session_journal_entries` + `session_sets`, ordered by `started_at DESC`) and `latestSessionWithSets(athleteId, exerciseId)`. No write methods. Phase 4's journal will add a separate write path (or extend this DAO) but Phase 3 only reads.

**Rationale**: `session_journal_entries` and `session_sets` have existed since Phase 0 but nothing reads them yet (the exporter explicitly defers them to Phase 4). Phase 3 needs them for last-weight, last-5-sessions, and the 1RM feed. Putting the reads behind a DAO keeps the Supabase import inside the data-access boundary (Constitution II) and gives the pure engine/presenter functions plain data to operate on. Indexes already support these reads: `session_sets (athlete_id, exercise_id)` and `session_journal_entries (athlete_id, started_at DESC)`.

**Alternatives considered**:

- _Read sessions inside the controller_ — rejected: leaks Supabase calls out of the data-access layer.
- _Wait for Phase 4 to build the DAO_ — rejected: Phase 3 needs the reads now; building the read side here and letting Phase 4 add the write side is the natural split and avoids a circular dependency.

**Touches**: new `services/dataAccess/sessions.dao.js`, wired in the app builder's `daos` map.

---

## D-6 — Alternatives: a dedicated one-directional `exercise_alternatives` table

**Decision**: Model alternatives as a new table `exercise_alternatives(athlete_id, exercise_id, alternative_exercise_id, display_order, created_at)` with: a `CHECK (exercise_id <> alternative_exercise_id)` (rejects self-links, FR-023), a `UNIQUE (athlete_id, exercise_id, alternative_exercise_id)` index (rejects duplicates, FR-023), and FKs to `exercises(id)`. Links are **one-directional** (A→B shows on A only; no auto-reciprocal — clarification Q4). RLS ships in the same migration.

**Rationale**: A junction table is the clean relational model and keeps `exercises` unchanged. One-directional storage means unlinking is a single-row delete with no reciprocal-consistency bookkeeping. When an exercise is deleted, its inbound/outbound alternative rows are removed via FK behavior (see D-7) so the detail page never shows a broken link (edge case).

**Alternatives considered**:

- _`exercises.alternative_ids` array column_ — rejected: no referential integrity, awkward dedupe/self-link checks, and array-vs-FK cleanup on delete is manual.
- _Reciprocal/bidirectional links_ — rejected (Q4): more intuitive for browsing but doubles write/delete bookkeeping and risks half-deleted pairs; can be layered on later as a presentation-time union if desired.

**Touches**: new migration, `services/dataAccess/exerciseAlternatives.dao.js`, `exercises.controller.js` (add/remove), `exerciseView.js` (display).

---

## D-7 — Alternative-link integrity on exercise delete/archive

**Decision**: `exercise_alternatives` FKs to `exercises` use `ON DELETE CASCADE` for both `exercise_id` and `alternative_exercise_id`, so deleting an exercise removes every link that references it (in either direction). Because Phase 2 **soft-deletes** referenced exercises (`is_active = false`) rather than hard-deleting them, the common case is archival: an archived exercise that is still an alternative remains linked but is rendered with an "archived" marker on the detail page (consistent with the day-view archived-exercise edge case). The alternatives list join filters nothing by default but flags `is_active = false` targets.

**Rationale**: Cascade covers the genuine hard-delete path (an unreferenced exercise the athlete fully removes) and guarantees no dangling links. Surfacing archived alternatives (rather than hiding them) matches how the day view treats archived exercises and avoids silently dropping a still-useful reference.

**Alternatives considered**:

- _`ON DELETE RESTRICT`_ — rejected: would block deleting an exercise that happens to be someone's alternative, a confusing failure.
- _Hide archived alternatives entirely_ — rejected: inconsistent with the day-view archived treatment and loses information the athlete may still want.

**Touches**: migration FK clauses, `exerciseAlternatives.dao.js` join, `exerciseView.js`.

---

## D-8 — Exercise media: reuse existing columns + `photoStorage`; YouTube by URL; config-bounded uploads

**Decision**: Reuse `exercises.media_image_url` and `exercises.media_video_url` (no schema change). Image and **local video** uploads are multipart (`multer` memory storage, reused from Phase 2), validated against config allowlists/limits, then written via the `photoStorage` adapter (`put(athleteId, bytes, ext) → key`); the returned key/URL is stored in the column. A **YouTube** video is set by submitting a URL (no upload); the app stores the URL and embeds it via an `<iframe>` against `youtube-nocookie.com`. New config keys: `EXERCISE_MEDIA_MAX_BYTES` (default 26214400, matching the import limit), `EXERCISE_MEDIA_IMAGE_TYPES` (default `image/jpeg,image/png,image/webp`), `EXERCISE_MEDIA_VIDEO_TYPES` (default `video/mp4,video/webm`). Rejected uploads return a 4xx with the canonical error envelope and leave the existing column value untouched (FR-024).

**Rationale**: The media columns and the storage adapter already exist; reusing them avoids a migration and a second storage mechanism. `multer` is already a dependency. Bounding type/size via config honors Constitution III and prevents unbounded disk use. `youtube-nocookie.com` is the privacy-respecting embed host and needs no SDK or API key.

**Alternatives considered**:

- _Store media as base64 in the DB_ — rejected: bloats rows, bypasses the storage adapter, and breaks the export size budget.
- _Download YouTube videos locally_ — rejected: legally fraught, heavy, and unnecessary — a URL embed is sufficient.
- _A new `exercise_media` table_ — rejected: the single image + single video per exercise fits the existing two columns; a table would be over-modeling for this phase.

**Touches**: `config/schema.js`, `.env.example`, `exercises.controller.js` (upload/clear), `exercises.dao.js` (`setMedia`/`clearMedia`), `photoStorage/*` (reused).

---

## D-9 — Composed read models served by dedicated `/program/*` endpoints

**Decision**: Add three read endpoints under a new `/api/v1/program` surface — `GET /program/week`, `GET /program/day/:dayOfWeek`, `GET /program/exercises/:id` — each returning a fully composed view model (the frontend does not stitch together schedule + exercises + history + flags client-side). Composition happens server-side in the pure `services/trainingProgram/*` presenters, fed by the relevant DAOs. The existing `/exercises` CRUD and `/me/schedule` endpoints are unchanged; `/program/*` is additive and read-only.

**Rationale**: Server-side composition keeps the three round-trips bounded and the client thin, makes the empty-state rules testable in one pure place, and keeps the existing contracts stable (Constitution IV). It also means the performance budget is enforced server-side where the indexed reads live.

**Alternatives considered**:

- _Client-side composition from existing endpoints_ — rejected: many round-trips per screen, duplicated empty-state logic in the UI, and harder to unit-test the assembly.
- _Extend `/exercises/:id` to carry the full detail model_ — rejected: would overload the CRUD contract with read-only history/flag concerns and risk a breaking change; a separate `/program/exercises/:id` read model is cleaner.

**Touches**: new `routes/trainingProgram.routes.js`, `controllers/trainingProgram.controller.js`, `services/trainingProgram/*`.

---

## Summary of decisions

| ID  | Decision                                                            | Primary artifact(s)                          |
| --- | ------------------------------------------------------------------ | -------------------------------------------- |
| D-1 | 1RM = engine `primary_estimate_kg` from heaviest completed set      | `exerciseView.js`, `oneRepMax.js`            |
| D-2 | Last weight = heaviest completed set in most recent session         | `exerciseHistory.js`                         |
| D-3 | Load rec reuses progression-engine increments                       | `loadRecommendation.js`                      |
| D-4 | Progression indicator maps existing `progression_flags`             | `dayView.js`                                 |
| D-5 | New read-only `sessions.dao.js`                                     | `dataAccess/sessions.dao.js`                 |
| D-6 | One-directional `exercise_alternatives` table                       | migration, `exerciseAlternatives.dao.js`     |
| D-7 | Cascade on delete; surface archived alternatives                    | migration FKs, `exerciseView.js`             |
| D-8 | Reuse media columns + `photoStorage`; YouTube by URL; config limits | `config/schema.js`, `exercises.controller.js`|
| D-9 | Composed `/program/*` read endpoints                                | `trainingProgram.routes.js` + presenters     |

No unresolved unknowns remain. Ready for Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).
