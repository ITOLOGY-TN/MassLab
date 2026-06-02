# Feature Specification: Session Journal

**Feature Branch**: `007-session-journal`  
**Created**: 2026-06-02  
**Status**: Draft  
**Input**: User description: "Phase 4: Session Journal — fast in-session logging screen with timer, per-set input, rest timer, auto-save, and post-session summary"

## Overview

Phase 4 is the **write path** for training. Phase 3 built the read-and-browse layer (weekly view, day detail, exercise detail) and deliberately left session history empty, degrading gracefully until this phase fills it. Phase 4 is the screen the athlete actually holds during a workout: it captures every set they perform and, on completion, produces the history that the rest of the app consumes.

It is the **most-used screen in the product** and must work fast with one hand while training. Four capabilities make it work:

1. **Log today's session set by set** — auto-detect which day's session is due from the configured weekly schedule, walk the planned exercises one at a time with the previous weight and a suggested target, and capture weight / reps / optional RPE / completion per set.
2. **Guided timing** — a live session timer at the top and a rest timer that auto-starts when a set is completed, counts down based on the current training phase, and signals with audio cues.
3. **Never lose progress** — auto-save in the background so an interrupted or backgrounded session can be resumed exactly where it was left.
4. **Close out the session** — a post-session summary with duration, total volume, top performance, newly detected personal records, a free note, and an energy rating.

On completion, finishing a session is what triggers the deterministic engine work defined in Phase 1 (progression-flag re-evaluation, 1RM record capture, audit log) — so the indicators Phase 3 reads stay current. This phase is the single owner of the session write path (Phase 3 reads it read-only).

## Clarifications

### Session 2026-06-02

- Q: Where does the per-exercise "suggested target weight" come from? → A: Reuse the Phase 3 load recommendation — last completed weight plus the engine `load_increment` when the exercise has an active `add_load` flag, otherwise hold the last weight; neutral when no history exists.
- Q: What counts as a "new PR" in the post-session summary? → A: A completed set whose weight exceeds the athlete's previous all-time heaviest completed set for that exercise, and/or a new highest estimated 1RM for that exercise; PRs are detected per exercise from completed sets only.
- Q: What drives the rest-timer default duration (90s / 120s / 150s)? → A: The rest interval configured on the athlete's current training phase; the athlete can override the countdown per rest without changing the phase default.
- Q: What happens on a rest day, or when no session is scheduled for today? → A: The athlete can still start a session by picking any training day (an unplanned/extra session), which is logged against that day's plan; the screen never hard-blocks logging.
- Q: Does finishing a session recompute progression/1RM? → A: Yes — completing a session triggers the existing Phase 1 engine (progression re-evaluation, 1RM record, audit log) so Phase 3's indicators stay current. Saving individual sets mid-session does not.
- Q: How much can the athlete deviate from the day's planned exercises and target set count? → A: Freely — add or remove sets beyond the planned target and log exercises not on the day's plan (real workouts vary); the plan seeds the session but does not constrain it.
- Q: What happens to an in-progress session left unfinished from a previous day? → A: Prompt the athlete to resume it or discard it; do not silently auto-close, auto-resume, or auto-delete. Only same-day in-progress sessions resume automatically.
- Q: How is the post-session "top performance" highlight defined? → A: The single completed set with the highest weight in the session (ties broken by reps).
- Q: Are entered-but-never-completed sets stored when a session is finished? → A: No — only completed sets are persisted; incomplete sets are discarded on finish.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Log today's session set by set (Priority: P1)

The athlete arrives at the gym, opens the Session Journal, and the screen already knows which session is due today from their weekly schedule. They see the planned exercises for that day, one focused exercise at a time, each showing the previous weight used and a suggested target. For every set they enter the weight (with quick +2.5 / −2.5 adjustments), the reps (with quick +1 / −1), an optional RPE, and tick it complete. They move through the exercises and the sets are captured.

**Why this priority**: This is the entire reason the screen exists — capturing what was lifted. It is the minimum viable slice: even with no timer, no auto-save, and no summary, an athlete who can record their sets for today's session and have that history persist has a working journal, and it is what unblocks every downstream surface (Phase 3 history, Phase 5 progression, statistics).

