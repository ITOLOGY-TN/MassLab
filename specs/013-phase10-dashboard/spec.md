# Feature Specification: Dashboard

**Feature Branch**: `013-phase10-dashboard`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 10: Dashboard ONLY."

## Overview

Phase 10 is the **home screen** — the first thing the athlete sees when they open the app, giving them a complete picture of their day in one glance. It answers, without scrolling or navigating, the questions an athlete has before a session: *What am I training today and have I done it? Am I on track? Is anything wrong I should act on?*

The dashboard assembles six things the athlete already owns, produced by earlier phases, into a single at-a-glance view:

1. **Today's session card** — today's muscle group, the first three exercises, and a call-to-action to start (or resume / mark-done) the session.
2. **Four quick metric cards** — current weight vs. start, yesterday's calories vs. target, the consecutive-session streak, and the current training phase with days remaining.
3. **A 30-day weight sparkline** with the goal line.
4. **Smart alerts** — at most three at a time, prioritized — surfacing the most important things needing attention (e.g., ready to add load, calorie deficit, no session in a while, creatine streak broken, low sleep + high stress).
5. **Quote of the day** — a motivational quote that rotates daily.
6. **A compact 7-day week overview** — each day marked session-done / to-do / rest.

This phase is **purely read-only aggregation**: it introduces **no new data the athlete enters** and **no new persistence** of its own. It composes existing athlete-scoped data and the outputs already defined by earlier modules — training schedule and today's session (Phase 3/4), body weight and goal (Phase 6), nutrition targets and logs (Phase 7), supplement streaks (Phase 8), recovery signals (Phase 9), progression flags (Phase 5), training phases (Phase 1/4), and the seeded quotes (Phase 0). It **never writes** anything, **never re-runs** the calculators or progression engine, and surfaces each module's existing numbers and alerts rather than inventing new ones. The single action it offers — "start the session" — hands off to the existing session journal; the dashboard itself only reads.

## Clarifications

### Session 2026-06-03

- Q: When more than 3 smart alerts fire at once, what priority order decides which 3 are shown? → A: A fixed health-and-consistency-first order: (1) low sleep + high stress, (2) no session in X days, (3) calorie deficit, (4) ready to add load, (5) creatine streak broken.
- Q: When should the "no session logged in a while" alert fire? → A: Schedule-aware — after **2 or more consecutive elapsed *scheduled training* days** with no completed session (configured rest days never trigger it); the threshold is configurable.
- Q: Is the dashboard's alert set fixed to the five PLAN alerts for this phase, or broader? → A: Exactly these five (ready-to-add-load, calorie deficit, no-session, creatine-streak-broken, low-sleep+high-stress); additional alert types are a later change, though the design may be written to extend later.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Start today's session from the home screen (Priority: P1)

The athlete opens the app and immediately sees today's session: its muscle group, the first three exercises, and a button to start it. A compact 7-day strip shows the week at a glance — which days are done, which are still to do, and which are rest days — so they instantly know where they stand. Tapping the button takes them straight into the session journal.

**Why this priority**: The single most important job of a home screen for a training app is "what do I do right now, and let me start it." An athlete who can only see and launch today's session already gets the core daily value. Everything else on the dashboard is supporting context.

**Independent Test**: Open the dashboard on a configured training day and confirm the card shows the correct muscle group, the first three exercises in order, and a start action that opens that session; confirm the 7-day strip marks each day as done / to-do / rest matching the schedule and logged sessions; on a rest day, confirm the card shows a rest state rather than a session.

**Acceptance Scenarios**:

