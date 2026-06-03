# Feature Specification: Recovery & Wellbeing

**Feature Branch**: `012-phase9-recovery-wellbeing`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 9: Recovery & Wellbeing ONLY."

## Overview

Phase 9 gives the athlete a fast, honest way to log how their body feels each day and turns that subjective signal into actionable guidance. The athlete opens one screen and, in about thirty seconds, records a daily check-in: sleep quality (a star rating), hours slept, stress level, energy level, mood (an emoji pick), and which muscle zones feel sore (tapped on a body diagram). One check-in exists per day; re-opening the screen the same day shows the saved values and lets the athlete adjust them.

On top of that daily record, the app surfaces a small number of **smart contextual alerts** derived from recent patterns — for example a high-stress ("cortisol") warning when stress stays elevated for several days, a recommendation to reduce session volume when sleep and energy are running low, or a suggestion to take a full rest day when multiple recovery signals are poor or many muscle zones are sore at once. These alerts are advisory: they read the recent check-ins and apply deterministic, configurable rules. They never write to the training program, never invent numbers, and never run the calculator/progression engine.

Below the form, recovery history is visualized three ways: a monthly energy heatmap calendar, a sleep-versus-performance scatter plot (sleep against logged session training volume), and a 30-day chart overlapping the energy, stress, and sleep curves.

This phase is **read-and-write over recovery data the athlete owns**, building on the `recovery_log` store seeded in Phase 0 (which already holds sleep hours, soreness, energy, stress, and a note per athlete per day) and extending it with the additional signals Phase 9 introduces (sleep-quality stars, mood, and multi-zone soreness). For the sleep-versus-performance scatter it **reads** finished-session training volume from the session journal (Phase 4) but never writes to it. Recovery check-in logging is subjective journaling, not a calculation: it does **not** run any calculator, progression, or audit engine — mirroring how nutrition and supplement logging are treated elsewhere in the app.

## Clarifications

### Session 2026-06-03

- Q: How far back can the athlete create or edit a daily recovery check-in (backfill window)? → A: Current ISO week only — any day in the current Monday–Sunday week is editable (to backfill a forgotten day); prior weeks are read-only history and future dates are rejected. Consistent with the Phase 8 supplements convention and the app's ISO-weekday convention.
- Q: How should soreness be modeled now that Phase 9 introduces a clickable body diagram (vs the Phase 0 scalar 0–10 soreness)? → A: A set of selected sore muscle zones (no per-zone intensity); the legacy scalar 0–10 soreness is superseded by the zone set.
- Q: What numeric scale should energy and stress use? → A: Keep the existing `recovery_log` 0–10 integer scale for energy and stress (no column migration); sleep quality is a separate integer 1–5 star rating.
- Q: What default thresholds should the three smart alerts use (all configurable)? → A: High-stress/cortisol = stress ≥ 7/10 for ≥ 3 consecutive days; reduce-session-volume = average sleep ≤ 6h AND average energy ≤ 4/10 over the last 3 days; full-rest = ≥ 3 recovery signals poor at once OR ≥ 4 sore zones in a day.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Log today's recovery in 30 seconds (Priority: P1)

The athlete opens the Recovery screen and is shown a single compact form for today: a star rating for sleep quality, a slider for hours slept, sliders for stress and energy, an emoji picker for mood, and a clickable body diagram on which they tap the muscle zones that feel sore. They fill it in and save. Re-opening the screen the same day shows exactly what they entered and lets them change any value. This is the data-entry foundation the whole phase depends on: without a daily check-in there is nothing to alert on or chart.

**Why this priority**: Every other story in this phase is a derived view or insight on top of the daily check-in. An athlete who can only do this story already gets the core value — a fast, reliable place to record how recovered they feel each day, which is the single most important input for managing training fatigue during a muscle-gain program.

**Independent Test**: Open the screen on today's date, set sleep quality, hours slept, stress, energy, mood, and tap several sore zones, then save. Confirm every value persists for today and survives a reload, confirm changing a value and re-saving updates the same day's record (no duplicate), and confirm an untouched day shows an empty form without error.

**Acceptance Scenarios**:

1. **Given** the athlete is on today's Recovery screen, **When** they set sleep quality, hours slept, stress, energy, mood, and one or more sore zones and save, **Then** the check-in is recorded for today and the screen reflects those values immediately and after a reload.
2. **Given** a check-in already saved for today, **When** the athlete changes one or more values and saves again, **Then** today's existing check-in is updated in place rather than duplicated.
3. **Given** no check-in has been recorded for today, **When** the screen renders, **Then** the form shows a clean empty/default state without error.
4. **Given** the athlete taps several muscle zones on the body diagram, **When** they save, **Then** exactly the selected zones are recorded as sore for that day, and tapping a selected zone again before saving de-selects it.
5. **Given** a rating outside its allowed range, an unrecognized mood, or an unknown muscle zone, **When** the athlete tries to save, **Then** the check-in is rejected with a clear validation message and nothing is persisted.
6. **Given** the athlete tries to record a check-in against a future date, **When** they attempt to save, **Then** it is rejected with a clear message and nothing is persisted.

---

### User Story 2 - Get smart recovery alerts (Priority: P2)

Based on the athlete's recent check-ins, the screen shows a small set of contextual alerts that interpret the pattern and recommend an action — a high-stress ("cortisol") warning when stress has been elevated for several consecutive days, a "reduce session volume" recommendation when sleep and energy are running low, and a "take a full rest day" suggestion when several recovery signals are poor at once or many muscle zones are sore. The alerts help the athlete adjust training before fatigue turns into a stall or injury.

**Why this priority**: Alerts convert the raw daily log into actionable coaching, which is the recovery module's expert value. But they are a derived layer that depends entirely on Story 1's records, and the check-in is fully useful without them, so they rank just below the core log.

**Independent Test**: Seed a sequence of check-ins that should trigger each rule (e.g., several days of high stress; low sleep plus low energy; many sore zones) and confirm the corresponding alert appears with the right message; seed a healthy pattern and confirm no alert appears; confirm alerts are advisory only and never alter training, nutrition, or any persisted plan.

**Acceptance Scenarios**:

1. **Given** stress has been at or above the high-stress threshold for the configured number of consecutive recent days, **When** the screen renders, **Then** a high-stress ("cortisol") warning alert is shown.
2. **Given** recent sleep and energy are both at or below their low thresholds, **When** the screen renders, **Then** a "reduce session volume" recommendation is shown.
3. **Given** several recovery signals are poor at once (e.g., low sleep, low energy, high stress) or the number of sore zones meets the configured threshold, **When** the screen renders, **Then** a "take a full rest day" suggestion is shown.
4. **Given** the athlete's recent check-ins show a healthy recovery pattern, **When** the screen renders, **Then** no alerts are shown (or an "all clear" state), without error.
5. **Given** there are too few recent check-ins to evaluate a rule, **When** the screen renders, **Then** that rule produces no alert rather than a misleading one.
6. **Given** any alert is shown, **When** the athlete views it, **Then** it is presented as advisory guidance and the system makes no change to the training program, nutrition, or any other persisted plan as a result.

---

### User Story 3 - See recovery trends over time (Priority: P3)

The athlete reviews how recovery is trending: a monthly calendar heatmap colors each day by energy level, a scatter plot maps sleep against training performance (logged session volume) to reveal how rest affects output, and a 30-day chart overlaps the energy, stress, and sleep curves so correlations between them are visible at a glance.

**Why this priority**: The trend visuals turn accumulated check-ins into pattern insight that the single-day form cannot show, but they are read-only and depend on history existing. Valuable for reflection, yet the least critical slice of the phase.

**Independent Test**: With check-ins across several weeks (and some finished training sessions), render each visual and confirm the energy heatmap colors each day by its energy value, the scatter plots one point per day pairing that day's sleep with that day's session volume, and the 30-day overlay plots the energy, stress, and sleep series over the same window; confirm each renders a clear empty/low-data state when history is sparse.

**Acceptance Scenarios**:

1. **Given** check-ins across a month, **When** the energy heatmap renders, **Then** each day cell is colored by that day's energy level, and days with no check-in render as empty/uncolored.
2. **Given** days that have both a recovery check-in and a finished training session, **When** the scatter renders, **Then** it plots one point per such day pairing that day's sleep with that day's session training volume.
3. **Given** check-ins over the last 30 days, **When** the overlapping-curves chart renders, **Then** it plots the energy, stress, and sleep series across that window on a shared timeline.
4. **Given** there are no check-ins, or fewer than needed to be meaningful, **When** any trend view renders, **Then** it shows a clear empty/low-data state without error.
5. **Given** days with a check-in but no training session (or vice versa), **When** the scatter renders, **Then** only days with both a check-in and a session contribute points, and the absence of one side never produces a misleading point.