**Independent Test**: With a configured schedule, open the Session Journal on a training day, confirm the day's planned exercises load in order with previous weight and suggested target, enter and complete several sets across exercises using the quick-adjust controls, and confirm every completed set persists and is retrievable as session history.

**Acceptance Scenarios**:

1. **Given** today maps to a configured training day, **When** the athlete opens the Session Journal, **Then** a session for that day is available to start and its planned exercises are listed in their configured order.
2. **Given** an exercise with prior history, **When** it becomes the focused exercise, **Then** the screen shows its previous weight used and a suggested target weight.
3. **Given** the focused exercise, **When** the athlete enters a set's weight and reps, **Then** the +2.5 / −2.5 controls adjust the weight and the +1 / −1 controls adjust the reps without manual typing.
4. **Given** a set with weight and reps entered, **When** the athlete records an RPE between 1 and 10, **Then** the RPE is captured; leaving RPE blank is allowed.
5. **Given** a set is filled in, **When** the athlete marks it complete, **Then** the set is recorded as a completed set for that exercise in the current session.
6. **Given** multiple exercises are planned, **When** the athlete advances through them, **Then** each exercise's sets are captured independently and in order.
7. **Given** an exercise with no prior history, **When** it is focused, **Then** the previous-weight and suggested-target show a neutral empty state and the athlete can still log sets.
8. **Given** an exercise has reached its planned target set count, **When** the athlete adds another set or logs an exercise not on the day's plan, **Then** the extra set / ad-hoc exercise is accepted and recorded against the session.

---

### User Story 2 - Stay on tempo with session and rest timers (Priority: P2)

While logging, the athlete sees a live elapsed-time clock for the whole session running at the top. Each time they complete a set, a rest timer starts automatically and counts down from the rest interval defined by their current training phase. As the countdown nears the end, audio cues signal that rest is almost over and that it is time for the next set, so the athlete can keep their phone down and stay on tempo.

**Why this priority**: Pacing is a core part of why this screen replaces pen and paper, and the audio cues are what let it run hands-free. But sets can be logged correctly without any timer, so it builds on US1 rather than gating it.

**Independent Test**: Start a session, confirm the session timer increments continuously from start, complete a set and confirm a rest countdown auto-starts from the current phase's interval, hears/observes the near-end and end cues, and confirm the rest timer can be skipped or adjusted for a single rest.

**Acceptance Scenarios**:

1. **Given** a session has started, **When** time passes, **Then** a live session timer at the top shows continuously increasing elapsed time.
2. **Given** the athlete completes a set, **When** the completion is recorded, **Then** a rest timer auto-starts and counts down from the rest interval configured on the current training phase.
3. **Given** a running rest countdown, **When** it reaches the near-end threshold and again at zero, **Then** an audio cue fires at each of those points.
4. **Given** a running rest countdown, **When** the athlete chooses to skip or adjust it, **Then** the countdown ends or changes for that rest only, without altering the phase's default interval.
5. **Given** the device cannot play audio (muted or unsupported), **When** the cue points are reached, **Then** the countdown still completes visually and logging is unaffected.

---

### User Story 3 - Never lose an in-progress session (Priority: P2)

The athlete's session is preserved as they go: entered and completed sets are saved in the background without an explicit save action. If the app is backgrounded, the phone locks, or they navigate away and come back, the in-progress session is still there with all sets intact and they continue exactly where they left off.

**Why this priority**: A workout can span an hour with interruptions; silently losing logged sets would destroy trust in the screen. It is independent of timers and the summary, but it protects the US1 data, so it is high-value P2.

**Independent Test**: Start a session, log several sets, leave the screen / reload, return, and confirm the in-progress session and all previously entered sets are restored and editable, with no duplicate session created.

**Acceptance Scenarios**:

1. **Given** an active session with logged sets, **When** roughly half a minute passes without an explicit save, **Then** the session and its sets are persisted automatically.
2. **Given** the athlete leaves and returns to the Session Journal, **When** an in-progress session exists for the day, **Then** that session is resumed with all prior sets intact rather than a new empty session being created.
3. **Given** an interrupted session is resumed, **When** the athlete continues logging, **Then** new sets append to the existing session without duplicating earlier ones.
4. **Given** auto-save runs, **When** it persists, **Then** it does not mark the session finished — only an explicit finish closes the session.

---

### User Story 4 - Review and close out the session (Priority: P3)

