# Feature Specification: Statistics & Global Progress

**Feature Branch**: `014-phase11-statistics`
**Created**: 2026-06-06
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 11: Statistics & Global Progress ONLY."

## Overview

Phase 11 is the **transformation overview** — the screen the athlete opens to answer one big question: *"How far have I come since I started?"* Where the Dashboard (Phase 10) answers "what about today," Statistics answers "what about the whole journey." It is the long-arc, evidence-of-progress view across the entire program.

It assembles five things the athlete already owns — body data, strength data, attendance, nutrition, and recovery — into a single multi-tab analytics screen, topped by four headline metric cards, and offers a downloadable **monthly PDF report** the athlete can keep or share (e.g., with a coach).

The screen surfaces:

1. **Four headline metric cards** — total weight gained since start, total volume lifted since start, session completion rate, and average weekly calories.
2. **Body tab** — weight curve and body-measurement curves over the whole program.
3. **Strength tab** — the top five exercise progressions, weekly training volume, and a muscle-group radar.
4. **Attendance tab** — a GitHub-style contribution heatmap of training days completed.
5. **Nutrition tab** — weekly calorie trends against the target.
6. **Recovery tab** — sleep averages and a stress-vs-weight correlation view.
7. **Monthly PDF report export** — a generated, downloadable report containing summary stats, the top three load progressions, a weight-progression chart, and deterministic auto-generated recommendations for the next month.

This phase is **purely read-only aggregation and reporting**: like Phase 5 (load-tracking) and Phase 10 (dashboard), it introduces **no new data the athlete enters** and **no new persistence** of its own. It composes existing athlete-scoped data produced by earlier modules — body weight and measurements (Phase 6), strength time series and progression flags (Phase 4/5), finished sessions and the weekly schedule (Phase 3/4), nutrition logs and targets (Phase 7), and recovery check-ins (Phase 9). It **never writes** anything, **never re-runs** the calculators or progression engine, writes **no** audit/calculation record, and contains **no AI** — recommendations are deterministic and rule-based (the AI boundary in PLAN holds through Phase 11). The PDF report is **generated on demand and downloaded**; producing it persists nothing.

## Clarifications

### Session 2026-06-06

- Q: What period does the "monthly" PDF report cover, and how is it chosen? → A: It covers one calendar month, selectable by the athlete, defaulting to the most recently completed calendar month; lifetime "since start" summary figures are also included in the report header.
- Q: Where do the report's "auto-generated recommendations for next month" come from, given no AI is allowed in Phase 11? → A: They are deterministic and rule-based, derived from existing module signals already produced by earlier phases (progression flags such as ready-to-add-load / stagnation / deload, calorie performance vs. target, and recovery signals). No new engine, no AI, no free-form text generation.
- Q: What is the "since start" anchor for lifetime statistics? → A: The athlete's program start date (the same anchor used by streaks and phase attribution in earlier phases); statistics never count activity before it.
- Q: How should the "most-improved" exercises be ranked for the Strength tab's top-5 progressions and the PDF's top-3 load progressions? → A: By largest absolute working-weight increase (kg) since program start.
- Q: What should each axis of the Strength tab's muscle-group radar represent? → A: Relative strength progress (%) per muscle group, comparing now vs. start.
- Q: How should the Attendance contribution heatmap shade each day? → A: Graded by that day's training volume (true GitHub-style intensity gradient), not a binary done/not-done.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See the headline transformation metrics (Priority: P1)

The athlete opens the Statistics screen and immediately sees four big-number cards that summarize the whole journey: how much weight they've gained since they started, the total volume they've lifted since start, what share of their scheduled sessions they actually completed, and their average weekly calories. In one glance they know whether the program is working.

**Why this priority**: The single most important job of a progress screen is the at-a-glance "am I transforming?" read. Even with no tabs and no PDF, these four numbers deliver the core value of the phase and can ship as a standalone MVP.

**Independent Test**: With body-weight history, finished sessions, a configured schedule, and nutrition logs present, confirm each card shows the correct derived value — total weight gained (latest vs. starting weight), total volume lifted since start, session completion rate (completed ÷ scheduled to date), and average weekly calories — and that each card shows a clear empty/placeholder state when its source data is missing.

**Acceptance Scenarios**:

1. **Given** a recorded starting weight and a latest weight, **When** the metrics render, **Then** the "total weight gained" card shows the signed change in body weight since the program start.
2. **Given** a history of finished sessions since start, **When** the metrics render, **Then** the "total volume lifted" card shows the cumulative training volume (weight × reps across completed sets) since the program start.
3. **Given** a configured weekly schedule and a history of completed sessions, **When** the metrics render, **Then** the "session completion rate" card shows completed sessions as a percentage of scheduled training sessions elapsed since start.
4. **Given** nutrition logged across multiple weeks, **When** the metrics render, **Then** the "average weekly calories" card shows the mean weekly calorie intake over the logged history.
5. **Given** a brand-new athlete with no logged data, **When** the metrics render, **Then** each card shows a clear empty/placeholder state rather than misleading zeros or an error.

---

### User Story 2 - Explore body and strength progress (Priority: P2)

The athlete opens the Body tab to see their weight curve and body-measurement curves over the whole program, then the Strength tab to see their top five exercise progressions, their weekly training volume, and a muscle-group radar showing where they are strongest and where they lag. These are the visual evidence of the transformation.

**Why this priority**: Curves and progressions are the heart of a "global progress" screen — they turn raw history into a visible trajectory. They rank just below the headline metrics because they require more interaction (tabs, charts) but carry the highest motivational and diagnostic value.

**Independent Test**: With weight, measurement, and strength history present, confirm the Body tab plots the weight curve and each available measurement curve over time, and the Strength tab shows the five most-improved exercises' progressions, weekly volume, and a muscle-group radar; with sparse or missing data, confirm each chart degrades gracefully (empty state or fewer series) without error.

**Acceptance Scenarios**:

1. **Given** body-weight entries over time, **When** the Body tab renders, **Then** it plots the weight curve across the program with the goal reference.
2. **Given** logged body measurements, **When** the Body tab renders, **Then** it plots a curve over time for each available measurement (e.g., chest, waist, arms, thighs), and omits measurements with no data.
3. **Given** strength history across exercises, **When** the Strength tab renders, **Then** it shows the top five exercise progressions (ranked by largest absolute working-weight gain in kg since start) as trend lines.
4. **Given** finished sessions over time, **When** the Strength tab renders, **Then** it shows training volume aggregated per week.
5. **Given** strength data across muscle groups, **When** the Strength tab renders, **Then** it shows a muscle-group radar where each axis is the relative strength progress (%) per group (current vs. start).
6. **Given** an athlete with too few data points for a chart, **When** that chart renders, **Then** it shows a clear empty/insufficient-data state instead of a broken or misleading chart.

---

### User Story 3 - Review attendance, nutrition, and recovery trends (Priority: P3)

The athlete opens the Attendance tab to see a GitHub-style contribution heatmap of every training day they completed, the Nutrition tab to see weekly calorie trends against their target, and the Recovery tab to see their sleep averages and how stress relates to body-weight change over time.

**Why this priority**: These tabs round out the picture with consistency, fueling, and recovery context. They are valuable but secondary to body/strength evidence and the headline numbers, so they rank lowest among the viewing stories.

**Independent Test**: With session, nutrition, and recovery history present, confirm the Attendance heatmap marks each day by training activity, the Nutrition tab plots weekly calorie totals against the target, and the Recovery tab shows sleep averages and a stress-vs-weight correlation view; with missing data in any tab, confirm that tab shows its own empty state while the others still render.

**Acceptance Scenarios**:

1. **Given** finished sessions across the program, **When** the Attendance tab renders, **Then** it shows a calendar contribution heatmap with each day shaded by a graded intensity reflecting that day's training volume (no-session days at the empty shade).
2. **Given** nutrition logged across weeks, **When** the Nutrition tab renders, **Then** it shows weekly calorie totals (or averages) plotted against the resolved daily/weekly calorie target.
3. **Given** recovery check-ins with sleep data, **When** the Recovery tab renders, **Then** it shows sleep averages over the program.
4. **Given** recovery stress data alongside body-weight history, **When** the Recovery tab renders, **Then** it shows a stress-vs-weight correlation view over time.
5. **Given** a tab whose source data is missing, **When** that tab renders, **Then** it shows a clear empty state and the other tabs remain unaffected.

---

### User Story 4 - Export a monthly PDF report (Priority: P3)

The athlete chooses a month and downloads a PDF report they can keep or hand to a coach. The report contains the month's summary stats, the top three load progressions, a weight-progression chart, and a short list of deterministic, rule-based recommendations for the coming month.

**Why this priority**: The PDF is the phase's signature deliverable for sharing and record-keeping, but it builds on top of the same data the on-screen tabs already present, so it ranks as a final slice rather than the MVP.

