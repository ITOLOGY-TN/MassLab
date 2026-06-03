# Feature Specification: Load Tracking & Progression Algorithm

**Feature Branch**: `008-load-tracking`  
**Created**: 2026-06-02  
**Status**: Draft  
**Input**: User description: "Phase 5: Load Tracking & Progression Algorithm — per-exercise overview table with progression status, per-exercise detail charts (load/volume/1RM/projection), and phase-comparison radar"

## Overview

Phase 5 is the **expert muscle-building module**: it tells the athlete, exercise by exercise, exactly where they stand and when to add weight. It is a **read-and-visualize layer** over data the earlier phases already produce — it introduces no new training capture and no new training math:

- **Phase 4 (Session Journal)** writes the session/set history and, on every session finish, runs the deterministic progression engine that persists a current **progression status** per exercise and per muscle group, plus a fresh estimated-1RM record.
- **Phase 1 (Calculators Engine)** owns the progression rules (double progression, regression, stagnation, deload) and the 1RM estimate. Phase 5 **surfaces** that output; it does not recompute the rules.
- **Phase 3** already established the "last weight used" / estimated-1RM read conventions, which Phase 5 reuses so numbers never disagree between screens.

Phase 5 delivers three surfaces:

1. A **progression overview table** — every exercise with its current load, all-time record, last-session volume, trend, and a colour-coded progression status (ready to add load / maintain / stagnation / regression), so the athlete sees their whole program's state at a glance.
2. A **per-exercise progression detail** — load-over-time and volume-per-session charts, the last 10 sessions, the estimated 1RM with its all-time record, and a forward 8-week projection.
3. A **phase-comparison radar** — average working load per muscle group across the athlete's training phases, to see how each block moved the needle.

Everything is computed from already-logged sessions and the already-persisted progression flags; where history is thin, each surface shows a clear empty or "not enough data yet" state rather than failing.

## Clarifications

### Session 2026-06-02