---

### Edge Cases

- **Day rollover**: "Today" is the server's calendar day (UTC), so a late-night check-in attributes to that day and the form resets cleanly at the UTC day boundary — consistent with the Phase 7/8 date convention.
- **Future date**: Recording a check-in against a future date is rejected with a clear message; future days never appear in alerts or trends.
- **Editing an earlier day in the current week**: The athlete may correct any day within the **current ISO week** (Monday–Sunday) — e.g., they forgot to log yesterday; this is treated exactly like same-day logging and feeds alerts and trends identically. Days in prior weeks are read-only history and cannot be altered; future-dated entries remain rejected.
- **Partial check-in**: The athlete may save a check-in with only some fields filled (e.g., sleep and stress but no mood or sore zones); missing optional fields are stored as absent and never invented, and alerts/trends simply skip the missing signal for that day.
- **No sore zones**: Saving a check-in with an empty set of sore zones is valid and means "no soreness reported" that day, distinct from "no check-in".
- **Insufficient data for alerts**: When there are too few recent check-ins to evaluate a rule, that rule stays silent rather than firing on thin evidence.
- **Scatter with missing pairs**: A day with a check-in but no finished session (or a session but no check-in) contributes no scatter point; only complete pairs are plotted.
- **Empty states**: The form, the alerts area, and all three trend visuals render a clear, encouraging empty/low-data state when nothing has been logged.
- **Sessions read-only**: The performance side of the scatter is read from finished sessions; Phase 9 never writes session data, and a change in how sessions are logged later does not corrupt past recovery records.

## Requirements _(mandatory)_

### Functional Requirements

**Daily check-in (Story 1)**

- **FR-001**: The system MUST present a daily recovery check-in form capturing sleep quality (integer star rating 1–5), hours slept, stress level (integer 0–10), energy level (integer 0–10), mood (from a fixed set of mood options), a set of sore muscle zones selected from a fixed body-zone list (no per-zone intensity), and an optional free-text note, for a given day defaulting to today.
- **FR-002**: The system MUST persist at most one check-in per athlete per day; saving again for the same day MUST update the existing record in place rather than create a duplicate.
- **FR-003**: The system MUST allow a check-in to be saved with any subset of its fields provided (each rating, mood, and the sore-zone set being individually optional), storing omitted fields as absent rather than substituting a value, and treating an explicitly empty sore-zone set as "no soreness reported" (distinct from "no check-in").
- **FR-004**: The system MUST validate provided values — sleep quality within 1–5, energy and stress within 0–10, mood within the allowed set, sore zones within the allowed body-zone list, and hours slept non-negative and within a sane daily bound (0–24) — and MUST reject an invalid check-in with a clear message, persisting nothing in that case.
- **FR-005**: The system MUST reject a check-in recorded against a future date or an otherwise invalid date with a clear message, persisting nothing in that case.
- **FR-005a**: The system MUST restrict creating or editing a check-in to days within the **current ISO week** (Monday–Sunday); attempts to alter a day in a prior week MUST be rejected and persist nothing, while those days remain viewable as read-only history.
- **FR-006**: The system MUST render the check-in for a given day in its saved state (or a clean empty/default state when nothing is logged), and let the athlete change and re-save any value within the editable window (FR-005a).

**Smart alerts (Story 2)**

- **FR-007**: The system MUST derive a small set of contextual recovery alerts from the athlete's recent check-ins using deterministic, configurable rules, without persisting the alerts as part of the athlete's logged data.
- **FR-008**: The system MUST produce a high-stress ("cortisol") warning when stress has been at or above the high-stress threshold (default ≥ 7/10) for at least the configured number of consecutive recent days (default ≥ 3 days).
- **FR-009**: The system MUST produce a "reduce session volume" recommendation when, over the recent window (default last 3 days), average sleep is at or below the low-sleep threshold (default ≤ 6 hours) AND average energy is at or below the low-energy threshold (default ≤ 4/10).
- **FR-010**: The system MUST produce a "take a full rest day" suggestion when multiple recovery signals are simultaneously poor (default: ≥ 3 of {low sleep, low energy, high stress} together) or when the number of sore zones in a day meets the configured threshold (default ≥ 4 zones).
- **FR-011**: The system MUST suppress a rule's alert when there are too few recent check-ins to evaluate it, so alerts never fire on insufficient evidence.
- **FR-012**: The system MUST treat all alerts as advisory only and MUST NOT alter the training program, nutrition targets, or any other persisted plan as a result of an alert.