When the athlete finishes, they get a summary of what they just did: total session duration, total volume lifted, a top-performance highlight, and any new personal records detected during the session. They add a general note and an energy rating from 1 to 5, then finish. Finishing the session updates the athlete's progression and strength figures so the rest of the app reflects the work just done.

**Why this priority**: The summary turns raw logging into a sense of accomplishment and feeds the progression engine, but the session is already captured by US1; this slice can ship last because logging is valuable without the wrap-up.

**Independent Test**: Complete a session containing at least one set heavier than the exercise's prior best, finish it, and confirm the summary shows duration, total volume, top performance, the detected PR(s), captures a note and a 1–5 energy rating, and that completion refreshes the exercise's progression indicator and 1RM downstream.

**Acceptance Scenarios**:

1. **Given** a session with completed sets, **When** the athlete opens the post-session summary, **Then** it shows the total session duration and the total volume lifted (sum of weight × reps over completed sets).
2. **Given** completed sets across exercises, **When** the summary renders, **Then** it highlights the top performance — the highest-weight completed set of the session (ties broken by reps).
3. **Given** a completed set heavier than the athlete's previous all-time best for that exercise, **When** the summary renders, **Then** that set is flagged as a new personal record.
4. **Given** the summary screen, **When** the athlete enters a general note and an energy rating between 1 and 5, **Then** both are saved with the session.
5. **Given** the athlete finishes the session, **When** completion is recorded, **Then** the session is marked ended and the progression-flag re-evaluation, 1RM record capture, and audit log run for the exercises performed.
6. **Given** a finished session, **When** the athlete next views the relevant day or exercise in Phase 3, **Then** the last-weight, recent-sessions, estimated 1RM, and progression indicator reflect the session just logged.

---

### Edge Cases

- **No session scheduled today (rest day) or no schedule configured**: the screen offers the athlete a way to start a session for any chosen training day (an unplanned/extra session) instead of blocking; it never shows a dead end.
- **Same exercise planned on multiple days**: sets are recorded against the exercise, so history and PRs read consistently regardless of which day's session they were logged in.
- **An incomplete set left at session finish**: incomplete sets are discarded on finish — they are not persisted and never count toward volume, top performance, PRs, or downstream history.
- **An in-progress session left over from a previous day**: on opening the journal the athlete is prompted to resume or discard it; it is never silently auto-resumed, auto-closed, or auto-deleted. Same-day in-progress sessions resume automatically without a prompt.
- **Logging beyond the plan**: the athlete may add extra sets past the planned target and log exercises not on the day's plan; these are recorded against the session and the exercise like any other set.
- **Athlete edits a previously completed set within the same session**: the latest value is what persists; volume and PR detection use the final state at finish.
- **Two sessions started for the same day**: resuming reuses the existing in-progress session rather than creating a second one; the athlete is not left with duplicate sessions for one day.
- **Archived exercise still on the day's plan**: it is shown marked as archived but can still be logged against.
- **Weight or reps of zero / blank on a set marked complete**: a set cannot be completed without a valid weight and rep count; completion is blocked with a clear prompt.
- **Device audio unavailable**: rest-timer cues degrade silently to the visual countdown; no logging is affected.
- **App closed mid-session and reopened much later**: the in-progress session is still resumable; the elapsed timer reflects real elapsed time from the recorded start.
- **A "PR" set that was never marked complete**: incomplete sets cannot trigger PR detection.

## Requirements _(mandatory)_

### Functional Requirements

#### Session start & today detection

- **FR-001**: System MUST determine today's due session from the athlete's configured weekly schedule (not a hardcoded 7-day map) and offer to start that day's session.
- **FR-002**: When today is a rest day or no session is scheduled, the system MUST let the athlete start a session for any chosen training day rather than blocking logging.
- **FR-003**: Starting a session MUST record its start time and load the chosen day's planned exercises in their configured order.

#### Per-set logging

