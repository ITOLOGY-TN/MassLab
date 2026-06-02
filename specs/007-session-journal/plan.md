# Implementation Plan: Phase 4 — Session Journal

**Branch**: `007-session-journal` | **Date**: 2026-06-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-session-journal/spec.md`

## Summary

Phase 4 is the **write path** for training. Phase 3 built the read-and-browse layer and deliberately left session history empty, degrading gracefully until this phase fills it. Phase 4 is the screen the athlete holds during a workout: it auto-detects today's session from the configured weekly schedule, walks the planned exercises one at a time (previous weight + suggested target), captures weight / reps / optional RPE / completion per set with one-handed ±2.5 / ±1 controls, runs a live session timer and an auto-starting rest timer with Web Audio cues, auto-saves at least every 30 s, and on finish produces a post-session summary (duration, total volume, top performance, PRs) **and triggers the deterministic Phase 1 engine exactly once** — progression re-evaluation, 1RM record capture, and the audit log — so Phase 3's indicators stay current.

Backend reuses the entire Phase 1/3 engine and DAO surface unchanged: `evaluateForAthlete` (progression), `oneRepMax`, `feedSet`/`heaviestCompletedSet`/`lastWeightUsed` (history), `recommendWorkingLoad` (suggested target), `supersedeAndInsert`/`oneRepMaxRecords.insert`/`writeAudit` (persisted writes). It adds: the **write methods** on the already-wired `services/dataAccess/sessions.dao.js` (Phase 3 shipped it read-only); a new pure `services/sessionJournal/` presenter boundary (session-view composition, summary, current-phase, calendar) plus two pure engine helpers (`sessionTotals.js`, `personalRecords.js`); a new `/api/v1/sessions` router + controller (the orchestration); and **two forward-only migrations on existing tables** (`session_journal_entries.day_of_week`; `session_sets` per-exercise uniqueness) — **no new table**. Frontend adds one new `/journal` route tree built through the Frontend Design skill on the existing Tailwind tokens, with new timer/audio/stepper components. Every number surfaced (volume, top performance, PRs, suggested target, 1RM) is produced by a pure, test-first function (Constitution V); no formula is reinvented.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–3; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino` / `pino-http`, `dotenv`, `zod`, `cors`. Session orchestration, presenters, and engine helpers are pure JavaScript reusing Phase 1/3 modules.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. The live timer, rest countdown, and rest-end beeps use the browser's native **Web Audio API** and `setInterval`/`requestAnimationFrame` — **no audio library, no new runtime dependency**. The ±2.5 / ±1 steppers wrap the existing `NumberField`.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). Phase 4 ships **two forward-only migrations on existing tables**: (1) add nullable `day_of_week int CHECK (1–7)` to `session_journal_entries` plus a partial index on `(athlete_id, ended_at) where ended_at is null`; (2) replace `session_sets`' `unique (session_id, set_number)` with `unique (session_id, exercise_id, set_number)` for per-exercise set numbering. No new table; RLS is unchanged (existing `*_own` policies key on `athlete_id`). Engine-owned writes (`progression_flags`, `one_rep_max_records`, `calculation_results`) reuse Phase 1 tables/DAOs unchanged.

**Testing**: Vitest. Per Constitution V, every number-producing function is unit-tested first (red → green → refactor):

