---
description: 'Phase 4 — Session Journal implementation tasks'
---

# Tasks: Session Journal

**Input**: Design documents from `/specs/007-session-journal/`
**Prerequisites**: plan.md, spec.md, research.md (D-1…D-13), data-model.md, contracts/openapi.yaml, quickstart.md
**Tests**: INCLUDED — Constitution V mandates test-first for every number-producing function; plan.md enumerates the unit/contract/integration/smoke suites.

**Branch**: `007-session-journal` · **Tech**: Node 20+/ESM Express backend, React 18 + Vite + Tailwind frontend, Supabase PostgreSQL. **No new runtime dependency.**

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task.
- **[Story]**: US1–US4 (user-story phases only). Setup/Foundational/Polish carry no story label.
- Every task names exact file paths.

---

## 🚀 Ultracode Execution Guide (read before `/speckit-implement`)

This file is written to be implemented under **ultracode** (xhigh reasoning + dynamic workflow orchestration). Run it phase-by-phase; **do not** fan a whole phase to one agent blindly — the `[P]` markers are the fan-out unit.

**How to drive it:**

1. **Sequential gates, parallel interiors.** Phases run in order (Setup → Foundational → US1 → US2 → US3 → US4 → Polish). *Within* a phase, every `[P]` task is an independent workflow agent (different file, no shared-state write). Non-`[P]` tasks in a phase depend on an earlier task in the same phase — run them after their dependency.
2. **Test-first per story (red→green).** Each user-story phase starts with a `Tests` block. Spawn those `[P]` test agents first and confirm they **fail** before the implementation agents run. The pure-function unit tests (`bodySegment`, `calendar`, `currentPhase`, `sessionView`, `sessionTotals`, `personalRecords`, `summaryView`) are the Constitution V gate — they must be authored before their module.
3. **Recommended workflow shape per phase:** `pipeline(tasks, write→test→adversarially-verify)` — i.e. after a story's implementation tasks land, spawn one verification agent per Acceptance Scenario / Success Criterion (SC-001…SC-007) that tries to *break* it (empty history, rest day, prior-day stale session, incomplete-set finish, double-finish, audio-muted). Kill-and-fix on any confirmed failure. This is the "find → verify" pattern, scaled to each checkpoint.
4. **Same-file tasks are NOT `[P]` with each other.** `controllers/sessions.controller.js`, `services/dataAccess/sessions.dao.js`, `frontend/src/pages/journal/SessionJournal.jsx`, `tests/contract/sessions.contract.test.js`, and `tests/integration/sessions.lifecycle.test.js` are each touched by multiple stories — those touches are sequenced across phases (stories run in priority order), so they never collide. Within a single phase they appear once.
5. **Checkpoint discipline.** Stop at each `**Checkpoint**`, run that story's `Independent Test`, and only then proceed. US1 alone is a shippable MVP.
6. **Worktree isolation only if parallelizing across stories.** The default path is sequential stories; if you choose to staff US2/US3/US4 concurrently after Foundational, give each its own `isolation: 'worktree'` agent because they share `SessionJournal.jsx` / the controller.

**Fan-out map (the big `[P]` batches):** Foundational migrations+schemas (T002,T003,T005) · US1 tests (T009–T015) · US1 pure helpers (T016–T018) · US2 libs (T027,T028) · US4 tests (T038–T042) · US4 engine helpers (T043,T044) · Polish docs (T049,T050,T051,T054).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: One config knob the journal needs; the rest of the stack already exists from Phase 0–3.