1. **Given** today is a configured training day with no session logged yet, **When** the dashboard renders, **Then** the today card shows the day's muscle group, its first three exercises in order, and a "start session" action that opens the session journal for that day.
2. **Given** today's session is already finished, **When** the dashboard renders, **Then** the today card reflects a completed state (and offers to review rather than implying the session is undone).
3. **Given** a session for today is already in progress, **When** the dashboard renders, **Then** the today card offers to resume it.
4. **Given** today is a configured rest day, **When** the dashboard renders, **Then** the today card shows a rest state and no "start session" action.
5. **Given** the current week, **When** the 7-day overview renders, **Then** each day is marked session-done, to-do, or rest consistent with the athlete's schedule and logged sessions, with future training days shown as to-do (never as missed).

---

### User Story 2 - See progress at a glance (Priority: P2)

The athlete glances at four metric cards and a weight sparkline to gauge whether they are on track: how their weight compares to their starting point, whether yesterday's eating hit the target, how many sessions they've strung together, and which training phase they're in with how long is left. The 30-day weight curve with its goal line shows the trajectory.

**Why this priority**: These summaries turn scattered module data into an instant "am I progressing?" read, which is the dashboard's second job after "what's today." They depend on data from several modules but add high motivational value, ranking just below the actionable today card.