**Trends (Story 3)**

- **FR-013**: The system MUST present a monthly energy heatmap calendar coloring each day by that day's recorded energy level, with days lacking a check-in shown as empty/uncolored.
- **FR-014**: The system MUST present a sleep-versus-performance scatter that plots one point per day for days having both a recovery check-in and a finished training session, pairing that day's sleep with that day's session training volume read from the session journal.
- **FR-015**: The system MUST present a 30-day chart overlapping the energy, stress, and sleep series across the same time window on a shared timeline.
- **FR-016**: The system MUST render every trend view without error in low-data and no-data conditions, showing a clear empty/low-data state.

**Retrieval & history (supports all stories)**

- **FR-017**: The system MUST provide the athlete's recovery check-in for a given day (for the form) and the athlete's recovery history over a date range (for alerts and trends).
- **FR-018**: The system MUST read finished-session training volume per day from the session journal solely to populate the sleep-versus-performance scatter, and MUST NOT write to session data.

**Cross-cutting**

- **FR-019**: The system MUST scope every recovery check-in to the owning athlete and never expose, alert on, or chart another athlete's data.
- **FR-020**: The system MUST NOT run any calculator, progression, or audit engine as a result of recovery check-in logging — recovery journaling is subjective recording, not a calculation.
- **FR-021**: The system MUST scope every check-in to a single server calendar day (UTC), so day boundaries reset cleanly and each day holds at most one check-in.

### Key Entities _(include if feature involves data)_

- **Daily recovery check-in**: One record per athlete per server calendar day (UTC), holding sleep quality (1–5), hours slept (0–24), stress level (0–10), energy level (0–10), mood, an optional note, and the set of sore muscle zones reported that day. The canonical source for the form, the alert rules, and the trend visuals. Builds on the Phase 0 `recovery_log` store and extends it with the Phase 9 signals (sleep-quality stars, mood, multi-zone soreness); the legacy scalar 0–10 soreness column is superseded by the zone set.
- **Sore muscle zone selection**: The set of body zones marked sore on a given day's check-in, drawn from a fixed list of muscle zones (the clickable body-diagram regions), with no per-zone intensity. Zero or more per check-in; an empty set means "no soreness reported".
- **Mood**: A single value per check-in drawn from a fixed set of mood options (the emoji picker).
- **Recovery alert**: A derived, non-persisted advisory message (high-stress warning, reduce-volume recommendation, full-rest suggestion) computed from recent check-ins by deterministic, configurable rules.
- **Session training volume (read-only)**: Per-day finished-session training volume read from the session journal (Phase 4), used only as the performance axis of the sleep-versus-performance scatter.
- **Day**: The server calendar day (UTC) — the unit a check-in is scoped to and the granularity of every trend.
- **Week (editable window)**: The current ISO calendar week (Monday–Sunday) — the bound on which days are editable. Days in the current week are create/editable; prior weeks are read-only history. Consistent with the app's existing ISO-weekday convention.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The athlete can complete and save a full daily check-in (sleep quality, hours slept, stress, energy, mood, sore zones) in under 30 seconds, and the screen reflects the saved values immediately and after a reload.
- **SC-002**: Saving a check-in any number of times for the same day results in exactly one stored check-in for that day, with the final state matching the last save.
- **SC-003**: A check-in saved with only some fields stores exactly those fields, leaves the rest absent (never substituting a value), and an explicitly empty sore-zone set is preserved as "no soreness reported".
- **SC-004**: Recording a check-in against a future or invalid date, an out-of-range rating, an unrecognized mood, or an unknown sore zone is always rejected and never persisted.
- **SC-005**: Each smart alert appears exactly when its configured rule is satisfied by the recent check-ins and stays silent otherwise, including staying silent when there is insufficient recent data.
- **SC-006**: No alert ever changes the training program, nutrition targets, or any other persisted plan — alerts are purely advisory.
- **SC-007**: The energy heatmap colors each day by its recorded energy and leaves days without a check-in uncolored.
- **SC-008**: The sleep-versus-performance scatter plots a point only for days having both a check-in and a finished session, and the 30-day overlay plots the energy, stress, and sleep series across the window.
- **SC-009**: Every surface (form, alerts, energy heatmap, scatter, overlapping curves) renders a clear empty/low-data state without error when no corresponding data exists.
- **SC-010**: No athlete can retrieve, view, alert on, or chart another athlete's recovery data.

