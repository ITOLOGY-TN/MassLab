# Phase 0 Research — Phase 4: Session Journal

**Feature**: `007-session-journal` | **Date**: 2026-06-02

This phase has no open `NEEDS CLARIFICATION` markers (four spec clarifications were resolved on 2026-06-02). The research below records the implementation decisions that shape the data model, contracts, and tasks, each with rationale and the alternatives rejected. Decisions are D-numbered for reference from `tasks.md`.

Phase 4 is the **write path** for training sessions. Phase 3 already built the read-only `services/dataAccess/sessions.dao.js` (read methods), the pure `services/engine/exerciseHistory.js` (`heaviestCompletedSet`, `feedSet`, `lastWeightUsed`, `recentSessions`), `services/engine/loadRecommendation.js`, and `services/engine/oneRepMax.js`. Phase 1 already built the pure `services/progressionEngine.js` (`evaluateForAthlete`), the `progressionFlags`/`oneRepMaxRecords`/`calculationResults` DAOs, and `services/engine/auditWriter.js`. **Phase 4 adds the session/set write methods and the finish-time orchestration that reuses all of the above — it introduces no new formula.**

---

## D-1 — "Today's session" is the ISO calendar weekday, not an offset from `program_start_date`

**Decision**: The day a session targets is `today`'s **ISO calendar weekday** (Monday = 1 … Sunday = 7), matched against `weekly_plan_slots.day_of_week`. A pure helper `isoDayOfWeek(date)` maps a `Date` to 1–7. `program_start_date` is **not** used for day detection (it is used only for phase detection, D-8).

**Rationale**: `weekly_plan_slots` stores the literal weekday of each training day with `unique (athlete_id, day_of_week)` and `day_of_week between 1 and 7` — the schedule is "which weekdays are training days" (e.g. Mon/Tue/Wed/Fri/Sat). So "today's session" is simply "is today's weekday a configured slot?". Computing an offset from `program_start_date` would mis-map the schedule and break as soon as the start date is not a Monday.

**Alternatives considered**:

- _`(today − program_start_date) mod 7` offset_ — rejected: conflates "weeks into program" with "weekday"; produces wrong day mapping for any non-Monday start and contradicts how Phase 3's day view resolves `day_of_week`.

**Touches**: new pure `services/sessionJournal/calendar.js` (`isoDayOfWeek`), consumed by the sessions controller. Caller supplies `now` (no `Date.now()` inside the pure helper).

---

## D-2 — In-progress detection + same-day auto-resume vs. prior-day prompt

**Decision**: An **in-progress** session is a `session_journal_entries` row with `ended_at IS NULL`. There is at most one active session per athlete at a time (enforced in the controller, see D-3). On opening the journal:

- if the active session's `started_at` falls on **today** (athlete's app date) → resume it automatically (FR-019);
- if it was started on a **previous day** → return it flagged `stale: true` and the client prompts resume-or-discard; the backend never silently auto-resumes, auto-closes, or auto-deletes it (FR-019a).

"Today" is evaluated in a single app locale/timezone (single-user assumption); the staleness comparison is `dateOf(started_at) !== dateOf(now)`.

**Rationale**: `ended_at IS NULL` is the natural lifecycle marker already present in the Phase 0 schema — no status column is needed. The clarified UX (Q2) is exactly "same-day resumes silently, prior-day prompts", so the backend exposes the active session plus a `stale` flag and lets the client drive the prompt (`DELETE /sessions/:id` to discard, `GET /sessions/:id` to resume).

**Alternatives considered**:

- _Add a `status` enum column_ — rejected: `ended_at IS NULL` already encodes in-progress; a second source of truth invites drift.
- _Auto-close stale sessions server-side_ — rejected per Q2 (the athlete must choose); silent closure could finalize a half-logged session and wrongly trigger the engine.