**Independent Test**: With weight, nutrition, session, and phase data present, confirm each card shows the correct derived value (weight delta vs. start, yesterday's logged calories vs. the resolved target, the consecutive-session streak, and the active phase with days remaining) and that the sparkline plots the last 30 days of weight with the goal line; with missing data, confirm each card shows a clear empty/placeholder state.

**Acceptance Scenarios**:

1. **Given** a recorded starting weight and a latest weight, **When** the weight card renders, **Then** it shows the current weight and the signed delta versus the start.
2. **Given** nutrition logged for yesterday and a resolved daily calorie target, **When** the calories card renders, **Then** it shows yesterday's total calories against that target (over/under).
3. **Given** a history of completed scheduled sessions, **When** the streak card renders, **Then** it shows the count of consecutive scheduled training days the athlete completed, ending at the most recent applicable day.
4. **Given** an active training phase, **When** the phase card renders, **Then** it shows the current phase and the number of days remaining in it.
5. **Given** at least one weight entry in the last 30 days, **When** the sparkline renders, **Then** it plots the 30-day weight series with the goal line; with no weight data, it shows a clear empty state.

---

### User Story 3 - Act on smart alerts (Priority: P2)

The dashboard surfaces at most three smart alerts at a time — the most important things needing attention right now — drawn from across the app: an exercise ready for more load, a calorie deficit, no session logged in a while, a broken creatine streak, or low sleep combined with high stress. Each alert is concise and points the athlete at what to do, without overwhelming them.

**Why this priority**: Alerts are the dashboard's "what needs my attention" job — high value, but a layer on top of the underlying module data and capped so the home screen stays calm. They rank alongside the metrics as important-but-supporting.

**Independent Test**: Seed conditions that trigger more than three alert types and confirm exactly the three highest-priority alerts show, in priority order; seed a healthy state and confirm no alerts show; confirm each alert's text reflects the underlying condition and that opening an alert leads to the relevant area, with the dashboard itself changing nothing.

**Acceptance Scenarios**:

1. **Given** one or more alert conditions hold (ready to add load, calorie deficit, no recent session, creatine streak broken, low sleep + high stress), **When** the dashboard renders, **Then** it shows those alerts up to a maximum of three, ordered by priority.
2. **Given** more than three alert conditions hold at once, **When** the dashboard renders, **Then** only the three highest-priority alerts are shown and the rest are omitted.
3. **Given** no alert conditions hold, **When** the dashboard renders, **Then** the alerts area shows a calm "all clear" / empty state without error.
4. **Given** an alert is shown, **When** the athlete views it, **Then** its message reflects the real underlying condition (e.g., the specific exercise, the calorie gap, the days since the last session), and acting on it navigates to the relevant module.
5. **Given** any alerts are shown, **When** the dashboard renders them, **Then** the dashboard makes no change to any persisted data, training plan, or module state as a result.

---

### User Story 4 - Daily motivation (Priority: P3)

The athlete sees a motivational quote of the day that changes each day, adding a small lift to opening the app.

**Why this priority**: A nice-to-have flourish that reinforces the daily-open habit but carries no functional weight; the lowest-priority slice.

**Independent Test**: Confirm a quote renders on the dashboard, that it is stable for the whole of a given day, and that it changes the next day; with no quotes available, confirm the area is simply absent or shows a graceful placeholder.

**Acceptance Scenarios**:

1. **Given** the seeded quotes exist, **When** the dashboard renders, **Then** it shows a single quote of the day.
2. **Given** the same calendar day, **When** the dashboard is reloaded, **Then** the same quote is shown (stable within the day).
3. **Given** the day rolls over to the next day, **When** the dashboard renders, **Then** a different quote is shown (rotates daily).
4. **Given** no quotes are available, **When** the dashboard renders, **Then** the quote area is gracefully absent without error.

---

### Edge Cases

- **Cold start / brand-new athlete**: With no logged sessions, weight, nutrition, supplements, or recovery yet, every card, sparkline, alert area, and the week strip render a clear empty/onboarding-friendly state rather than errors or misleading zeros.
- **Rest day**: On a configured rest day the today card shows a rest state and no start action; the streak and week strip treat rest days correctly (a rest day never counts as a missed session).
- **Schedule changes**: If the athlete reconfigures which days are training vs. rest, the today card, week strip, and streak reflect the new schedule immediately.
- **Day rollover**: "Today", "yesterday", and the daily quote follow the server calendar day; opening the app late at night still attributes to the intended day and the quote stays stable until the day rolls over.
- **Missing module data**: If a single source has no data (e.g., no weight logged), only that card/sparkline shows its empty state; the rest of the dashboard still renders.
- **More than three alerts**: Only the three highest-priority alerts are shown, by the fixed order (low sleep + high stress → no session → calorie deficit → ready to add load → creatine streak broken); the dashboard never floods the screen.
- **No alerts**: The alerts area shows a calm "all clear" state, not a blank gap.
- **Future days in the week strip**: Future training days appear as to-do, never as missed; missed is retrospective only.
- **Calorie target source**: The calories card compares against the athlete's *resolved* daily target (which varies per athlete), not a hardcoded number.

## Requirements _(mandatory)_

### Functional Requirements

**Today's session & week overview (Story 1)**

- **FR-001**: The dashboard MUST show a "today" card that, on a configured training day, presents the day's muscle group, the first three exercises in their planned order, and an action to start the session.
- **FR-002**: The "today" card's primary action MUST reflect the session's state — start when not begun, resume when a session is in progress, and a completed/review state when today's session is already finished — and starting/resuming MUST hand off to the existing session journal.
- **FR-003**: On a configured rest day, the "today" card MUST show a rest state and MUST NOT offer a "start session" action.
- **FR-004**: The dashboard MUST show a compact 7-day overview of the current week in which each day is marked session-done, to-do, or rest, consistent with the athlete's configured schedule and logged sessions, with future training days shown as to-do (never missed).

**Quick metrics & sparkline (Story 2)**

- **FR-005**: The dashboard MUST show a weight card with the athlete's current weight and the signed change versus their starting weight.
- **FR-006**: The dashboard MUST show a calories card comparing yesterday's total logged calories to the athlete's resolved daily calorie target (indicating over/under).
- **FR-007**: The dashboard MUST show a streak card with the count of consecutive scheduled training days the athlete completed, ending at the most recent applicable day.
- **FR-008**: The dashboard MUST show a phase card with the current training phase and the number of days remaining in it.
- **FR-009**: The dashboard MUST show a 30-day weight sparkline including the goal line; with no weight data in the window it MUST show a clear empty state.

**Smart alerts (Story 3)**

- **FR-010**: The dashboard MUST surface smart alerts drawn from across the app, limited to exactly these five condition types: an exercise ready for more load, a calorie deficit, no session logged for too long, a broken creatine (primary-supplement) streak, and low sleep combined with high stress. The "no session logged" alert MUST be **schedule-aware** — it fires after **2 or more consecutive elapsed scheduled training days** with no completed session (configured rest days never trigger it), with the threshold configurable.
- **FR-011**: The dashboard MUST show at most three alerts at a time, and when more than three conditions hold it MUST show only the three highest-priority alerts in this fixed priority order: (1) low sleep + high stress, (2) no session in the configured window, (3) calorie deficit, (4) ready to add load, (5) creatine streak broken.
- **FR-012**: Each alert MUST reflect the real underlying condition (the specific exercise, the calorie gap, the days since the last session, etc.) and MUST link to the relevant area of the app.
- **FR-013**: When no alert conditions hold, the dashboard MUST show a calm "all clear"/empty state without error.
- **FR-014**: The dashboard MUST treat alerts as advisory only and MUST NOT alter any persisted data, training plan, or module state as a result of displaying them.

**Quote of the day (Story 4)**

- **FR-015**: The dashboard MUST show a single quote of the day that is stable for the whole of a given calendar day and changes the next day; with no quotes available, the quote area MUST be gracefully absent without error.

**Cross-cutting**

- **FR-016**: The dashboard MUST be read-only: it MUST NOT create, update, or delete any athlete data, MUST NOT re-run the calculators or progression engine, and MUST NOT write an audit/calculation record as a result of being viewed.
- **FR-017**: Every value, card, alert, and list on the dashboard MUST be scoped to the owning athlete and MUST NOT expose another athlete's data.
- **FR-018**: The dashboard MUST render a clear empty/cold-start state for any element whose source data is missing, and the overall screen MUST still render when any single source has no data.
- **FR-019**: The dashboard MUST resolve "today", "yesterday", and the daily quote by the server calendar day (consistent with the app's existing day convention), and the current week by the app's existing ISO-week/weekday convention.

### Key Entities _(include if feature involves data)_

> The dashboard introduces no new stored entity. It is a composed read over existing athlete-scoped data; the items below are the **read inputs** it aggregates.

- **Today's session view**: The current day's muscle group, ordered exercises (first three surfaced), and the session's state (not started / in progress / finished / rest). Derived from the configured weekly schedule and the session journal.
- **Quick metric**: A single summarized number with context — weight vs. start, yesterday's calories vs. target, consecutive-session streak, current phase + days remaining. Each derived from its owning module (body weight, nutrition, sessions, training phases).
- **Weight series (30-day)**: The athlete's recent weight entries plus the goal weight, for the sparkline.
- **Smart alert**: A derived, non-persisted advisory item with a type, a message reflecting the underlying condition, a priority, and a link target. Sourced from existing module signals (progression flags, nutrition, sessions, supplement streaks, recovery).
- **Quote of the day**: One motivational quote selected deterministically for the current calendar day from the seeded quotes.
- **Week day cell**: One day of the current week with a status of session-done / to-do / rest.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From opening the app, the athlete can identify today's session (muscle group + first exercises) and start it in a single tap, without navigating away first.
- **SC-002**: The today card's state (start / resume / completed / rest) always matches the actual session state and schedule for the current day.
- **SC-003**: The 7-day overview correctly marks every day as done / to-do / rest for any schedule and session history, with future training days never shown as missed.
- **SC-004**: Each of the four metric cards shows the correct derived value for the athlete's data (weight delta vs. start, yesterday's calories vs. resolved target, consecutive-session streak, current phase + days remaining).
- **SC-005**: The weight sparkline plots the last 30 days of weight with the goal line, and shows a clear empty state when no weight data exists.
- **SC-006**: At most three alerts are ever shown; when more than three of the five conditions hold, exactly the three highest-priority appear in the fixed order (low sleep + high stress → no session → calorie deficit → ready to add load → creatine streak broken), and each reflects its real underlying condition.
- **SC-007**: When no alert conditions hold, the dashboard shows a calm "all clear" state rather than a blank or error.
- **SC-008**: The quote of the day is identical across reloads within a calendar day and differs the next day.
- **SC-009**: A brand-new athlete with no logged data sees a fully rendered dashboard with graceful empty states everywhere and no errors.
- **SC-010**: Viewing the dashboard never changes any stored data and never produces a calculation/audit record (verifiable: data is identical before and after viewing).
- **SC-011**: No athlete can see another athlete's dashboard data.

## Assumptions

- **Read-only aggregation, no new persistence**: Like Phase 5's load-tracking layer, Phase 10 adds **no new tables and no migrations**. It reads existing athlete-scoped data and recomposes it; it never writes, never re-runs the calculators/progression engine, and writes no audit/calculation record (consistent with the project's no-side-effect read boundary).
- **Sources already exist**: Every dashboard element maps to data an earlier phase already produces — today's session and schedule (Phase 3/4), the session streak and current phase (Phase 4 / training phases), weight + goal + 30-day series (Phase 6), the resolved daily calorie target and yesterday's logged calories (Phase 7), the creatine/primary-supplement streak (Phase 8), recovery sleep/stress signals (Phase 9), exercise "ready to add load" progression flags (Phase 5), and the seeded quotes (Phase 0). The dashboard surfaces these existing numbers rather than recomputing them.
- **Alert set and priority order** (per the 2026-06-03 clarifications): The dashboard surfaces **exactly the five** alert conditions named in PLAN — ready-to-add-load, calorie deficit, no-session, creatine-streak-broken, and low-sleep+high-stress (additional types are a later change). When more than three hold, a **fixed priority order** decides which three show: (1) low sleep + high stress, (2) no session in the configured window, (3) calorie deficit, (4) ready to add load, (5) creatine streak broken. The "no session" alert is **schedule-aware**, firing after **2+ consecutive elapsed scheduled training days** with no completed session (rest days never trigger it). The thresholds (the missed-scheduled-day count, the calorie-deficit margin, the sleep/stress cut-offs) are configuration with sensible defaults, not hardcoded magic numbers; the priority order is fixed.
- **Calorie target is resolved per athlete**: The calories card compares yesterday's logged calories against the athlete's *resolved* daily target (which varies per athlete), not the example "3300 kcal" figure from PLAN (that was the current athlete's number).
- **Streak definition**: The consecutive-session streak counts scheduled training days the athlete completed, in a row, ending at the most recent applicable day; rest days do not break it, and a future scheduled day not yet reached does not count as missed — consistent with how streaks/missed are treated elsewhere (retrospective-only "missed").
- **Quote rotation is deterministic**: The quote of the day is chosen deterministically from the seeded quotes by the calendar day, so it is stable within a day and rotates daily (no randomness that would change on reload).
- **Day/week conventions**: "Today"/"yesterday" and the daily quote follow the **server calendar day (UTC)** and the current week follows the app's existing **ISO-week/weekday** convention (Phase 4/8/9), so boundaries reset cleanly.
- **The only action is "start the session"**: The dashboard's single interactive affordance hands off to the existing session-journal start flow; the dashboard does not itself create or modify a session. All other elements are read-only displays or navigational links into existing modules.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but every dashboard read remains athlete-scoped so the screen works unchanged when multiple users exist.
- **Scope boundary**: This specification covers Phase 10 only — the composed home-screen view (today card, four metric cards, 30-day weight sparkline, up-to-three smart alerts, quote of the day, 7-day week overview). It explicitly excludes the full statistics/PDF module (Phase 11), any new data entry, any change to the underlying modules' own screens or logic, and the AI coaching layer (Phase 12). Where the dashboard surfaces a module's data, the authoritative computation stays in that module.