## Assumptions

- **Builds on the seeded recovery store**: Phase 9 extends the Phase 0 `recovery_log` table (one row per athlete per day already holding sleep hours, soreness, energy, stress, and a note) with the additional signals this phase introduces — sleep-quality stars, mood, and multi-zone soreness. Per the clarification, the existing scalar 0–10 soreness column is **superseded** by the per-zone selection (a set of sore muscle zones). The existing per-day uniqueness (one record per athlete per day) is preserved as the upsert key.
- **Rating scales**: Sleep quality is an integer 1–5 (stars); energy and stress are integer sliders on the existing **0–10** recovery scale (no column migration, per the clarification — consistent with the Phase 0 store and any seeded data); hours slept is a non-negative number within a sane daily bound (0–24); mood is one value from a fixed emoji set; sore zones are chosen from a fixed list of body-diagram muscle regions with no per-zone intensity. The mood and zone lists are configuration, not hardcoded business rules.
- **Alert rules are deterministic and configurable**: The three alerts (high-stress/cortisol warning, reduce-session-volume recommendation, full-rest suggestion) are computed from recent check-ins by fixed, testable rules. Per the clarification, the shipped **defaults** are: high-stress = stress ≥ 7/10 for ≥ 3 consecutive days; reduce-volume = average sleep ≤ 6h AND average energy ≤ 4/10 over the last 3 days; full-rest = ≥ 3 of {low sleep, low energy, high stress} poor at once OR ≥ 4 sore zones in a day. Thresholds and look-back windows are configuration and may be tuned. Alerts are not persisted and are recomputed on read.
- **Alerts are advisory only**: Consistent with the app's AI/automation boundary, recovery alerts surface guidance but never write to or override the deterministic training, nutrition, or progression plans. They do not run the calculator/progression engine and write no audit row — recovery logging is journaling, not a calculation (mirroring the Phase 7 nutrition and Phase 8 supplement boundaries).
- **Editable window**: Per the clarification, the editable window is the **current ISO week only** (Monday–Sunday). The check-in defaults to today, and the athlete may backfill or correct any day within the current week (treated identically to same-day logging, feeding alerts and trends the same way). Days in prior weeks are read-only history; future-dated entries are always rejected. ISO weeks (Monday start) are consistent with the app's existing ISO-weekday convention (Phase 4/8).
- **Performance axis of the scatter**: "Performance" in the sleep-versus-performance scatter is the day's finished-session **training volume** read from the session journal (Phase 4); only days with both a check-in and a finished session produce a point. Phase 9 reads session data and never writes it.
- **Trend windows**: The energy heatmap is monthly, and the overlapping energy/stress/sleep curves cover the last 30 days; these windows are configuration defaults, not fixed business rules. Days without a check-in are shown as gaps, never as zero.
- **Distinct from the Phase 8 weekly self-assessment**: Phase 8 owns a weekly four-dimension supplement-adjacent self-rating (energy, recovery, sleep quality, strength). Phase 9 owns the **daily** recovery check-in (sleep, hours, stress, energy, mood, soreness) and its alerts and trends. They are separate records and surfaces; this phase does not modify the Phase 8 assessment.
- **Today by server calendar (UTC)**: "Today" is the server's calendar day (UTC) and "this week" the ISO calendar week (Monday–Sunday) derived from it; the clock is read once at the request boundary; late-night logging attributes to the UTC day and future-dated logging is rejected — consistent with the Phase 7/8 date convention.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but all recovery data remains athlete-scoped so the feature works unchanged when multiple users exist.
- **Scope boundary**: This specification covers Phase 9 only — the daily recovery check-in form, the smart contextual alerts, and the three recovery trend visuals. It explicitly excludes the dashboard's surfacing of recovery alerts (Phase 10, e.g., "low sleep + high stress detected"), global statistics and the recovery section of the PDF report (Phase 11), the Phase 8 weekly supplement self-assessment, and any AI coaching layer (Phase 12) — even where those modules later consume this phase's data.