- [X] T001 [P] Create `frontend/src/lib/sessionConfig.js` exporting `SESSION_AUTOSAVE_INTERVAL_MS = Number(import.meta.env?.VITE_SESSION_AUTOSAVE_INTERVAL_MS) || 30000` — the timer runs in the browser, so this is a frontend-only Vite build var (matching the `VITE_API_BASE` pattern in `frontend/src/lib/api.js`). Document the optional `VITE_SESSION_AUTOSAVE_INTERVAL_MS` in `.env.example`. **No backend `config/schema.js` change** (the server does not enforce the cadence; Constitution VI mandates ≤ 30 s).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, validation, the session write DAO, the route/controller skeleton, and the frontend shell — every user story builds on these.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [X] T002 [P] Create migration `supabase/migrations/20260602000002_extend_session_journal_day_of_week.sql` — `alter table … add column if not exists day_of_week int check (day_of_week is null or day_of_week between 1 and 7)` plus the partial index `session_journal_athlete_active_idx on (athlete_id, ended_at) where ended_at is null` (data-model §1.1, research D-3). No RLS change.
- [X] T003 [P] Create migration `supabase/migrations/20260602000003_alter_session_sets_set_number_per_exercise.sql` — drop `session_sets_session_id_set_number_key`, add `unique (session_id, exercise_id, set_number)` named `session_sets_session_exercise_set_number_key` (data-model §1.2, research D-4). Forward-only; safe (Phase 4 is first writer).
- [X] T004 Apply both migrations to the cloud project and verify (`supabase db push`; verify the `day_of_week` column and the new constraint per quickstart §1). Depends on T002, T003.
- [X] T005 [P] Add session input schemas to `services/engine/inputSchemas.js` reusing the existing `validate(schema, body)` helper: `sessionStartSchema` ({ day_of_week?: 1–7 }), `setInputSchema` ({ exercise_id, set_number, weight_kg, reps, rpe?, completed }) with the cross-field rule **completed ⇒ weight_kg>0 ∧ reps>0** (FR-009), `upsertSetsSchema` ({ sets: setInput[] }), `finishSessionSchema` ({ note?, energy_rating?: 1–5 }).
- [X] T006 Add the session **write** methods to `services/dataAccess/sessions.dao.js` (the file is read-only from Phase 3; keep its existing reads): `startSession`, `getByIdWithSets`, `findActiveForAthlete`, `upsertSets` (upsert on `(session_id, exercise_id, set_number)`, delete missing), `insertSet`, `updateSet`, `deleteSet`, `setRunningVolume`, `finishSession` (delete `completed=false` rows, then set `ended_at`/aggregates), `discardSession` (data-model §3). Athlete-scoped; throw `HttpError(500,'DB_ERROR',…)` on Supabase error, matching the existing DAO style.
- [X] T007 Create `routes/sessions.routes.js` (factory `sessionsRoutes({ daos, config })` wiring all 8 paths from `contracts/openapi.yaml`) and `controllers/sessions.controller.js` (factory `sessionsController({ daos, config })` exporting handler **stubs** for each route), then mount `v1.use('/sessions', sessionsRoutes({ daos: resolved, config }))` in `app.js` after the `/program` routers (research D-13). Depends on T006.
- [X] T008 [P] Frontend shell: in `frontend/src/App.jsx` add the `/journal` route (inside `<Shell>`) and a "Séance" nav `<Link>`; create the page skeleton `frontend/src/pages/journal/SessionJournal.jsx`, the API wrappers skeleton `frontend/src/lib/journalApi.js` (mirroring `programApi.js`'s `{ data }` unwrap), and the reducer-hook skeleton `frontend/src/lib/useSessionJournal.js` (states: `loading|idle|prompt|active|summary|error`).

**Checkpoint**: Migrations applied, DAO + routes + controller skeleton mounted, `/journal` reachable. User stories can begin.

---

## Phase 3: User Story 1 - Log today's session set by set (Priority: P1) 🎯 MVP

**Goal**: Auto-detect today's session, load the day's planned exercises (previous weight + suggested target), capture weight/reps/optional RPE/completion with ±2.5 / ±1 controls, and persist every completed set.

**Independent Test**: On a configured training day, open `/journal`, start the session, confirm the day's exercises load in order with previous weight + suggested target, log and complete sets via the quick controls (no keyboard), reload, and confirm completed sets persist (SC-001, SC-002, FR-001/003/004/005/006/007/008/009/010/011/011a).

### Tests for User Story 1 (write first — must FAIL before impl) ⚠️

- [X] T009 [P] [US1] Unit test `tests/unit/engine.bodySegment.test.js` — `bodySegmentFor(exercise)` returns `'upper'|'lower'` for representative slugs/targeted muscles (parity with current `progressionFlags.controller` derivation).
- [X] T010 [P] [US1] Unit test `tests/unit/sessionJournal.calendar.test.js` — `isoDayOfWeek(date)` (Mon=1…Sun=7, incl. Sunday) and `isSameAppDay(a,b)` (research D-1/D-2).
- [X] T011 [P] [US1] Unit test `tests/unit/sessionJournal.currentPhase.test.js` — `currentTrainingPhase({phases, programStartDate, now})` selects by cumulative weeks, clamps before-start → first and past-end → last (research D-8).
- [X] T012 [P] [US1] Unit test `tests/unit/sessionJournal.sessionView.test.js` — `buildSessionView` composes ordered exercises with `previous_weight_kg` (`lastWeightUsed`), `suggested_target_kg` (`recommendWorkingLoad`), `rest_seconds`, and this-session `sets`; neutral nulls when no history; archived exercise flagged (data-model §4.1, D-9).
- [X] T013 [P] [US1] Contract test `tests/contract/sessions.contract.test.js` — `POST /sessions` (201 SessionView), `GET /sessions/:id`, `PUT /sessions/:id/sets` (200), `POST /sessions/:id/sets` (201), `PATCH`/`DELETE /sessions/:id/sets/:setId`, plus the `completed`-without-weight/reps → 422 case (against `contracts/openapi.yaml`).
- [X] T014 [P] [US1] Integration test `tests/integration/sessions.lifecycle.test.js` — start → bulk-upsert sets → `GET /sessions/:id` returns the logged sets; per-exercise set numbering works (two exercises both with set 1); ad-hoc/off-plan exercise + extra set accepted (FR-011a). Skips when Supabase unreachable.
- [X] T015 [P] [US1] Frontend smoke `tests/frontend/SessionJournal.test.jsx` — journal renders the day's exercises with previous/suggested, a set logged via QuickStepper persists (journalApi mocked).

### Implementation for User Story 1

- [X] T016 [P] [US1] Create pure `services/engine/bodySegment.js` (`bodySegmentFor(exercise)`) and refactor `controllers/progressionFlags.controller.js` to import it instead of its inline derivation (no behavior change; keep Phase 1 tests green). [research D-6 shared helper]
- [X] T017 [P] [US1] Create pure `services/sessionJournal/calendar.js` — `isoDayOfWeek(date)`, `isSameAppDay(a,b)` (caller supplies dates; no `Date.now()` inside).
- [X] T018 [P] [US1] Create pure `services/sessionJournal/currentPhase.js` — `currentTrainingPhase({phases, programStartDate, now})` (research D-8).
- [X] T019 [US1] Create pure `services/sessionJournal/sessionView.js` — `buildSessionView({ session, slot, plannedExercises, exercisesById, muscleGroup, historyByExercise, activeFlagsByExercise, restSeconds, constants, now })` reusing `exerciseHistory.lastWeightUsed`, `loadRecommendation.recommendWorkingLoad`, `bodySegmentFor`. Depends on T016–T018.
- [X] T020 [US1] Implement in `controllers/sessions.controller.js`: `start` (today's `day_of_week` via `isoDayOfWeek` or body override; create via `startSession`; load slot+plan via `weeklyPlan.dao`, rest via `currentTrainingPhase`+`trainingPhases.dao`/`athletes.dao`, history via `sessions.dao`; return `buildSessionView`), `get`, `upsertSets` (PUT → `dao.upsertSets` + `setRunningVolume`), `addSet`/`updateSet`/`deleteSet`. Validates with the T005 schemas; `{ data }` envelope; 201/200/204. Depends on T006, T019.
- [X] T021 [P] [US1] Create `frontend/src/components/QuickStepper.jsx` — value + inline −/＋ buttons (step 2.5 for weight, 1 for reps), large hit targets, Tailwind tokens; wraps/extends `NumberField`.
- [X] T022 [US1] Create `frontend/src/components/SetEntryRow.jsx` — weight (QuickStepper ±2.5) · reps (QuickStepper ±1) · optional RPE · complete check; blocks complete unless weight>0 ∧ reps>0. Depends on T021.
- [X] T023 [US1] Implement `frontend/src/lib/journalApi.js` — `startSession(dayOfWeek?)`, `getSession(id)`, `upsertSets(id, sets)`, `addSet/updateSet/deleteSet`, each `.then(r => r.data)`.
- [X] T024 [US1] Build `frontend/src/pages/journal/SessionJournal.jsx` (MVP slice) — compute today's weekday, start/load the session, render exercises with previous/suggested, drive `SetEntryRow`, persist on complete via `journalApi`. No timers/auto-save yet. Reuses `StateBlock` for loading/empty (rest day → offer any-day start, FR-002). Depends on T021–T023, T020.

**Checkpoint**: US1 is a functional, shippable MVP — a session can be started and logged set-by-set with persistence.

---

## Phase 4: User Story 2 - Stay on tempo with session and rest timers (Priority: P2)

**Goal**: A live session elapsed clock and a rest countdown that auto-starts on set completion from the current phase's `rest_seconds`, with Web Audio cues near-end + at zero, degrading silently when audio is unavailable.

**Independent Test**: Start a session; the top timer counts up from `started_at`; completing a set auto-starts a countdown from `rest_seconds`; cues fire near-end and at zero; the rest can be skipped/adjusted for one rest; muting the device still completes the countdown visually (FR-012…FR-016, SC-005).

### Tests for User Story 2 (write first) ⚠️

- [X] T025 [P] [US2] Frontend smoke `tests/frontend/RestTimer.test.jsx` — completing a set starts a countdown from `rest_seconds`; cue callbacks fire at near-end and zero (audio module mocked); skip/adjust affects only the current rest.
- [X] T026 [P] [US2] Frontend smoke `tests/frontend/SessionTimer.test.jsx` — elapsed renders from a fixed `started_at` and increments on fake timers; resume recomputes true elapsed.

### Implementation for User Story 2

- [X] T027 [P] [US2] Create `frontend/src/lib/sessionTime.js` — `elapsedSeconds(startedAt, now)` and a `useElapsed(startedAt)` tick (server-authoritative start, D-12).
- [X] T028 [P] [US2] Create `frontend/src/lib/restTimerAudio.js` — Web Audio oscillator beeper (`beep()`), lazy `AudioContext`, **graceful no-op** when unavailable/muted (FR-016).
- [X] T029 [US2] Create `frontend/src/components/SessionTimer.jsx` — prominent elapsed clock using `sessionTime`. Depends on T027.
- [X] T030 [US2] Create `frontend/src/components/RestTimer.jsx` — countdown from `rest_seconds` (already in SessionView), near-end + zero cues via `restTimerAudio`, skip/adjust controls. Depends on T028.
- [X] T031 [US2] Integrate timers into `frontend/src/pages/journal/SessionJournal.jsx` — mount `SessionTimer` at top; auto-start `RestTimer` on each set completion. Depends on T029, T030.

**Checkpoint**: US1 + US2 — logging is now paced hands-free.

---

## Phase 5: User Story 3 - Never lose an in-progress session (Priority: P2)

**Goal**: Background auto-save (~30 s + on completion), automatic same-day resume with all sets intact and no duplicate session, and a resume-or-discard prompt for a prior-day unfinished session.

**Independent Test**: Log sets, reload `/journal` → same-day session resumes with every set; only one session per day (no duplicate); a session started yesterday shows a resume-or-discard prompt and is never silently resumed/closed/deleted (FR-017…FR-020, FR-019a, SC-004).

### Tests for User Story 3 (write first) ⚠️

- [X] T032 [P] [US3] Extend `tests/contract/sessions.contract.test.js` — `GET /sessions/active` (SessionView | null, `stale` flag), `DELETE /sessions/:id` (204), and `POST /sessions` → 409 `ACTIVE_SESSION_EXISTS` when one is open.
- [X] T033 [P] [US3] Extend `tests/integration/sessions.lifecycle.test.js` — same-day `findActiveForAthlete` resumes (no duplicate row on re-start attempt); a prior-day session returns `stale:true`; `discardSession` removes session + sets (RLS-scoped).
- [X] T034 [P] [US3] Frontend smoke `tests/frontend/SessionJournal.resume.test.jsx` — auto-save fires on the interval (fake timers); mount restores logged sets from `getActive`; stale session opens the resume/discard prompt.

### Implementation for User Story 3

- [X] T035 [US3] Implement in `controllers/sessions.controller.js`: `getActive` (compose SessionView via `findActiveForAthlete`; set `stale` from `isSameAppDay(started_at, now)`), `discard` (`discardSession` → 204), and add the **one-active-session guard** to `start` (409 `ACTIVE_SESSION_EXISTS`). Depends on T006, T017, T020.
- [X] T036 [US3] Implement `frontend/src/lib/useSessionJournal.js` — resume-on-mount via `journalApi.getActive`; auto-save timer at `SESSION_AUTOSAVE_INTERVAL_MS` imported from `frontend/src/lib/sessionConfig.js` (T001) (and on each completion) calling `upsertSets`; expose `stale` to drive the prompt; never auto-finish. Add `getActive`/`discardSession` to `frontend/src/lib/journalApi.js`.
- [X] T037 [US3] Wire a resume-or-discard prompt (reuse `ConfirmDialog`) into `frontend/src/pages/journal/SessionJournal.jsx` for `stale` sessions; same-day resumes silently. Depends on T036.

**Checkpoint**: US1–US3 — a workout survives reloads/interruptions with no data loss and no zombie sessions.

---

## Phase 6: User Story 4 - Review and close out the session (Priority: P3)

**Goal**: On finish, discard incomplete sets, compute the summary (duration, total volume, top performance, PRs), save note + energy rating, and trigger the Phase 1 engine **exactly once** (progression re-eval, 1RM record, audit) so Phase 3 stays current.

**Independent Test**: Finish a session containing a set heavier than the exercise's prior best → summary shows duration, total volume (completed-only), top performance, the PR(s), captures note + 1–5 energy; a second finish returns 409; afterward Phase 3 day/exercise reflect new last-weight/1RM/progression (FR-021…FR-026, FR-025a, FR-028, SC-006, SC-007).

### Tests for User Story 4 (write first) ⚠️

- [X] T038 [P] [US4] Unit test `tests/unit/engine.sessionTotals.test.js` — `totalVolume` (Σ weight×reps over completed only) and `topPerformance` (heaviest completed set, ties → reps); ignores incomplete sets (FR-028, D-11).
- [X] T039 [P] [US4] Unit test `tests/unit/engine.personalRecords.test.js` — `detectPersonalRecords` flags a weight PR (beats prior heaviest completed set) and a 1RM PR (new highest `primary_estimate_kg`); no PR from incomplete sets; empty history handled (FR-023, D-10).
- [X] T040 [P] [US4] Unit test `tests/unit/sessionJournal.summaryView.test.js` — `buildPostSessionSummary` assembles duration/volume/top/PRs/note/energy + the engine counts (data-model §4.3).
- [X] T041 [P] [US4] Extend `tests/contract/sessions.contract.test.js` — `POST /sessions/:id/finish` (200 PostSessionSummary) and the 409 `SESSION_ALREADY_FINISHED` re-finish.
- [X] T042 [P] [US4] Integration test `tests/integration/sessions.finish.test.js` — finish discards `completed=false` rows (D-7), finalizes `ended_at`/`total_volume_kg`, and produces the engine side effects: a superseded/active `progression_flags` row, a new `one_rep_max_records` row per performed exercise, and `calculation_results` rows with `reason='session_finish'`; second finish → 409; verifies Phase 3 `GET /program/day` + `/program/exercises/:id` now reflect the session. Skips when Supabase unreachable.

### Implementation for User Story 4

- [X] T043 [P] [US4] Create pure `services/engine/sessionTotals.js` — `totalVolume(completedSets)`, `topPerformance(completedSets)` (D-11).
- [X] T044 [P] [US4] Create pure `services/engine/personalRecords.js` — `detectPersonalRecords({ exerciseId, sessionCompletedSets, priorHeaviestCompletedSet, priorBestEstimate1rmKg, constants })` reusing `heaviestCompletedSet` + `oneRepMax` (D-10).
- [X] T045 [US4] Create pure `services/sessionJournal/summaryView.js` — `buildPostSessionSummary({ session, completedSets, exercisesById, prsByExercise, engineCounts })`. Depends on T043, T044.
- [X] T046 [US4] Implement `finish` in `controllers/sessions.controller.js` — finish-once guard (409 if `ended_at` set); `dao.finishSession` (discard incomplete + aggregates + `ended_at`); then the engine block per research D-6: `resolveConstants(appConfig.getOverridesFor)` → build `exercisesById` with `bodySegmentFor` → `evaluateForAthlete` → `progressionFlags.supersedeAndInsert` per candidate → per performed exercise `oneRepMax(feedSet)` → `oneRepMaxRecords.insert` → `writeAudit` (`one_rep_max` per record + one `progression_eval`, both `reason:'session_finish'`); PR detection reads `oneRepMaxRecords.latestForAthletePerExercise` **before** inserts; return `buildPostSessionSummary`. Depends on T006, T016, T045.
- [X] T047 [US4] Create `frontend/src/components/SessionSummary.jsx` — duration, total volume, top performance, PR list, note field, 1–5 energy rating, finish button; Tailwind tokens.
- [X] T048 [US4] Wire finish into `frontend/src/lib/useSessionJournal.js` + `frontend/src/pages/journal/SessionJournal.jsx` (`finishSession` → `summary` state → render `SessionSummary`). Depends on T046, T047.

**Checkpoint**: All four stories functional; finishing a session keeps the whole app's history/progression current.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T049 [P] Verify `.env.example` documents the optional `VITE_SESSION_AUTOSAVE_INTERVAL_MS` and that `frontend/src/lib/sessionConfig.js` defaults to 30000 when unset; confirm backend `config/schema.js` is unchanged.
- [X] T050 [P] Add a "Phase 4 — Session Journal" architecture section to `CLAUDE.md` (mirror the Phase 3 entry: write-path ownership, `services/sessionJournal/` presenter boundary, finish-engine trigger, the two session migrations, no-engine-on-autosave).
- [X] T051 [P] Record a Phase 4 compliance audit note in the governance log (per the Phase 3 precedent) confirming Constitution I/II/III/V/VI adherence.
- [X] T052 Run the full suite `npm test` (unit + integration + contract + frontend) and ensure green; integration/contract auto-skip offline.
- [X] T053 Run the `quickstart.md` curl + frontend walkthrough end-to-end against the cloud project.
- [X] T054 [P] Measure set-logging interaction latency (< 100 ms target, Operational Standards) and confirm the finish engine block runs off the UI thread.
- [X] T055 [P] Extend `tests/integration/rls.policies.test.js` with session-table isolation: add `session_journal_entries` and `session_sets` to the publishable-key "sees zero rows" `it.each` list, and add a per-test-JWT case where a session is created for athlete A via the secret-key client and an athlete-B JWT (publishable-key client) is denied both read and write on that session row + its sets (FR-027; Constitution I defense-in-depth — mirrors the Phase 3 RLS pattern at rls.policies.test.js lines 30–64).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories**. (T004 needs T002+T003; T007 needs T006.)
- **US1 (P3)** → after Foundational. **MVP.**
- **US2 (P4)** → after Foundational; consumes `rest_seconds` from US1's SessionView and integrates into US1's `SessionJournal.jsx` (so practically after US1).
- **US3 (P5)** → after Foundational; reuses US1's `calendar.js`, `start`, `journalApi`, and `SessionJournal.jsx`.
- **US4 (P6)** → after Foundational; reuses US1's `bodySegment.js` + DAO and integrates into US1's screen.
- **Polish (P7)** → after the desired stories.

Stories are independently *testable*, but US2–US4 each layer onto US1's `SessionJournal.jsx`/controller, so run them in priority order (or in `worktree`-isolated parallel agents if staffed concurrently).

### Within each story

Tests (red) → pure helpers `[P]` → presenters → controller handler → frontend components `[P]` → screen integration → green.

### Parallel opportunities

- **T002, T003, T005** (Foundational, different files).
- **T009–T015** (all US1 tests, different files).
- **T016, T017, T018** (US1 pure helpers, different files).
- **T021** parallel with the US1 helper tasks.
- **T027, T028** (US2 libs); **T025, T026** (US2 tests).
- **T032, T033, T034** (US3 tests).
- **T038–T042** (US4 tests); **T043, T044** (US4 engine helpers).
- **T049, T050, T051, T054** (Polish docs/measurement).

---

## Parallel Example: User Story 1 (workflow fan-out)

```text
# Stage 1 — author failing tests (parallel agents):
Task: T009 unit engine.bodySegment        Task: T010 unit sessionJournal.calendar
Task: T011 unit sessionJournal.currentPhase Task: T012 unit sessionJournal.sessionView
Task: T013 contract sessions               Task: T014 integration sessions.lifecycle
Task: T015 frontend smoke SessionJournal

# Stage 2 — pure helpers (parallel) → confirm unit tests green:
Task: T016 bodySegment.js   Task: T017 calendar.js   Task: T018 currentPhase.js   Task: T021 QuickStepper.jsx

# Stage 3 — compose + wire (sequential by dependency):
T019 sessionView.js → T020 controller handlers → T022 SetEntryRow → T023 journalApi → T024 SessionJournal.jsx

# Stage 4 — adversarial verify (parallel, one per SC/edge):
Verify: empty-history neutral state · rest-day any-day start · per-exercise set numbering · ad-hoc exercise · complete-blocked-without-weight
```

---

## Implementation Strategy

### MVP first (US1 only)

1. Setup (T001) → 2. Foundational (T002–T008) → 3. US1 (T009–T024) → **STOP & validate** the Independent Test → demo. A start-and-log journal with persistence is already useful.

### Incremental delivery

US1 (MVP) → US2 (pacing) → US3 (durability) → US4 (close-out + engine) — each a shippable increment that doesn't break the prior.

### Notes

- `[P]` = different files, no incomplete dependency. The shared multi-story files (`sessions.controller.js`, `sessions.dao.js`, `SessionJournal.jsx`, `sessions.contract.test.js`, `sessions.lifecycle.test.js`) are sequenced across phases — never edited by two concurrent agents unless worktree-isolated.
- Verify each story's tests fail before implementing (Constitution V).
- Commit after each task or logical group; stop at any checkpoint to validate independently.
- No new formula: 1RM = `oneRepMax`, progression = `evaluateForAthlete`, suggested target = `recommendWorkingLoad`. The engine runs **only** on finish (D-5/D-6).