**Touches**: `sessions.dao.js` (`findActiveForAthlete`), sessions controller, `services/sessionJournal/calendar.js` (`isSameAppDay`).

---

## D-3 — Record the targeted training day on the session (`day_of_week` column)

**Decision**: Add one nullable column `day_of_week int check (day_of_week between 1 and 7)` to `session_journal_entries` (forward-only migration). `POST /sessions` sets it to the chosen training day (defaulting to today's weekday, D-1); a fully unplanned/ad-hoc session may leave it null. The plan's exercises are reloaded server-side on resume by joining the recorded `day_of_week` back to `weekly_plan_slots`.

**Rationale**: The Phase 0 `session_journal_entries` table has no link to which day's plan a session belongs to. The spec requires (a) starting today's planned day, (b) starting **any** chosen training day as an extra session (Q1 deviation), and (c) resuming with the right planned exercises after a reload. Persisting the targeted weekday lets the backend recompose the planned-exercise view on resume without trusting client state, and lets Phase 5/stats attribute a session to a muscle-group day. The column is nullable and additive, so existing RLS (`session_journal_*_own`, keyed on `athlete_id`) covers it with no policy change.

**Alternatives considered**:

- _Track the day client-side only_ — rejected: the server cannot recompose the planned exercises on resume, cannot distinguish a planned vs. ad-hoc session, and loses the attribution Phase 5 needs.
- _FK to `weekly_plan_slots.id`_ — rejected: slots are re-created when the schedule is edited (Phase 2 `replaceSchedule`), so a slot id is unstable; the weekday is the stable key (consistent with how Phase 3 addresses days by `day_of_week`).

**Touches**: migration `*_extend_session_journal_day_of_week.sql`, `sessions.dao.js`, sessions controller.

---

## D-4 — Per-exercise set numbering (`unique (session_id, exercise_id, set_number)`)

**Decision**: Change the `session_sets` uniqueness from the Phase 0 `unique (session_id, set_number)` to `unique (session_id, exercise_id, set_number)` (forward-only migration: drop the old index/constraint, add the new one). Set numbering is therefore **per exercise within a session** (Bench set 1/2/3, Incline set 1/2/3).

**Rationale**: The journal logs multiple exercises per session and must support "add a set beyond the planned target" and ad-hoc exercises (Q1). With the original session-global uniqueness, two exercises could not both have a "set 1", and per-exercise indices would be gappy (1, 4, 7…). Per-exercise numbering is the natural model for the UI, for FR-010 ("preserving set order per exercise"), and for FR-011a (extra sets). **This is safe**: Phase 4 is the first writer of `session_sets` (no production rows exist), and the existing Phase 3 integration fixtures insert sets for a single exercise, which satisfy the new key unchanged. RLS is unaffected (it keys on `athlete_id`).

**Alternatives considered**:

- _Keep session-global `set_number` as a monotonic counter_ — rejected: gappy per-exercise display indices, awkward "next set number" computation when interleaving exercises, and it leaks session-global ordering into a per-exercise concept; Phase 5 analytics would have to re-derive per-exercise indices anyway.

**Touches**: migration `*_alter_session_sets_set_number_per_exercise.sql`, `sessions.dao.js` upsert key.

---

## D-5 — Auto-save is an idempotent bulk set upsert that never triggers the engine

**Decision**: Auto-save is `PUT /sessions/:id/sets` carrying the session's full current set array. The DAO upserts on `(session_id, exercise_id, set_number)` and deletes any of the session's sets not present in the payload, so the stored set list converges to the client's state (idempotent, replay-safe). Auto-save updates `session_sets` and the session's running `total_volume_kg` only; it **never** sets `ended_at` and **never** runs the progression/1RM/audit engine (D-6). Granular `POST`/`PATCH`/`DELETE` on individual sets are also provided for responsive single-set edits, but the bulk `PUT` is the durability primitive the ~30 s timer calls.

**Rationale**: Constitution VI mandates auto-save at least every 30 s so a closed tab never costs a workout. A bulk idempotent upsert is the simplest correct way to make "save the current state" replay-safe across reloads and flaky connectivity — re-sending the same payload is a no-op. Keeping the engine off this path honors FR-018/clarification Q5 ("saving mid-session does not recompute progression").

**Alternatives considered**:

- _Append-only per-set POST as the sole write path_ — rejected as the durability primitive: edits/removals and resumed-state reconciliation become bookkeeping-heavy; kept as a secondary convenience endpoint.
- _Persist on every keystroke_ — rejected: needless write volume; the 30 s cadence plus on-complete saves is sufficient and matches the constitution.

**Touches**: `sessions.dao.js` (`upsertSets`, `insertSet`, `updateSet`, `deleteSet`), sessions controller, frontend `sessionConfig.js` (`SESSION_AUTOSAVE_INTERVAL_MS`, a Vite env var — no backend config key).

---

## D-6 — Finish triggers the engine via the existing persisted-write pattern

**Decision**: `POST /sessions/:id/finish` runs, in order: (1) atomically finalize the session (`UPDATE … WHERE ended_at IS NULL`) — the finish-once guard — then discard incomplete sets (D-7); (2) `total_volume_kg` is computed from completed sets and stored with `ended_at = now`, `note`, `energy_rating`; (3) run the deterministic engine exactly as the existing controllers do —

```javascript
const constants = resolveConstants(await daos.appConfig.getOverridesFor(athleteId));
const candidates = evaluateForAthlete({ sessions, sets, weeklyPlan, exercisesById, constants, now });
for (const c of candidates) await daos.progressionFlags.supersedeAndInsert({ athleteId, scopeKind: c.scope_kind, scopeRef: c.scope_ref }, c.flag);
for (const ex of exercisesPerformed) {                       // one 1RM record per exercise with a completed feed set
  const fs = feedSet(historyForExercise(ex));
  const orm = oneRepMax({ weight_kg: fs.weight_kg, reps: fs.reps, constants });
  const rec = await daos.oneRepMaxRecords.insert({ athlete_id, exercise_id: ex, source_weight_kg: fs.weight_kg, source_reps: fs.reps, ...orm, engine_version: ENGINE_VERSION, resolved_constants: constants });
  await writeAudit({ daos, athleteId, calculator: 'one_rep_max', reason: 'session_finish', inputs: {...}, outputs: orm, resolvedConstants: constants, engineVersion: ENGINE_VERSION, producedRecord: { kind: 'one_rep_max_records', id: rec.id } });
}
await writeAudit({ daos, athleteId, calculator: 'progression_eval', reason: 'session_finish', inputs: {...}, outputs: { active_flag_count }, resolvedConstants: constants, engineVersion: ENGINE_VERSION });
```

mirroring `controllers/progressionFlags.controller.js` and `controllers/oneRepMaxRecords.controller.js`. The audit rows carry `reason: 'session_finish'` (the `reason` column added in Phase 2); the `calculator` values reuse the existing `progression_eval` and `one_rep_max` semantics (the `calculator` CHECK was dropped in `20260508000000`, but the established enum values are reused — no new type invented).

Because Supabase here exposes no multi-statement transaction, atomicity is replaced by **idempotency + a finish-once guard**: `finishSession` rejects with `409 CONFLICT` if the session already has `ended_at` set, so the engine block runs exactly once per session. `supersedeAndInsert` is already idempotent (no-ops on an unchanged flag); `oneRepMaxRecords.insert` and `writeAudit` are append-only and therefore only safe because the finish-once guard prevents re-entry.

**Rationale**: Phase 1's overload engine is specified to "run after every logged session", and CLAUDE.md lists session finish as a persisted-write path that must call `auditWriter`. Reusing `evaluateForAthlete` + `supersedeAndInsert` + `oneRepMax` + `writeAudit` keeps a single source of truth for progression/1RM math (no second 1RM number, no duplicated rules) and keeps Phase 3's indicators current (FR-026). The engine functions are pure and take injected history, so the controller loads history via the DAO and passes plain data.

**Alternatives considered**:

- _Call the existing `POST /progression-flags/evaluate` and `POST /one-rep-max-records` HTTP endpoints from finish_ — rejected: internal HTTP self-calls are fragile and re-validate/re-resolve redundantly; calling the underlying functions directly is the established pattern.
- _A new `calculator: 'session_finish'` audit type_ — rejected: the work is genuinely progression evaluation + 1RM recording; reusing those calculator labels with `reason: 'session_finish'` keeps audit analytics consistent.
- _Run the engine on auto-save_ — rejected (D-5, Q5).

**Body-segment derivation (shared)**: both `evaluateForAthlete` (via `exercisesById[id].body_segment`) and `recommendWorkingLoad` (`bodySegment`) need each exercise's `'upper' | 'lower'` segment, which is **not** a column — it is derived today inline in `controllers/progressionFlags.controller.js`. Phase 4 needs the identical derivation when building `exercisesById` for the finish engine and when computing the suggested target (D-9). To avoid a second divergent copy, **extract the derivation into a shared pure helper** (e.g. `services/engine/bodySegment.js` → `bodySegmentFor(exercise)`) and have both `progressionFlags.controller` and the sessions controller use it. Unit-tested with the other pure helpers (Constitution V).

**Touches**: sessions controller (finish orchestration), reuses `services/progressionEngine.js`, `services/engine/{oneRepMax,resolveConstants,auditWriter,constants}.js`, new shared `services/engine/bodySegment.js`, `daos.{progressionFlags,oneRepMaxRecords,calculationResults,appConfig}`.

---

## D-7 — Discard incomplete sets on finish

**Decision**: `finishSession` deletes every `session_sets` row for the session with `completed = false` before computing aggregates and marking `ended_at`. Only completed sets are persisted into history (FR-025a, clarification Q4). All finish-time figures (volume, top performance, PRs, the engine feed) read completed sets exclusively (FR-028).

**Rationale**: Phase 3 already reads only completed sets for its history surfaces; persisting half-entered sets would pollute Phase 3/Phase 5 history and the 1RM feed with non-lifts. Deleting them at the single finish boundary keeps `session_sets` meaning exactly "sets the athlete completed".

**Alternatives considered**:

- _Persist incomplete sets with `completed = false`_ — rejected per Q4 (clean history; Phase 3/5 never want them) — the user explicitly chose discard.

**Touches**: `sessions.dao.js` (`deleteIncompleteSets` inside `finishSession`).

---

## D-8 — Current training phase is derived from `program_start_date` + phase `weeks`

**Decision**: The rest-timer default reads `rest_seconds` from the athlete's **current** training phase, computed by a pure helper `currentTrainingPhase({ phases, programStartDate, now })`: order phases by `display_order`, accumulate `weeks`, and select the phase whose cumulative week-range contains the number of whole weeks elapsed since `program_start_date`; clamp to the last phase past the program end and to the first phase if `now` precedes the start. No schema change.

**Rationale**: `training_phases` carries `rest_seconds`, `weeks`, and `display_order` but no `is_current` flag or date range. The program is a fixed ordered sequence of phases of known durations starting at `program_start_date`, so the current phase is fully determined by elapsed weeks — deriving it deterministically avoids adding state that could drift and keeps the rest interval correct as the program progresses (PLAN.md's 90 s / 120 s / 150 s come from the phase rows).

**Alternatives considered**:

- _Add an `is_current` flag / date columns to `training_phases`_ — rejected: introduces mutable state to keep in sync; the value is already implied by `program_start_date` + `weeks`.
- _Always use the first phase_ — rejected: the rest interval would never advance with the program.

**Touches**: new pure `services/sessionJournal/currentPhase.js`, fed by `trainingPhases.dao.listForAthlete` + `athletes.dao.findById(program_start_date)`.

---

## D-9 — Suggested target reuses the Phase 3 load recommendation

**Decision**: The per-exercise "suggested target weight" shown at the top of each exercise is the same value Phase 3 surfaces: `loadRecommendation.recommendWorkingLoad({ lastWeightKg, activeFlag, bodySegment, constants })` fed by `exerciseHistory.lastWeightUsed` (heaviest completed set in the most recent session). When the active flag is `add_load`, it is last weight + `load_increment_{upper,lower}_kg`; otherwise it holds the last weight; `null` (neutral state) when no history exists.

**Rationale**: The journal and the Phase 3 day/exercise views must never disagree on what to lift (SC consistency). Reusing the exact Phase 3 functions guarantees one source of truth for the recommendation and avoids reintroducing the rule. No new constant or formula.

**Alternatives considered**:

- _Percentage-of-1RM target_ — rejected for this phase (same reasoning as Phase 3 D-3); would contradict the progression flag.

**Touches**: reuses `services/engine/{loadRecommendation,exerciseHistory}.js`; composed in `services/sessionJournal/sessionView.js`.

---

## D-10 — Personal-record detection is a new pure function over completed sets

**Decision**: A new pure `services/engine/personalRecords.js` → `detectPersonalRecords({ exerciseId, sessionCompletedSets, priorHeaviestCompletedSet, priorBestEstimate1rmKg, constants })` flags a PR when, for an exercise, the session's heaviest completed set **exceeds the athlete's previous all-time heaviest completed set** for that exercise, **and/or** the session's `oneRepMax(...).primary_estimate_kg` exceeds the previous highest recorded estimate. "Prior" history excludes the just-finished session's sets. Detection uses completed sets only.

**Rationale**: The spec (FR-023, clarification Q3) defines a PR precisely; no existing engine function computes it. Keeping it pure and test-first (Constitution V) lets the summary, weight-PR, and 1RM-PR cases be unit-tested deterministically. "Prior heaviest" reuses `exerciseHistory.heaviestCompletedSet`; "prior best estimate" reads `daos.oneRepMaxRecords.latestForAthletePerExercise` taken **before** the finish inserts this session's record.

**Alternatives considered**:

- _Infer PRs from whether the engine raised an `add_load` flag_ — rejected: the flag answers "ready to progress", not "beat your best"; they are different signals.

**Touches**: new pure `services/engine/personalRecords.js`, fed by `sessions.dao` history + `oneRepMaxRecords.dao`, composed in `services/sessionJournal/summaryView.js`.

---

## D-11 — Post-session summary figures are pure helpers; top performance = heaviest completed set

**Decision**: New pure `services/sessionJournal/summaryView.js` composes the post-session summary from completed sets: `total_volume_kg = Σ(weight_kg × reps)`; `top_performance` = the single heaviest completed set (ties broken by higher reps, per clarification Q3); `prs` from D-10; plus duration (`ended_at − started_at`) and the saved note/energy rating. The underlying numeric helpers live in pure `services/engine/sessionTotals.js` (`totalVolume(sets)`, `topPerformance(sets)`).

**Rationale**: These are numbers surfaced as outcomes, so Constitution V requires them test-first and pure. Keeping them out of the controller makes the summary assembly unit-testable against synthetic sets with no I/O.

**Touches**: new pure `services/engine/sessionTotals.js`, `services/sessionJournal/summaryView.js`.

---

## D-12 — Timers and audio are client-side; the server is authoritative only for `started_at`

**Decision**: The live session timer renders `now − started_at` using the server-stored `started_at`, so a reload/resume shows true elapsed time. The rest timer counts down from the current phase's `rest_seconds` (D-8) entirely client-side, emitting a Web Audio beep near the end and at zero, and degrading silently to a visual-only countdown when audio is unavailable (FR-016). A per-rest skip/override is client-only and **not persisted** (no `session_sets` column for it).

**Rationale**: Timers and audio are presentation concerns (Principle VI), not domain state. Anchoring elapsed time to the server `started_at` is the only piece that must survive reloads; everything else is ephemeral UI. Not persisting rest overrides keeps `session_sets` to its meaning and avoids a needless column.

**Alternatives considered**:

- _Persist elapsed/rest state server-side_ — rejected: `started_at` plus the wall clock fully reconstructs elapsed time; storing a ticking value would be redundant and stale.
- _A `rest_override_seconds` column on `session_sets`_ — rejected: no read surface needs it in this phase; can be added later if analytics require it.

**Touches**: frontend `lib/sessionTime.js`, `lib/restTimerAudio.js`, `components/{SessionTimer,RestTimer}.jsx`.

---

## D-13 — A new `/api/v1/sessions` router; a new pure `services/sessionJournal/` presenter boundary

**Decision**: Add a dedicated `routes/sessions.routes.js` + `controllers/sessions.controller.js` mounted at `/api/v1/sessions` (the `daos.sessions` slot is already wired in `app.js`). View composition (start/resume `SessionView` with planned exercises + suggested targets, and the `PostSessionSummary`) lives in a new pure `services/sessionJournal/` boundary, mirroring Phase 3's `services/trainingProgram/`. Controllers read DAOs and hand plain data to these presenters; the only Supabase imports remain in `sessions.dao.js`.

**Rationale**: Mirrors the established Phase 3 layering (thin route → controller → pure presenter → DAO), keeps the write/orchestration logic testable, and keeps the new endpoints additive under `/api/v1` (Principle IV). A separate `sessions` surface (not an extension of `/program`) cleanly separates the write path from Phase 3's read views.

**Touches**: `routes/sessions.routes.js`, `controllers/sessions.controller.js`, `services/sessionJournal/*`, `app.js` (one `v1.use('/sessions', …)` line).

---

## Summary of decisions

| ID   | Decision                                                                 | Primary artifact(s)                                   |
| ---- | ------------------------------------------------------------------------ | ----------------------------------------------------- |
| D-1  | Today = ISO calendar weekday (not start-date offset)                      | `sessionJournal/calendar.js`                          |
| D-2  | In-progress = `ended_at IS NULL`; same-day resume vs prior-day prompt     | `sessions.dao.js`, controller                         |
| D-3  | Record targeted `day_of_week` on the session (new column)                | migration, `sessions.dao.js`                          |
| D-4  | Per-exercise set numbering `unique (session_id, exercise_id, set_number)` | migration, `sessions.dao.js`                          |
| D-5  | Auto-save = idempotent bulk set upsert; no engine                        | `sessions.dao.js`, controller                         |
| D-6  | Finish triggers engine via existing pattern; finish-once guard           | controller, `progressionEngine`, `auditWriter`        |
| D-7  | Discard incomplete sets on finish                                        | `sessions.dao.js`                                     |
| D-8  | Current phase derived from `program_start_date` + phase `weeks`          | `sessionJournal/currentPhase.js`                      |
| D-9  | Suggested target reuses Phase 3 load recommendation                      | `loadRecommendation.js`, `sessionJournal/sessionView.js` |
| D-10 | PR detection = new pure function over completed sets                     | `engine/personalRecords.js`                           |
| D-11 | Summary figures pure; top performance = heaviest completed set           | `engine/sessionTotals.js`, `sessionJournal/summaryView.js` |
| D-12 | Timers/audio client-side; server authoritative for `started_at` only     | frontend `lib/*`, components                          |
| D-13 | New `/api/v1/sessions` router + pure `sessionJournal/` boundary          | `routes/`, `controllers/`, `services/sessionJournal/` |

No unresolved unknowns remain. Ready for Phase 1 design artifacts (data-model.md, contracts/, quickstart.md).