- **FR-004**: The screen MUST present the day's exercises with a single focused exercise at a time, showing that exercise's previous weight used and a suggested target weight.
- **FR-005**: The suggested target weight MUST reuse the progression-based load recommendation — last completed weight plus the engine `load_increment` when the exercise has an active `add_load` flag, otherwise the last weight used; with a neutral state when no history exists.
- **FR-006**: For each set the athlete MUST be able to enter a weight in kg, with quick +2.5 / −2.5 adjustment controls.
- **FR-007**: For each set the athlete MUST be able to enter a rep count, with quick +1 / −1 adjustment controls.
- **FR-008**: Each set MUST accept an optional RPE value from 1 to 10; omitting it is allowed.
- **FR-009**: Each set MUST have a completion control; a set MUST NOT be completable without a valid (non-zero) weight and rep count.
- **FR-010**: Completed sets MUST be recorded against the current session and the focused exercise, preserving set order per exercise.
- **FR-011**: The athlete MUST be able to edit a set already entered in the current session; the final value at finish is the one that persists.
- **FR-011a**: The athlete MUST be able to add or remove sets beyond the planned target set count for any exercise, and MUST be able to log an exercise that is not on the day's plan (an ad-hoc exercise). The plan seeds the session's exercises and target sets but does not cap what can be logged.

#### Session & rest timers

- **FR-012**: The screen MUST display a live session timer that shows continuously increasing elapsed time from the session start.
- **FR-013**: Completing a set MUST auto-start a rest timer that counts down from the rest interval configured on the athlete's current training phase.
- **FR-014**: The rest timer MUST emit an audio cue near the end of the countdown and again at zero.
- **FR-015**: The athlete MUST be able to skip or adjust an active rest countdown for a single rest without changing the phase's default interval.
- **FR-016**: When device audio is unavailable, the countdown MUST still complete visually and MUST NOT affect logging.

#### Auto-save & resume

- **FR-017**: The system MUST persist the in-progress session and its entered sets automatically in the background at a recurring interval (approximately every 30 seconds), without an explicit save action.
- **FR-018**: Auto-save MUST NOT mark the session finished; only an explicit finish closes the session.
- **FR-019**: When the athlete returns to the Session Journal with an in-progress session started **today**, the system MUST resume that session with all prior sets intact rather than creating a new one.
- **FR-019a**: When the only in-progress session was started on a **previous day**, the system MUST prompt the athlete to either resume it or discard it, and MUST NOT silently auto-resume, auto-close, or auto-delete it. Discarding removes that unfinished session and its sets; resuming continues it.
- **FR-020**: Resuming and continuing a session MUST append new sets to the existing session without duplicating earlier sets, and MUST NOT create a duplicate session for the same day.

#### Post-session summary & completion

- **FR-021**: The post-session summary MUST show the total session duration and the total volume lifted, computed as the sum of weight × reps over completed sets only.
- **FR-022**: The summary MUST highlight a top performance for the session, defined as the single completed set with the highest weight (ties broken by the higher rep count).
- **FR-023**: The summary MUST detect and flag new personal records — completed sets exceeding the athlete's previous all-time heaviest completed set for that exercise and/or producing a new highest estimated 1RM — from completed sets only.
- **FR-024**: The summary MUST let the athlete record a general note and an energy rating from 1 to 5, both saved with the session.
- **FR-025**: Finishing a session MUST mark it ended and MUST trigger the existing engine work — progression-flag re-evaluation, 1RM record capture, and the calculation audit log — for the exercises performed.
- **FR-025a**: On finish, sets that were entered but never marked complete MUST be discarded (not persisted); only completed sets are written to the session record.
- **FR-026**: After a session is finished, the history-derived surfaces in Phase 3 (last weight, recent sessions, estimated 1RM, progression indicator) MUST reflect the newly logged session.

#### Cross-cutting

- **FR-027**: All session data MUST be scoped to the current athlete; no cross-athlete session data may be read or written.
- **FR-028**: All volume, top-performance, PR, and downstream-history figures MUST ignore incomplete sets and compute from completed sets only.
- **FR-029**: The Session Journal is the sole owner of the session write path; Phase 3 surfaces remain read-only over the data this phase produces.

### Key Entities _(include if feature involves data)_