- `services/engine/sessionTotals.js` (new, pure): `totalVolume(completedSets)`, `topPerformance(completedSets)` (heaviest completed set, ties → reps) — FR-021/FR-022, D-11.
- `services/engine/personalRecords.js` (new, pure): `detectPersonalRecords({ exerciseId, sessionCompletedSets, priorHeaviestCompletedSet, priorBestEstimate1rmKg, constants })` — weight-PR + 1RM-PR over completed sets only (FR-023, D-10).
- `services/sessionJournal/calendar.js` (new, pure): `isoDayOfWeek(date)` (Mon=1…Sun=7), `isSameAppDay(a, b)` — D-1/D-2.
- `services/sessionJournal/currentPhase.js` (new, pure): `currentTrainingPhase({ phases, programStartDate, now })` → the phase whose cumulative-weeks bucket contains elapsed weeks; clamps at ends — D-8.
- `services/sessionJournal/sessionView.js` + `summaryView.js` (new, pure presenters): assemble the `SessionView` (planned exercises + previous weight + suggested target + this-session sets) and `PostSessionSummary` from synthetic DAO output with **no I/O**; reuse `exerciseHistory`/`loadRecommendation`/`oneRepMax`.
- Reused pure (new asserting tests where behavior is newly exercised): `exerciseHistory.feedSet/heaviestCompletedSet/lastWeightUsed`, `loadRecommendation.recommendWorkingLoad`, `oneRepMax`, `progressionEngine.evaluateForAthlete`.
- Integration: full session lifecycle (start → auto-save upsert → finish) asserting (a) incomplete sets discarded on finish, (b) `total_volume_kg`/`ended_at` finalized, (c) `progression_flags` superseded + `one_rep_max_records` inserted + `calculation_results` appended with `reason='session_finish'`, (d) finish-once 409, (e) same-day resume reuses the session / no duplicate, (f) prior-day session flagged `stale`, (g) RLS isolation for the new write methods, (h) ad-hoc/off-plan exercise + extra-set logging.
- Contract: every path in `contracts/openapi.yaml` via Supertest (start/active/get/upsert/finish/discard + the 409/422 cases).
- Frontend smoke (RTL + jsdom): journal renders the day's exercises + steppers; completing a set starts the rest countdown (audio mocked); auto-save fires on the interval; resume restores logged sets; the summary renders duration/volume/PRs; the resume-or-discard prompt appears for a stale session.

**Target Platform**: Local dev on macOS/Linux today; future deploy to a hosted Node container behind a Vite static bundle. The journal is the most mobile-browser-critical screen (used mid-workout) — one-handed operability and sub-100 ms set interactions are first-class (Constitution VI + Operational Standards).