**Independent Test**: With a month of data present, request the report for that month and confirm a downloadable document is produced containing the summary stats, the top three load progressions, a weight-progression chart, and recommendations; confirm the default month is the most recently completed calendar month; confirm that generating the report changes no stored data.

**Acceptance Scenarios**:

1. **Given** data for a selected month, **When** the athlete exports the report, **Then** a downloadable PDF is produced containing summary statistics for that month.
2. **Given** the report is generated, **When** the athlete opens it, **Then** it includes the top three load progressions for the period.
3. **Given** weight history for the period, **When** the report is generated, **Then** it includes a weight-progression chart.
4. **Given** the athlete's existing module signals (progression flags, calorie performance, recovery), **When** the report is generated, **Then** it includes deterministic, rule-based recommendations for next month — with no AI-generated content.
5. **Given** no month is explicitly chosen, **When** the athlete exports the report, **Then** it defaults to the most recently completed calendar month.
6. **Given** the athlete generates a report, **When** generation completes, **Then** no athlete data is created, updated, or deleted as a result.

---

### Edge Cases

- **Cold start / brand-new athlete**: With no logged sessions, weight, measurements, nutrition, or recovery, every metric card, tab, chart, and the PDF render a clear empty/onboarding state rather than errors, broken charts, or misleading zeros.
- **Sparse data / insufficient points**: A chart needing a minimum number of points (e.g., a trend line or correlation) shows an "insufficient data" state instead of a misleading line; the top-five/top-three lists shrink to however many qualifying exercises exist.
- **Partial measurements**: If only some body measurements are logged, the Body tab plots the available ones and omits the rest without error.
- **Before program start**: Statistics never count activity dated before the program start; the "since start" window anchors on the program start date.
- **Schedule changes over time**: The session completion rate and attendance reflect the schedule as it applied, so reconfiguring the schedule does not retroactively mark past rest days as missed.
- **Empty month for the PDF**: Exporting a report for a month with no activity produces a valid PDF that clearly states there was no activity, rather than failing.
- **Future / current (incomplete) month**: The default report period is the most recently *completed* calendar month. Selecting the current in-progress month is allowed and reflects only data logged so far; selecting a future month is allowed and yields the valid empty-state report (no 4xx). Only a *malformed* `month` value is rejected.
- **Time-zone / day boundary**: "Since start," weekly aggregation, and per-day attendance follow the app's existing server calendar-day and ISO-week conventions (consistent with Phases 4/8/9/10).
- **Calorie target source**: Nutrition trends compare against the athlete's *resolved* calorie target (which varies per athlete), not a hardcoded number.

## Requirements _(mandatory)_

### Functional Requirements

**Headline metrics (Story 1)**

- **FR-001**: The Statistics screen MUST show a "total weight gained" metric reflecting the signed change in body weight from the athlete's starting weight to their latest weight.
- **FR-002**: The screen MUST show a "total volume lifted since start" metric reflecting the cumulative training volume (weight × reps across completed sets) across all finished sessions since the program start.
- **FR-003**: The screen MUST show a "session completion rate" metric reflecting completed sessions as a percentage of the scheduled training sessions elapsed since the program start.
- **FR-004**: The screen MUST show an "average weekly calories" metric reflecting the mean weekly calorie intake over the athlete's logged nutrition history.
- **FR-005**: Each headline metric MUST show a clear empty/placeholder state when its source data is missing, and the screen MUST still render when any single metric's source is absent.

**Body & Strength tabs (Story 2)**

- **FR-006**: The Body tab MUST plot the athlete's body-weight curve over the program, including the goal reference.
- **FR-007**: The Body tab MUST plot a curve over time for each body measurement that has data and MUST omit measurements with no data.
- **FR-008**: The Strength tab MUST show the top five most-improved exercise progressions as trend lines, ranked by largest absolute working-weight increase (kg) since program start (fewer if fewer qualify).
- **FR-009**: The Strength tab MUST show training volume aggregated per week.
- **FR-010**: The Strength tab MUST show a muscle-group radar where each axis is the relative strength progress (%) for that muscle group, comparing the athlete's current strength to their strength at program start.

**Attendance, Nutrition & Recovery tabs (Story 3)**