- Q: Which metric drives the per-exercise trend indicator and the 8-week projection? → A: The per-session **estimated 1RM** over the recent window (~last 30 days); the projection extrapolates that 1RM series (rep-range-robust, matches the engine's monthly-1RM-trend notion). Working load and volume are shown elsewhere but do not drive the trend/projection.
- Q: How is the 8-week projection computed? → A: A **least-squares linear fit** over the exercise's recent estimated-1RM points (requires **≥ 3** sessions), extended 8 weeks forward; drawn dotted and labelled, omitted when fewer than 3 points exist.
- Q: What does "all-time record" mean? → A: The **heaviest completed set** (max weight ever lifted, completed) for the exercise — a concrete figure annotated on the load chart, separate from the estimated 1RM shown alongside.
- Q: What does the phase-comparison radar measure per muscle group, per phase? → A: The **average of each session's top working load (kg)** for the muscle group across that phase (one kg value per radar axis).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See every exercise's progression status at a glance (Priority: P1)

The athlete opens Load Tracking and sees one row per exercise: its current working load, its all-time record, the volume of its last session, a trend indicator, and a clear colour-coded status telling them whether to add weight, hold, push through a plateau, or address a regression. From this single screen they know, across their whole program, which lifts are ready to progress and which need attention.

**Why this priority**: This is the core promise of the module — "tell me exactly when to add weight" — and it is viable on its own: even with no charts and no radar, a correct status-and-load overview delivers the expert guidance the athlete comes here for. It validates that the progression flags written on session finish read back correctly.

**Independent Test**: With session history logged, open the overview and confirm every exercise appears with its current load, all-time record, last-session volume, a trend indicator, and a status badge that matches the athlete's current progression flag for that exercise; exercises with no history show a neutral "no data yet" row.

**Acceptance Scenarios**:

1. **Given** exercises with logged history, **When** the overview loads, **Then** each exercise row shows its current load, all-time record, last-session volume, a trend indicator, and a progression status badge.
2. **Given** an exercise whose active flag indicates it is ready to progress, **When** its row renders, **Then** it shows the 🟢 "Add +N kg" status with the recommended increment.
3. **Given** an exercise on normal progression, **When** its row renders, **Then** it shows the 🟡 "Maintain" status.
4. **Given** an exercise whose muscle group's weekly volume has been flat for the stagnation window, **When** its row renders and the exercise is not itself adding load or regressing, **Then** it shows the 🟠 "Stagnation" status.
5. **Given** an exercise whose load is lower than it was two weeks ago, **When** its row renders, **Then** it shows the 🔴 "Regression" status.
6. **Given** an exercise with no logged history, **When** its row renders, **Then** load / record / volume / trend show a neutral empty state and the status is neutral.
7. **Given** a muscle group with an active deload suggestion, **When** the overview renders, **Then** a muscle-group-level deload notice is surfaced distinctly from the per-exercise status badges.

---

### User Story 2 - Drill into one exercise's progression over time (Priority: P2)

The athlete taps an exercise and sees its full progression history: a line chart of working load over time, a bar chart of volume per session, a table of the last 10 sessions, the current estimated 1RM annotated with the all-time record, and a dotted 8-week projection extending the recent trend so they can see whether they are on pace.

**Why this priority**: This is where the athlete diagnoses a specific lift — confirming a plateau, celebrating a record, or judging their trajectory. It builds on US1 (reached from a row) and is the richest visualization, so it follows the overview.

**Independent Test**: Open an exercise with several logged sessions and confirm the load line chart, the volume bar chart, the last-10-sessions table, the estimated 1RM with all-time record annotation, and the dotted 8-week projection all render from that exercise's history; an exercise with too little history shows the static parts and a clear "not enough data to chart/project" state for the rest.

**Acceptance Scenarios**:

1. **Given** an exercise with multiple logged sessions, **When** its detail opens, **Then** a load-over-time line chart and a volume-per-session bar chart render from its session history.
2. **Given** the same exercise, **When** the detail opens, **Then** a table of up to its last 10 sessions is shown with date, working load, reps, and session volume.
3. **Given** the exercise has at least one qualifying record, **When** the detail opens, **Then** the current estimated 1RM is shown and the all-time record is annotated on the chart.
4. **Given** the exercise has enough history to establish a trend, **When** the detail opens, **Then** an 8-week forward projection is drawn as a clearly-labelled dotted extension of the recent trend.
5. **Given** an exercise with too few logged sessions to chart or project, **When** the detail opens, **Then** the charts/projection show a clear "not enough data yet" state while any available static content still renders.

---

### User Story 3 - Compare muscle-group load across training phases (Priority: P3)

The athlete views a radar chart comparing the average working load per muscle group across their training phases, so they can see how each block (e.g. foundation vs hypertrophy vs strength) moved each muscle group and where a phase under- or over-delivered.

**Why this priority**: It is a high-level, cross-phase insight that is valuable but secondary to per-exercise guidance, and it only becomes meaningful once at least two phases have logged data — so it ships last.

**Independent Test**: With logged sessions spanning at least two training phases, open the phase comparison and confirm a radar chart shows average working load per muscle group with one series per phase; with fewer than two phases of data it shows a clear "needs more than one phase of data" state.

**Acceptance Scenarios**:

1. **Given** logged sessions spanning two or more training phases, **When** the phase comparison renders, **Then** a radar chart shows average working load per muscle group with one overlaid series per phase.
2. **Given** a muscle group with no logged work in a given phase, **When** the radar renders, **Then** that muscle group reads as zero/absent for that phase without breaking the chart.
3. **Given** fewer than two phases have logged data, **When** the phase comparison is opened, **Then** a clear "not enough phases to compare yet" state is shown.

---

### Edge Cases

- **No history at all** (Phase 4 not yet used): the overview lists exercises with neutral empty rows and no status; detail and radar show empty states. The screen never fails.
- **Exercise-level and muscle-group-level signals disagree** (e.g. an exercise is ready to add load while its muscle group is stagnating): the per-exercise status reflects the exercise's own state first; muscle-group stagnation only colours an exercise that is otherwise "maintain". Deload is surfaced at the muscle-group level, never as one of the four per-exercise badges.
- **Archived exercise with historical data**: it still appears (marked archived) so its history and records remain visible.
- **Same exercise on multiple days**: status, records, and history are computed per exercise (not per day), so they read consistently.
- **Sets with missing/invalid weight or reps, or incomplete sets**: excluded from all loads, volumes, records, trends, and projections (completed sets only).
- **Insufficient data for a trend or projection**: the trend reads "—"/flat and the projection is omitted with a clear note, rather than extrapolating from one point.
- **A flag that is stale relative to the latest session** (engine last ran before the most recent finish): the status reflects the most recently persisted flag; Phase 5 does not recompute. (Phase 4 re-runs the engine on every finish, so this is rare.)
- **Phase boundaries**: a session is attributed to the training phase whose date range contains its start, derived from the program start date and each phase's configured length.

## Requirements _(mandatory)_

### Functional Requirements

#### Progression overview (US1)

- **FR-001**: The system MUST present one row per exercise showing the current working load, the all-time record, the last logged session's volume for that exercise, a trend indicator, and a progression status.
- **FR-002**: The progression status MUST be one of four states — 🟢 ready to add load (with the recommended increment), 🟡 maintain, 🟠 stagnation, 🔴 regression — derived from the athlete's currently persisted progression flags (not recomputed in this phase).
- **FR-003**: The status MUST be resolved per exercise as follows: the exercise's own active flag takes precedence (ready-to-add-load or regression); when the exercise has no actionable own flag, its muscle group's stagnation flag yields the stagnation status; otherwise the status is maintain.
- **FR-004**: An active **deload** suggestion MUST be surfaced at the muscle-group level, visually distinct from the four per-exercise status badges.
- **FR-005**: "Current working load" MUST use the same definition as the rest of the app — the heaviest completed set in the most recent session containing the exercise — and show a neutral empty state when no history exists.
- **FR-006**: "All-time record" MUST be the **heaviest completed set** (max weight ever lifted, completed) for the exercise across all history, with a neutral empty state when none exists. It is shown as a separate figure from the estimated 1RM.
- **FR-007**: "Last session volume" MUST be the sum of weight × reps over the completed sets of the most recent session containing the exercise.
- **FR-008**: The trend indicator MUST show the direction (improving / flat / declining) of the exercise's **estimated-1RM** change over the **last 30 days** — classified `flat` when the absolute change is **≤ 1%**, else up/down — with a neutral state when fewer than 2 in-window points exist. Working load and volume are not the trend basis.
- **FR-009**: Selecting an exercise row MUST navigate to that exercise's progression detail.
- **FR-010**: All overview figures MUST be computed from completed sets only; incomplete or invalid sets are ignored.

#### Per-exercise progression detail (US2)

- **FR-011**: The detail MUST show an **estimated-1RM-over-time line chart** across the exercise's logged sessions — this is the line the 8-week projection extends (FR-015) — with the per-session **working load shown as a secondary line** and the all-time record marked as a working-load reference.
- **FR-012**: The detail MUST show a volume-per-session chart (weight × reps summed per session) across its logged sessions.
- **FR-013**: The detail MUST show a table of up to the last 10 sessions for the exercise, each with date, working load, reps, and session volume.
- **FR-014**: The detail MUST show the current estimated 1RM and MUST annotate the all-time record (heaviest completed set) on the load chart.
- **FR-015**: The detail MUST show a forward 8-week projection of the estimated-1RM trend, computed as a **least-squares linear fit** over the exercise's recent estimated-1RM points and extended 8 weeks, rendered as a clearly-labelled dotted extension **of the estimated-1RM line**. It MUST be shown only when at least **3** qualifying sessions exist; otherwise it is omitted with a clear note.
- **FR-016**: When the exercise has too little history to chart or project, the system MUST show a clear "not enough data yet" state while still rendering any available static content.

#### Phase comparison (US3)

- **FR-017**: The system MUST present a radar chart of **average working load (kg) per muscle group** — the mean of each session's top working load for that muscle group across the phase — with one series per training phase, computed from sessions attributed to each phase.
- **FR-018**: A session MUST be attributed to the training phase whose date range contains the session start, derived from the program start date and each phase's configured length.
- **FR-019**: A muscle group with no logged work in a phase MUST read as zero/absent for that phase without breaking the chart.
- **FR-020**: When fewer than two phases have logged data, the system MUST show a "not enough phases to compare yet" state instead of a chart.

#### Cross-cutting

- **FR-021**: All load-tracking data MUST be scoped to the current athlete; no cross-athlete data may be read.
- **FR-022**: Phase 5 MUST be read-only over training data and progression flags — it surfaces the progression status, records, and history written by earlier phases and does not capture sessions or re-run the progression engine.
- **FR-023**: Estimated 1RM and progression status MUST be consistent with the values the other screens (Session Journal, Training Program) display for the same exercise — no contradictory numbers across screens.

### Key Entities _(include if feature involves data)_

- **Exercise** _(existing, read-only)_: the unit of the overview and detail — name, targeted muscles, muscle group, active/archived state.
- **Session / session set** _(existing, read-only)_: logged history that powers current load, all-time record, volume, charts, trend, and projection (completed sets only). Written by Phase 4.
- **Progression flag** _(existing, read-only)_: the persisted per-exercise and per-muscle-group status (ready-to-add-load / maintain / stagnation / regression / deload) that drives the overview badges. Written by the Phase 1 engine on session finish (Phase 4).
- **1RM record / estimate** _(existing, read-only)_: the estimated 1RM and the basis of the all-time record annotation and trend. Written on session finish.
- **Training phase** _(existing, read-only)_: ordered program blocks with configured lengths; used to bucket sessions for the phase-comparison radar.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From the overview, the athlete can identify every exercise that is ready to add load without opening any detail — 100% of exercises with an active "ready to add load" flag show the 🟢 status with the correct increment.
- **SC-002**: The status badge on the overview matches the athlete's current progression flag for that exercise in 100% of cases, with no contradiction against the Session Journal or Training Program views for the same exercise.
- **SC-003**: Current load, all-time record, and last-session volume are computed from completed sets only, and match the underlying logged sessions exactly (zero discrepancy) for any sampled exercise.
- **SC-004**: The athlete can go from the overview to a specific exercise's progression detail in a single tap, and the detail's charts/table reflect that exercise's logged history with no figure contradicting the overview.
- **SC-005**: Charts, projection, and radar degrade gracefully — for any exercise or phase with insufficient data, a clear "not enough data" state is shown and no screen errors, in 100% of low-data cases.
- **SC-006**: The 8-week projection is shown only when a trend can be established and is visibly distinguished (dotted) from logged data, so the athlete never mistakes a projection for recorded history.
- **SC-007**: The phase-comparison radar correctly attributes each logged session to exactly one training phase by date, and reflects average load per muscle group per phase consistent with the logged history.

## Assumptions

- **Read-only over engine output**: the four progression states come from the already-persisted progression flags (written by the Phase 1 engine on Phase 4 session finish). Phase 5 does not re-run the engine; it reads the current flags, exactly as the Phase 3 day view reads its indicator. If no session has been finished since a relevant change, the most recently persisted flag is shown.
- **Status mapping**: the engine's five flag types map to the four overview badges plus a muscle-group notice — `add_load` → 🟢, `regression` → 🔴, muscle-group `stagnation` → 🟠 (applied to its exercises only when they have no actionable own flag), no actionable flag → 🟡 maintain, and `deload_suggested` → a muscle-group-level deload notice (not one of the four per-exercise badges).
- **Current load & estimated 1RM definitions are reused**, not redefined: "current load" = heaviest completed set in the most recent session (the Phase 3/4 "last weight used"); estimated 1RM = the existing engine estimate. This keeps numbers identical across screens.
- **All-time record** = the heaviest completed set ever logged for the exercise (max weight); the estimated 1RM is shown alongside but is a separate figure.
- **Trend** = the direction and magnitude of change in the exercise's **estimated 1RM** over the **last 30 days**, classified `flat` when |change| ≤ **1%** (a fixed presentation dead-band, distinct from the engine's `on_pace_pct_per_month` "on-pace-for-goal" threshold, which is not used here); shown neutral when fewer than 2 in-window points exist. Working load / volume are not the trend basis.
- **8-week projection** = a deterministic **least-squares linear fit** over the exercise's recent estimated-1RM points, extended 8 weeks; requires **≥ 3** qualifying sessions, drawn dotted and labelled as a projection, omitted otherwise. It is a visualization aid, not a stored prediction, and no AI is used.
- **Phase attribution** = sessions are bucketed into training phases by date, using the program start date and each phase's configured length (the same current-phase derivation used elsewhere). Phases with no logged sessions are simply empty in the radar.
- **Charts are presentation only**: the underlying series (load over time, volume per session, per-phase averages, projection points) are derived deterministically from completed-set history; no new training metric is invented.
- **Single athlete for now**: consistent with the rest of the app, the module operates for the current athlete.

## Dependencies

- **Phase 1 (Calculators Engine)**: owns the progression rules, the five flag types, and the estimated-1RM formula that this phase surfaces.
- **Phase 4 (Session Journal)**: writes the session/set history and, on every finish, runs the engine that persists the progression flags and 1RM records this phase reads. Without logged sessions, Phase 5 shows empty states.
- **Phase 3 (Training Program & Exercise Library)**: established the "last weight used" / estimated-1RM read conventions reused here for cross-screen consistency, and the exercise/muscle-group data the overview groups by.
- **Phase 2 / training phases**: the training-phase definitions (order and length) used to attribute sessions for the phase-comparison radar.