**Project Type**: Web application — same layout as Phase 0–3 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 4 introduces one new pure service sub-directory `services/sessionJournal/` (mirroring Phase 3's `services/trainingProgram/`) and two new helpers under the existing `services/engine/` boundary. All Supabase imports remain confined to `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Set-logging interactions respond in **< 100 ms** (Operational Standards) — the UI updates optimistically and persists asynchronously (auto-save + on-complete); the network write never blocks the input.
- Start → first completed set in **≤ 2 interactions** (SC-001); full set entry with **no keyboard** for 2.5 kg / 1-rep increments (SC-002).
- Auto-save fires at least every **30 s** during an active session (Constitution VI) and on each completion; resume restores 100% of logged sets (SC-004).
- Finish engine block runs **server-side, off the UI thread**; it is a bounded set of indexed reads + one `supersedeAndInsert` per affected scope + one `oneRepMax` per performed exercise + the audit append. Target ≤ 1 s server-side for a typical 5-exercise session.
- Live timer accuracy: elapsed = `now − started_at` (server-authoritative start), correct across reload/resume (D-12).

**Constraints**:

- **Write-once-correct on finish** (D-6): finishing is the single engine trigger and is guarded finish-once (`ended_at` null → set); a second finish returns `409 SESSION_ALREADY_FINISHED`. Because Supabase here exposes no multi-statement transaction, correctness rests on idempotency (`supersedeAndInsert` no-ops on unchanged flags) + the finish-once guard (prevents duplicate append-only 1RM/audit rows).
- **No engine on auto-save** (D-5, FR-018/Q5): mid-session saves touch only `session_sets` + the running volume; progression/1RM/audit run exclusively on finish.
- **Completed sets only** (FR-028): all finish-time figures and the engine feed read `completed = true` sets; incomplete sets are deleted on finish (D-7).
- **No engine reinvention**: 1RM = `oneRepMax.primary_estimate_kg`; progression = `evaluateForAthlete` + `supersedeAndInsert`; suggested target = `recommendWorkingLoad`; history selection = `exerciseHistory`. PR detection and session totals are the only new numeric logic, both pure and test-first.
- **Determinism**: every new engine/presenter function is pure — caller supplies `now`; no `Date.now()`/random/globals inside pure functions (matches `progressionEngine`'s `now` injection).
- **Tenant scoping** (Constitution I): every session/set read and write is parameterised by `req.athleteId`; the new `day_of_week` column inherits the existing RLS; no endpoint accepts an athlete id from the body.
- **Layering** (Constitution II): the only Supabase imports are the new write methods in `sessions.dao.js`; `services/sessionJournal/*` and `services/engine/*` take injected data and never import the client; dependency direction is `controllers → sessionJournal (+ engine) → dataAccess`.
- **Athlete-first UX** (Constitution VI — this is the phase that principle was written for): one-handed flows, ±2.5 kg / ±1 rep quick buttons, no fine-precision keyboard during a set, auto-save ≥ every 30 s.

**Scale/Scope**: 1 athlete; 0 new tables; 2 migrations on existing tables; ~8 new `/api/v1/sessions/*` endpoints; 1 frontend config var; ~1,500 LOC backend (DAO write methods + 2 engine helpers + 4 presenters + controller + routes + 2 migrations); ~2,000 LOC frontend (journal screen + session/rest timers + Web Audio beeper + stepper + set entry + summary + resume prompt + reducer hook + api lib); ~1,900 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. No new table; the added `session_journal_entries.day_of_week` column inherits the existing `session_journal_*_own` RLS (keyed on `athlete_id`), and the `session_sets` uniqueness change does not touch RLS. Every new DAO write method is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. Engine-owned writes (`progression_flags`, `one_rep_max_records`, `calculation_results`) reuse Phase 1 tables already RLS-protected.

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; the sessions controller orchestrates; the new `services/sessionJournal/*` presenters and `services/engine/{sessionTotals,personalRecords}.js` are pure (no I/O, no globals, caller-supplied `now`); the only new Supabase-touching code is the write methods added to `sessions.dao.js`. The frontend reaches every surface through `/api/v1/` and never touches the secret key.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. The one tunable (auto-save cadence) is a frontend Vite env var (`VITE_SESSION_AUTOSAVE_INTERVAL_MS`, default 30000 in `frontend/src/lib/sessionConfig.js`, mirroring the existing `VITE_API_BASE` pattern) — it is consumed only by the in-browser timer, so no backend key is added; rest intervals come from `training_phases.rest_seconds` (data, not constants); load increments come from `resolveConstants`. No athlete data, URLs, or magic numbers in services. No new secret.

- **IV. Versioned API Contract** — **PASS**. All new endpoints live under `/api/v1/sessions` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the Phase 0 canonical error envelope, and are additive within v1. Creates return 201, deletes/discards 204, mutations 200; conflict states use 409 with named codes (`ACTIVE_SESSION_EXISTS`, `SESSION_ALREADY_FINISHED`). No existing endpoint changes semantics.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every number surfaced as an outcome is produced by a pure function tested first: `sessionTotals` (volume, top performance), `personalRecords` (PR detection), `currentPhase` (rest interval selection), `calendar` (day detection), and the `sessionJournal` presenters (suggested target / resume composition). 1RM and progression reuse the already-tested Phase 1 engine; the finish orchestration is covered by integration tests asserting the persisted side effects. UI is exempt from strict TDD but ships smoke tests (render + complete-a-set + auto-save + resume).

- **VI. Athlete-First UX** — **PASS**. This phase directly implements Principle VI's named mandates: the journal's set logging, rest timer, and exercise navigation are one-handed with large hit targets and ±2.5 kg / ±1 rep quick buttons and no fine-precision keyboard during a set; auto-save fires at least every 30 s so a closed tab never costs a workout. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; empty/resume/finish states are designed, not blank. Every screen answers a real mid-session question (what do I do now / what should I lift / how am I pacing / what did I just achieve).

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables; the two existing-table migrations are forward-only, RLS-neutral, and safe (Phase 4 is the first writer of `session_sets`); every other write reuses an existing athlete-scoped DAO.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; new fields/paths are additive; the finish-once and active-session conflicts use named 409 codes.
- The source layout keeps Supabase imports inside `services/dataAccess/sessions.dao.js`, engine math inside `services/engine/*`, and view assembly inside the pure `services/sessionJournal/*`; no `models/` directory is added.
- Performance budgets hold: set writes are single indexed upserts; the finish block is a bounded set of indexed reads plus one write per affected scope/exercise; timers/audio are client-side and never touch the server (D-12).

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/007-session-journal/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-02)
├── research.md          # Phase 0 of plan — D-numbered decisions + rationale
├── data-model.md        # Phase 1 of plan — 2 existing-table migrations + write DAO + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the journal write path
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — new /api/v1/sessions/* endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 4 extends the Phase 0–3 layout. **Bold** = new in Phase 4; everything else already exists.

```text
masslab/
├── routes/
│   └── sessions.routes.js                 # NEW: POST /, GET /active, GET/:id, DELETE/:id, PUT/POST /:id/sets, PATCH/DELETE /:id/sets/:setId, POST /:id/finish
├── controllers/
│   └── sessions.controller.js             # NEW: start/active/get/discard, upsert/add/update/delete set, finish (engine orchestration)
├── services/
│   ├── engine/
│   │   ├── sessionTotals.js               # NEW pure: totalVolume, topPerformance
│   │   ├── personalRecords.js             # NEW pure: detectPersonalRecords
│   │   ├── bodySegment.js                 # NEW pure: bodySegmentFor(exercise) — extracted from progressionFlags.controller (shared upper/lower derivation)
│   │   ├── exerciseHistory.js             # reused: feedSet, heaviestCompletedSet, lastWeightUsed
│   │   ├── loadRecommendation.js          # reused: recommendWorkingLoad (suggested target)
│   │   ├── oneRepMax.js                   # reused: primary_estimate_kg (finish 1RM + PR)
│   │   ├── resolveConstants.js            # reused
│   │   └── auditWriter.js                 # reused: writeAudit (finish audit rows)
│   ├── sessionJournal/                    # NEW pure presenter boundary (mirrors trainingProgram/)
│   │   ├── calendar.js                    # isoDayOfWeek, isSameAppDay
│   │   ├── currentPhase.js                # currentTrainingPhase (rest_seconds source)
│   │   ├── sessionView.js                 # compose start/resume SessionView + suggested targets
│   │   └── summaryView.js                 # compose PostSessionSummary (duration/volume/top/PRs)
│   ├── progressionEngine.js               # reused: evaluateForAthlete (finish progression)
│   └── dataAccess/
│       ├── sessions.dao.js                # EXTENDED: write methods (start/upsert/finish/discard/find-active) — was read-only in Phase 3
│       ├── progressionFlags.dao.js        # reused: supersedeAndInsert (finish)
│       ├── oneRepMaxRecords.dao.js        # reused: insert + latestForAthletePerExercise (finish + PR)
│       ├── calculationResults.dao.js      # reused: audit insert (finish)
│       ├── weeklyPlan.dao.js              # reused: listSlotsWithExercises (load the day's plan)
│       ├── trainingPhases.dao.js          # reused: listForAthlete (current phase)
│       ├── athletes.dao.js                # reused: findById (program_start_date)
│       ├── muscleGroups.dao.js            # reused: day header
│       └── appConfig.dao.js               # reused: getOverridesFor (resolveConstants)
├── supabase/migrations/
│   ├── <ts>_extend_session_journal_day_of_week.sql          # NEW
│   └── <ts>_alter_session_sets_set_number_per_exercise.sql  # NEW
├── app.js                                 # EXTENDED: one line — v1.use('/sessions', sessionsRoutes({ daos, config }))
└── frontend/src/
    ├── pages/journal/
    │   └── SessionJournal.jsx             # NEW /journal — the live logging screen (reducer-driven state machine)
    ├── components/
    │   ├── SessionTimer.jsx               # NEW live elapsed clock from started_at
    │   ├── RestTimer.jsx                  # NEW countdown + Web Audio cues, skip/adjust
    │   ├── QuickStepper.jsx               # NEW ±2.5 kg / ±1 rep wrapper around NumberField
    │   ├── SetEntryRow.jsx                # NEW per-set weight/reps/RPE/complete
    │   ├── SessionSummary.jsx             # NEW post-session summary card
    │   └── (reuse StateBlock, ConfirmDialog → resume/discard, ProgressionBadge, tokens)
    ├── lib/
    │   ├── journalApi.js                  # NEW thin wrappers (startSession/fetchActive/upsertSets/finish/discard)
    │   ├── sessionConfig.js               # NEW frontend Vite-env config (SESSION_AUTOSAVE_INTERVAL_MS, default 30000)
    │   ├── restTimerAudio.js              # NEW Web Audio beeper (graceful no-op when unavailable)
    │   ├── sessionTime.js                 # NEW elapsed-from-started_at helper
    │   └── useSessionJournal.js           # NEW reducer hook (idle/loading/in_progress/summary/finished/error)
    └── App.jsx                            # EXTENDED: /journal route + "Séance" nav link
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–3. The architectural additions mirror Phase 3 exactly: a pure `services/sessionJournal/` presenter boundary (so the controller stays thin and view/summary assembly is unit-testable without I/O) and two pure `services/engine/*` helpers for the only new numeric logic (session totals, PR detection). The write methods land on the existing `services/dataAccess/sessions.dao.js` — Phase 3 built its read side and explicitly left the write side to Phase 4, so this completes that DAO rather than introducing a parallel one. The finish-time engine orchestration lives in the controller, mirroring `controllers/progressionFlags.controller.js` and `controllers/oneRepMaxRecords.controller.js`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