- **FR-011**: The Attendance tab MUST show a calendar contribution heatmap in which each day is shaded by a graded intensity reflecting that day's training volume (GitHub-style gradient), with no completed session rendering as the empty/zero shade.
- **FR-012**: The Nutrition tab MUST show weekly calorie trends plotted against the athlete's resolved calorie target.
- **FR-013**: The Recovery tab MUST show average **sleep duration (hours)** over the program (the `sleep_hours` measure, distinct from the 1–5 sleep-quality rating).
- **FR-014**: The Recovery tab MUST show a stress-vs-weight correlation view relating recovery stress to body-weight change over time.
- **FR-015**: Each tab MUST show its own clear empty/insufficient-data state when its source data is missing, without preventing the other tabs from rendering.

**Monthly PDF report (Story 4)**

- **FR-016**: The athlete MUST be able to export a downloadable PDF report for a selectable calendar month, defaulting to the most recently completed calendar month.
- **FR-017**: The report MUST include summary statistics for the period and the lifetime "since start" headline figures.
- **FR-018**: The report MUST include the top three load progressions for the period, ranked by largest absolute working-weight increase (kg) (consistent with the Strength tab's ranking).
- **FR-019**: The report MUST include a weight-progression chart.
- **FR-020**: The report MUST include deterministic, rule-based recommendations for the next month derived from the athlete's existing module signals (progression flags, calorie performance vs. target, recovery signals), and MUST NOT contain AI-generated content.
- **FR-021**: Generating the report MUST NOT create, update, or delete any athlete data and MUST persist nothing.

**Cross-cutting**

- **FR-022**: The Statistics screen MUST be read-only: it MUST NOT create, update, or delete any athlete data, MUST NOT re-run the calculators or progression engine, and MUST NOT write an audit/calculation record as a result of being viewed.
- **FR-023**: Every value, chart, list, and report MUST be scoped to the owning athlete and MUST NOT expose another athlete's data.
- **FR-024**: All "since start" statistics MUST anchor on the athlete's program start date and MUST NOT count activity dated before it.
- **FR-025**: The screen and report MUST resolve day and week boundaries by the app's existing server calendar-day and ISO-week/weekday conventions, and MUST compare nutrition against the athlete's resolved per-athlete target rather than any hardcoded figure.
- **FR-026**: Every chart, list, and metric MUST render a clear empty/cold-start or insufficient-data state for a brand-new athlete so the whole screen and the report render without errors.

### Key Entities _(include if feature involves data)_

> Phase 11 introduces no new stored entity. It is a composed read over existing athlete-scoped data and an on-demand generated report; the items below are the **read inputs / derived views** it aggregates.

- **Headline metric**: A single summarized number with context — total weight gained, total volume lifted since start, session completion rate, average weekly calories. Each derived from its owning module (body weight, sessions, schedule, nutrition).
- **Body progress series**: The athlete's weight series and per-measurement series over the program, plus the goal weight, for the Body tab curves.
- **Strength progress views**: Per-exercise strength time series (for the top-five progressions and the top-three report list), weekly training-volume aggregates, and per-muscle-group summaries for the radar. Derived from finished sessions and the strength time series used by earlier phases.
- **Attendance grid**: One cell per calendar day across the program, shaded by a graded intensity reflecting that day's training volume (empty/zero shade when no session was completed).
- **Nutrition trend**: Weekly calorie aggregates and the resolved calorie target, for the Nutrition tab.
- **Recovery trend**: Sleep averages over time and paired stress / body-weight points for the correlation view.
- **Monthly report**: A generated, downloadable document for a selected month — summary + lifetime stats, top-three load progressions, a weight-progression chart, and deterministic recommendations. Composed from the above; persisted nowhere.
- **Recommendation**: A derived, non-persisted advisory line for next month, mapped deterministically from existing module signals (progression flags, calorie performance, recovery signals).

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From opening the Statistics screen, the athlete can read all four headline transformation metrics (weight gained, total volume, completion rate, average weekly calories) without further navigation.
- **SC-002**: Each headline metric shows the correct derived value for the athlete's data, and shows a clear empty state when its source is missing.
- **SC-003**: The Body tab plots the weight curve with the goal reference and a curve for every measurement that has data, omitting measurements with none.
- **SC-004**: The Strength tab shows the top five most-improved exercise progressions ranked by absolute working-weight gain in kg (or fewer when fewer qualify), weekly volume, and a muscle-group radar of progress % per group.
- **SC-005**: The Attendance heatmap shades each day by a graded intensity reflecting that day's training volume across the program, never marking a rest day or a future day as a missed session.
- **SC-006**: The Nutrition tab plots weekly calorie trends against the athlete's resolved target, not a hardcoded figure.
- **SC-007**: The Recovery tab shows sleep averages and a stress-vs-weight correlation view, and shows an insufficient-data state when there are too few points.
- **SC-008**: The athlete can export a PDF report for a selected month (defaulting to the most recently completed month) containing summary + lifetime stats, the top three load progressions, a weight chart, and deterministic recommendations.
- **SC-009**: The report contains no AI-generated content; every recommendation traces to an existing deterministic module signal.
- **SC-010**: A brand-new athlete with no logged data sees a fully rendered Statistics screen with graceful empty states everywhere and can generate a valid (empty-state) report, with no errors.
- **SC-011**: Viewing the Statistics screen and generating a report never change any stored data and never produce a calculation/audit record (verifiable: data is identical before and after).
- **SC-012**: No athlete can see another athlete's statistics or report data.

## Assumptions

- **Read-only aggregation, no new persistence**: Like Phase 5 (load-tracking) and Phase 10 (dashboard), Phase 11 adds **no new tables and no migrations**. It reads existing athlete-scoped data and recomposes it; it never writes, never re-runs the calculators/progression engine, and writes no audit/calculation record. The PDF is generated on demand and downloaded — it persists nothing.
- **Sources already exist**: Every element maps to data an earlier phase already produces — body weight + measurements + goal (Phase 6), strength time series + progression flags + weekly volume (Phase 4/5), finished sessions + the weekly schedule + program phases (Phase 3/4), the resolved calorie target + nutrition logs (Phase 7), and recovery check-ins incl. sleep/stress (Phase 9). Statistics surfaces these existing numbers rather than recomputing the underlying module logic.
- **"Since start" anchor**: Lifetime statistics anchor on the athlete's **program start date** — the same anchor used by streaks and phase attribution in earlier phases — and never count activity before it.
- **Top-N progressions** (per the 2026-06-06 clarifications): "Most-improved" is ranked by each exercise's **largest absolute working-weight increase (kg)** since program start; the Strength tab shows the top five and the report's top three, shrinking gracefully when fewer exercises qualify.
- **Muscle-group radar** (per the 2026-06-06 clarifications): Each radar axis is the **relative strength progress (%)** for a muscle group — current strength vs. strength at program start — so the chart reads as a transformation/progress view rather than a snapshot. A group with too little data shows no progress (origin) rather than a misleading value.
- **Attendance shading** (per the 2026-06-06 clarifications): The contribution heatmap uses a **graded intensity by daily training volume** (GitHub-style), with days that have no completed session shown at the empty/zero shade; rest days and future days never read as missed.
- **Session completion rate**: Completed sessions ÷ scheduled training sessions elapsed to date; rest days are not counted as scheduled sessions and future scheduled days are not yet counted as missed (retrospective-only "missed"), consistent with earlier phases.
- **Average weekly calories**: The mean of weekly calorie totals over the athlete's logged nutrition history; weeks follow the app's existing ISO-week convention.
- **Monthly PDF report** (per the 2026-06-06 clarifications): Covers one **calendar month**, selectable by the athlete, defaulting to the **most recently completed** month; the report header also carries the lifetime "since start" summary. The "weight chart screenshot" in PLAN is satisfied by including a weight-progression chart in the report.
- **Recommendations are deterministic, not AI** (per the 2026-06-06 clarifications and PLAN's AI boundary through Phase 11): Next-month recommendations are rule-based mappings over existing module signals (e.g., ready-to-add-load flags → "increase load on X"; calorie shortfall vs. target → "raise daily intake"; recovery red flags → "prioritize sleep / consider a deload"). No new engine, no AI, no free-form generation.
- **Calorie target is resolved per athlete**: Nutrition trends compare yesterday/weekly calories against the athlete's *resolved* target (which varies per athlete), not the example figure from PLAN.
- **Stress-vs-weight correlation**: Presented as a paired time-series/scatter relating recovery stress to body weight; with too few paired points it shows an insufficient-data state rather than a misleading correlation.
- **Day/week conventions**: Day boundaries follow the **server calendar day** and weeks the existing **ISO-week/weekday** convention (Phases 4/8/9/10), so "since start," weekly aggregation, and per-day attendance reset cleanly.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but every read and the report remain athlete-scoped so the screen works unchanged when multiple users exist.
- **Scope boundary**: This specification covers Phase 11 only — the headline metrics, the five analytics tabs (Body, Strength, Attendance, Nutrition, Recovery), and the monthly PDF export. It explicitly excludes any new data entry, any change to the underlying modules' own screens or computation logic, the Dashboard home screen (Phase 10), and the AI coaching layer (Phase 12). Where Statistics surfaces a module's data, the authoritative computation stays in that module.