- **Session journal entry** _(existing, written here)_: one training session for an athlete — start time, end time, total volume, energy rating, note. Phase 4 creates and finishes these; Phase 3 reads them.
- **Session set** _(existing, written here)_: a single logged set within a session — exercise, set order, weight, reps, optional RPE, completion flag. Phase 4 captures these; Phase 3 derives last-weight and recent-session history from the completed ones.
- **Weekly plan slot / weekly plan exercise** _(existing, read-only here)_: the configured day assignment and the ordered exercises with target sets and rep range that the journal loads when a session starts.
- **Training phase** _(existing, read-only here)_: supplies the rest interval that the rest timer counts down from, per the athlete's current phase.
- **Progression flag** _(existing, read + updated on finish)_: read to compute the suggested target; re-evaluated by the engine when a session is finished.
- **1RM record / estimate** _(existing, written on finish)_: captured/updated by the engine on session completion and surfaced by Phase 3 and the summary.
- **Calculation audit record** _(existing, written on finish)_: the audit-log row appended by the engine for the progression/1RM work triggered at finish.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: On a configured training day, the athlete can go from opening the Session Journal to logging their first completed set in no more than two interactions (start session → complete set), with the correct day's exercises pre-loaded.
- **SC-002**: An athlete can record a full set — weight, reps, optional RPE, completion — using only the quick-adjust controls, with no manual keyboard entry required for typical 2.5 kg / 1-rep increments.
- **SC-003**: 100% of completed sets logged in a session are retrievable as session history after finish, and feed the Phase 3 last-weight, recent-sessions, estimated-1RM, and progression surfaces with no contradiction between screens.
- **SC-004**: An in-progress session survives leaving and returning to the screen (or a reload) with 100% of previously logged sets intact and exactly one **in-progress** session at a time — no duplicate active session and no lost sets. (Additional *finished* sessions on the same day are allowed per FR-002/FR-011a.)
- **SC-005**: The rest timer auto-starts within the same interaction as completing a set and signals at the near-end and zero points; with audio unavailable the visual countdown still completes 100% of the time without affecting logging.
- **SC-006**: The post-session summary reports duration and total volume that exactly match the completed sets logged, and flags every set that beat the exercise's prior best as a PR with zero false positives from incomplete sets.
- **SC-007**: Finishing a session refreshes the affected exercises' progression indicator and estimated 1RM, so a load increase earned in the session is visible on the relevant Phase 3 screens on next view.

## Assumptions

- **Schedule and plan are reused, not rebuilt**: the configured weekly schedule, day assignments, ordered exercises, and per-exercise target sets/rep range already exist from Phase 2/3. Phase 4 reads them to drive the session and does not re-specify scheduling.
- **Suggested target reuses Phase 3 logic**: the per-exercise target weight is the same progression-based load recommendation Phase 3 surfaces (last weight ± `load_increment` keyed on the `add_load` flag), not a new formula.
- **Rest interval comes from the current training phase**: the 90s / 120s / 150s defaults referenced in the roadmap are read from the athlete's current phase configuration; the athlete may override a single rest without changing that default.
- **PR definition**: a PR is a completed set beating the athlete's previous all-time heaviest completed set for that exercise and/or yielding a new highest estimated 1RM; detection uses completed sets only.
- **Completion is what triggers the engine**: progression re-evaluation, 1RM record capture, and audit logging run on explicit session finish — consistent with Phase 1's "runs after every logged session" rule — not on every mid-session auto-save.
- **Estimated 1RM source**: the estimate reuses the existing Phase 1 calculator engine (the Epley/Brzycki/Lander/Lombardi blend, `primary_estimate_kg`); Phase 4 does not introduce a new 1RM formula.
- **Audio via standard web audio**: rest-timer cues use the browser's standard audio capability and degrade silently when muted or unsupported.
- **Single athlete / single locale for now**: consistent with the rest of the app, the journal operates for the current athlete in a single locale.
- **No AI**: targets, summaries, and PR detection come from logged data and deterministic engine output, consistent with the project's no-AI-until-later boundary.

## Dependencies

- **Phase 1 (Calculators Engine)**: provides the progression-flag re-evaluation, 1RM estimate/record, and audit log triggered on session finish, and the `load_increment` used for the suggested target.
- **Phase 2 (Settings & Data Management)**: provides the editable weekly schedule, muscle groups, training-phase rest intervals, and exercise data the journal reads.
- **Phase 3 (Training Program & Exercise Library)**: the read layer that consumes the history this phase writes; the suggested-target and progression logic are shared with Phase 3.
- **Existing session tables**: `session_journal_entries` and `session_sets` already exist (created in Phase 0) and are the write targets for this phase.
