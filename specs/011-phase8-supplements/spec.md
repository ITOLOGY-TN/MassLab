# Feature Specification: Supplements

**Feature Branch**: `011-phase8-supplements`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 8: Supplements ONLY."

## Overview

Phase 8 turns supplement-taking into a fast daily habit with visible accountability. The athlete opens one screen showing their five planned supplements as cards — Creatine, Serious Mass, Vitamin D3, Magnesium, Omega-3 — each with a one-tap toggle, its recommended time of day, and an individual streak counter. The creatine streak is surfaced most prominently because it is the supplement whose effect depends most on uninterrupted daily use. Below the cards, a weekly grid (7 days × 5 supplements) shows at a glance which doses were taken, missed, or are still upcoming. A separate weekly self-assessment lets the athlete rate four recovery dimensions — energy, recovery, sleep quality, strength — on a 1–5 scale and watch those ratings trend over the program.

This phase is **read-and-write over supplement-adherence data the athlete owns**, layered on top of the supplement catalogue seeded in Phase 0 (the five supplements with their dosage, recommended time, and notes). Phase 8 does **not** edit the supplement catalogue itself (adding, removing, or renaming supplements is a Settings concern) and does **not** run any calculator or progression engine — it records whether each planned supplement was taken on each day, derives streaks and grid status from those records, and stores periodic self-ratings. It is pure adherence tracking and lightweight subjective logging.

## Clarifications

### Session 2026-06-03

- Q: How far back can the athlete edit a supplement's taken/not-taken state (backfill window)? → A: Current ISO week only — any day in the visible current week is toggleable (to correct a forgotten tap), past weeks are read-only.
- Q: From what date does a supplement's streak begin counting (earliest day a streak can include)? → A: The athlete's program start date — streaks count from `program_start_date` forward, never earlier.
- Q: How should a "calendar week" be defined (grid columns + weekly self-assessment uniqueness)? → A: ISO week (Monday–Sunday), consistent with the app's existing ISO weekday convention.
- Q: Which weeks' self-assessments can be edited? → A: The current ISO week only — once a week elapses its ratings lock as history.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Check off today's supplements (Priority: P1)

The athlete opens the supplements screen and sees their five planned supplements as cards, each showing its name, dosage, and recommended time. As they take each one through the day, they tap its toggle to mark it taken for today. Tapping again un-marks it if they tapped by mistake. The screen always reflects exactly which supplements have been taken today. This is the data-entry foundation the whole phase depends on: without a per-day "taken" record there is nothing to streak, grid, or color-code.

**Why this priority**: Every other story in this phase builds on the daily taken/not-taken record. An athlete who can only do this story already gets the core value of the module — a reliable, one-tap daily checklist that answers "have I taken everything today?", which is the single most important supplement-adherence feedback during a muscle-gain program.

**Independent Test**: Open the screen on today's date, toggle several supplements on, confirm each "taken" state persists for today and survives a reload, toggle one back off and confirm it clears, and confirm an untouched supplement remains in the not-taken state. Fully testable on its own and delivers immediate value.

**Acceptance Scenarios**:

1. **Given** the athlete is on today's supplements screen, **When** they tap a supplement's toggle to mark it taken, **Then** that supplement is recorded as taken for today and the card reflects the taken state immediately and after a reload.
2. **Given** a supplement marked taken today, **When** the athlete taps its toggle again, **Then** the "taken" record for today is removed and the card returns to the not-taken state.
3. **Given** the five seeded supplements, **When** the screen renders, **Then** each card shows the supplement's name, dosage, and recommended time from the catalogue, in the catalogue's display order.
4. **Given** no supplements have been logged for today, **When** the screen renders, **Then** all five cards show a not-taken state without error.
5. **Given** the athlete marks the same supplement taken twice in quick succession, **When** the records are read back, **Then** there is at most one "taken" record for that supplement on that day (no duplicate counting).

---

### User Story 2 - Keep a streak going for each supplement (Priority: P2)

Each supplement card shows an individual streak counter — the number of consecutive days, ending today, that the supplement has been taken. The creatine streak is displayed most prominently, since consistency matters most there. Seeing the streak grow motivates the athlete to not break the chain; missing a day visibly resets that supplement's streak.

**Why this priority**: Streaks are the primary motivational hook that keeps an athlete adhering day after day, but they are a derived view on top of Story 1's taken records. Valuable and highly visible, yet the checklist is fully usable without them, so they rank just below the core log.

**Independent Test**: With a sequence of taken/missed days for a supplement, confirm its streak equals the count of consecutive taken days ending at today, that a missed day resets the streak to zero, and that the creatine streak is rendered with greater prominence than the others.

**Acceptance Scenarios**:

1. **Given** a supplement taken on each of the last N consecutive days including today, **When** the card renders, **Then** its streak counter reads N.
2. **Given** a supplement that was taken on prior days but not today, **When** today is still in progress, **Then** today does not yet break the streak (today counts as upcoming, not missed), and the displayed streak reflects the consecutive taken days up to and including the most recent taken day per the defined streak rule.
3. **Given** a supplement that was missed on a past day that has fully elapsed, **When** the card renders, **Then** its streak counts only the consecutive taken days after that missed day.
4. **Given** the five supplements, **When** the screen renders, **Then** the creatine streak is presented more prominently than the other four streaks.
5. **Given** a supplement that has never been taken, **When** the card renders, **Then** its streak counter reads zero without error.

---

### User Story 3 - See the week at a glance (Priority: P2)

The athlete views a weekly grid — 7 days across, the 5 supplements down — where each cell is color-coded as taken, missed, or upcoming. In one look they can spot the day they forgot magnesium or confirm a perfect week. They can move between weeks to review history.

**Why this priority**: The grid converts the raw daily records into an honest visual accountability board that reveals patterns (e.g., always missing the evening supplement) the single-day checklist cannot. It depends on Story 1's records and ranks alongside streaks as a high-value read surface.

**Independent Test**: With taken/missed records across a week, render the grid and confirm each cell's color matches its state — taken for logged days, missed for elapsed days with no record, upcoming for the remainder of today and future days in the week — and confirm navigating to an adjacent week shows that week's data.

**Acceptance Scenarios**:

1. **Given** a week with a mix of taken and not-taken supplements, **When** the grid renders, **Then** each of the 35 cells (7 days × 5 supplements) shows the correct taken / missed / upcoming state for that supplement on that day.
2. **Given** the current week, **When** the grid renders, **Then** days after today (and today's not-yet-taken supplements) appear as upcoming rather than missed.
3. **Given** a past elapsed day with no record for a supplement, **When** the grid renders, **Then** that cell appears as missed.
4. **Given** the athlete navigates to a previous or next week, **When** the grid re-renders, **Then** it shows the taken/missed/upcoming status for that week, with future weeks shown entirely as upcoming.
5. **Given** a week with no records at all, **When** the grid renders, **Then** elapsed days show as missed and remaining days as upcoming, without error.

---

### User Story 4 - Rate weekly recovery and watch it trend (Priority: P3)

Once a week the athlete records a short self-assessment, rating four dimensions — energy, recovery, sleep quality, and strength — each on a 1–5 scale. Over the weeks these ratings form trend lines that show whether the athlete is recovering and progressing or running down.

**Why this priority**: The self-assessment adds qualitative signal that complements the objective adherence data, but it is an independent, lower-frequency input and a read-only trend on top of it. Motivating and useful, yet the least critical slice of the phase.

**Independent Test**: Submit a weekly self-assessment with the four ratings, confirm it persists for that week and can be edited within the week, submit assessments across several weeks, and confirm the trend chart plots each dimension's ratings in chronological order.

**Acceptance Scenarios**:

1. **Given** the athlete is on the current week, **When** they rate energy, recovery, sleep quality, and strength each from 1 to 5 and save, **Then** the self-assessment is persisted for that week and reflected on the screen.
2. **Given** a saved self-assessment for the current week, **When** the athlete changes one or more ratings and saves again, **Then** the existing week's assessment is updated rather than duplicated.
3. **Given** assessments saved across several weeks, **When** the trend chart renders, **Then** it plots each of the four dimensions over time in chronological order.
4. **Given** a rating outside the 1–5 range or a missing dimension, **When** the athlete tries to save, **Then** the assessment is rejected with a clear validation message and nothing is persisted.
5. **Given** no self-assessments have been recorded, **When** the trend chart renders, **Then** it shows a clear empty/low-data state without error.

---

### Edge Cases

- **Day rollover**: "Today" is the athlete's local calendar day, so marking a supplement late at night attributes it to the intended day and the checklist resets cleanly at midnight.
- **Future date**: Marking a supplement as taken (or recording a self-assessment) against a future date is rejected with a clear message; future days/weeks render only as upcoming/empty.
- **Backfilling the current week**: The athlete may correct an earlier day in the **current ISO week** (e.g., they took creatine yesterday but forgot to tap it) by toggling that day's cell; this is treated exactly like logging it on the day and feeds streaks and grid identically. Days in prior weeks are read-only history and cannot be altered.
- **Catalogue has fewer or more than five supplements**: The screen renders whatever supplements are seeded for the athlete (in display order); the "five cards" layout is the seeded default but the feature does not hardcode a count or break if the catalogue differs.
- **Streak after a gap**: A missed elapsed day resets that supplement's streak; today not-yet-taken does not break an existing streak until the day fully elapses.
- **Self-assessment uniqueness**: At most one self-assessment exists per athlete per ISO calendar week; saving again updates it rather than creating a second record for the week. Edits are accepted only for the current ISO week; elapsed weeks are read-only.
- **Empty states**: The cards, streak counters, weekly grid, and self-assessment trend each render an encouraging empty state when nothing has been logged.
- **Supplement removed later**: If a supplement is later removed from the catalogue (a Settings action), its historical taken records remain valid history and do not corrupt the grid or trends for past days (see Assumptions).

## Requirements _(mandatory)_

### Functional Requirements

**Daily checklist (Story 1)**

- **FR-001**: The system MUST present the athlete's seeded supplements as cards, each showing the supplement's name, dosage, and recommended time, in the catalogue's display order.
- **FR-002**: The system MUST let the athlete mark a supplement as taken for a given day (defaulting to today) with a single toggle action, and un-mark it with the same toggle, persisting the change against the athlete, the supplement, and that day. Editable days are limited to those within the **current ISO week** (Monday–Sunday); days in prior weeks are read-only history (FR-005a).
- **FR-003**: The system MUST ensure at most one "taken" record exists per athlete, per supplement, per day, so repeated toggles never double-count.
- **FR-004**: The system MUST render the checklist for a day with all supplements in their correct taken / not-taken state, including when nothing has been logged for that day.
- **FR-005**: The system MUST reject marking a supplement as taken against a future date or an invalid date with a clear message, and persist nothing in that case.
- **FR-005a**: The system MUST restrict toggling of taken/not-taken state to days within the current ISO week (Monday–Sunday); attempts to alter a day in a prior week MUST be rejected and persist nothing, while those days remain viewable as history.

**Streaks (Story 2)**

- **FR-006**: The system MUST compute, per supplement, a streak equal to the number of consecutive days the supplement was taken ending at the most recent applicable day, where a fully-elapsed day with no "taken" record breaks the streak and today not-yet-taken does not. Streak counting MUST begin no earlier than the athlete's program start date — days before `program_start_date` are never counted toward a streak.
- **FR-007**: The system MUST present each supplement's individual streak counter on its card, reading zero when the supplement has never been taken.
- **FR-008**: The system MUST display the creatine streak more prominently than the other supplements' streaks.

**Weekly grid (Story 3)**

- **FR-009**: The system MUST present a weekly grid of the 5 supplements across the 7 days of a selected ISO week (Monday–Sunday), with each cell classified as **taken**, **missed**, or **upcoming**.
- **FR-010**: The system MUST classify a cell as **taken** when a "taken" record exists for that supplement on that day, **missed** when the day has fully elapsed with no record, and **upcoming** for the remainder of today and any future day in the week.
- **FR-011**: The system MUST let the athlete navigate to other weeks and render each week's grid correctly, including future weeks shown entirely as upcoming and weeks with no records shown as missed (elapsed days) / upcoming (remaining days).

**Weekly self-assessment (Story 4)**

- **FR-012**: The system MUST let the athlete record, for an ISO calendar week (Monday–Sunday), a self-assessment of four dimensions — energy, recovery, sleep quality, strength — each rated on an integer 1–5 scale.
- **FR-013**: The system MUST enforce at most one self-assessment per athlete per ISO calendar week, updating the existing record when the athlete saves again for that week rather than creating a duplicate. Editing is limited to the **current ISO week**; once a week has fully elapsed its self-assessment is locked as read-only history.
- **FR-014**: The system MUST reject a self-assessment with any rating outside 1–5 or with a missing dimension, with a clear validation message, and persist nothing in that case.
- **FR-015**: The system MUST present a trend view plotting each of the four self-assessment dimensions across the recorded weeks in chronological order.
- **FR-016**: The system MUST render the self-assessment and its trend without error in low-data and no-data conditions.

**Retrieval & history (supports all stories)**

- **FR-017**: The system MUST provide the athlete's supplement taken/not-taken status for a given day (for the checklist) and for a given week (for the grid).
- **FR-018**: The system MUST provide the athlete's self-assessment history over time for the trend view.

**Cross-cutting**

- **FR-019**: The system MUST scope every supplement-adherence record and self-assessment to the owning athlete and never expose another athlete's data.
- **FR-020**: The system MUST NOT modify the supplement catalogue (add, edit, delete, or reorder supplements) in this phase, and MUST NOT run any calculator, progression, or audit engine as a result of supplement logging — supplement tracking is adherence recording, not a calculation.
- **FR-021**: The system MUST scope all daily records to a single calendar day and all weekly records and grids to a single ISO calendar week (Monday–Sunday), so day and week boundaries reset cleanly.

### Key Entities _(include if feature involves data)_

- **Supplement (catalogue item)**: A named planned supplement with dosage, recommended time, optional notes, and display order, owned by the athlete. Seeded in Phase 0 (Creatine, Serious Mass, Vitamin D3, Magnesium, Omega-3). **Read-only in this phase** — Phase 8 records adherence against it but does not edit the catalogue. (Backed by the existing `supplements` store.)
- **Supplement intake record**: One record per athlete, per supplement, per day, indicating the supplement was taken that day. The canonical source for the daily checklist, streak counts, and weekly grid. Absence of a record for an elapsed day means "missed"; for today/future it means "upcoming".
- **Weekly self-assessment**: One record per athlete, per ISO calendar week (Monday–Sunday), holding integer 1–5 ratings for energy, recovery, sleep quality, and strength. Editable only for the current week. Powers the trend view.
- **Day**: The athlete's local calendar day, the unit the daily checklist and streaks are scoped to.
- **Week**: The ISO calendar week (Monday–Sunday), the unit the grid and self-assessment are scoped to and the bound on the editable window.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The athlete can mark all five supplements taken for today in under 10 seconds, and each card reflects the taken state immediately and after a reload.
- **SC-002**: Toggling a supplement on and off any number of times results in at most one "taken" record for that supplement on that day, with the final state matching the last toggle.
- **SC-003**: Each supplement's streak counter exactly equals the number of consecutive taken days ending at the applicable day for any taken/missed history, resetting to zero after a fully-elapsed missed day.
- **SC-004**: The creatine streak is visually more prominent than the other four streaks.
- **SC-005**: Every cell of the weekly grid (7 days × 5 supplements) shows the correct taken / missed / upcoming state for any week of records, with future days/weeks never shown as missed.
- **SC-006**: A weekly self-assessment saved with four 1–5 ratings persists for that week and, when re-saved, updates in place without creating a duplicate for the week.
- **SC-007**: The self-assessment trend plots each of the four dimensions in chronological order matching the recorded weekly ratings.
- **SC-008**: Marking a supplement or saving a self-assessment against a future or invalid date is always rejected and never persisted.
- **SC-009**: Every surface (cards, streaks, weekly grid, self-assessment trend) renders a clear empty state without error when no corresponding data exists.
- **SC-010**: No athlete can retrieve, view, or modify another athlete's supplement records or self-assessments.

## Assumptions

- **Reuses the seeded catalogue**: Phase 8 builds on the five supplements seeded per athlete in Phase 0 (name, dosage, recommended time, notes, display order). It adds adherence records and weekly self-assessments but does not change the catalogue; adding/removing/renaming supplements is a Phase 2 Settings concern.
- **No engine involvement**: Supplement logging is simple adherence recording. It does not trigger the calculators, progression engine, or the calculation audit log — consistent with how non-calculation logging is treated elsewhere in the app.
- **Streak definition**: A supplement's streak is the count of consecutive calendar days, ending at the most recent applicable day, on which it was taken. A past day that has fully elapsed with no "taken" record breaks the streak; the current day not yet marked does not break an existing streak until it elapses. Per the clarification, streak counting begins at the athlete's **program start date** (`program_start_date`) and never counts days earlier than it.
- **Grid status semantics**: In the weekly grid, **taken** = a record exists, **missed** = an elapsed day with no record, **upcoming** = the remainder of today and future days/weeks. This makes "missed" an honest, retrospective-only state and never penalizes time that hasn't happened.
- **Backfill window**: Per the clarification, the editable window is the **current ISO week only**. The athlete may toggle any day within the current Monday–Sunday week (correcting a supplement they took but forgot to tap), which feeds streaks and the grid identically to same-day logging. Days in prior weeks are read-only history and cannot be altered, preserving the integrity of streaks and the grid as honest records.
- **Five fixed supplements, but not hardcoded**: The default layout shows the five seeded supplements; the feature renders whatever supplements are seeded for the athlete in display order and does not break if the count differs.
- **Self-assessment cadence**: The self-assessment is weekly (one per ISO calendar week), with four fixed dimensions (energy, recovery, sleep quality, strength) each rated 1–5. Per the clarification, only the **current ISO week's** assessment is editable; once a week elapses its ratings lock as read-only history. It is distinct from the daily recovery check-in introduced in Phase 9 (sleep, stress, energy, mood, soreness); Phase 8 owns only this weekly supplement-adjacent self-rating.
- **Today and week by local calendar**: "Today" is the athlete's local calendar day and "this week" the local **ISO calendar week** (Monday–Sunday), consistent with the app's existing ISO weekday convention; late-night logging attributes to the intended day, and future-dated logging is rejected.
- **Historical stability**: Taken records and self-assessments are stored against the athlete and a date/week, so they remain valid history even if the supplement catalogue is later changed; past grid cells and streaks computed from elapsed history stay stable.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but all supplement-adherence and self-assessment data remains athlete-scoped so the feature works unchanged when multiple users exist.
- **Scope boundary**: This specification covers Phase 8 only — the daily supplement checklist, per-supplement streaks, the weekly taken/missed/upcoming grid, and the weekly four-dimension self-assessment with its trend. It explicitly excludes the daily recovery & wellbeing check-in (Phase 9), the dashboard's supplement/streak surfacing (Phase 10), global statistics and PDF export (Phase 11), and any editing of the supplement catalogue itself (Phase 2 Settings), even where those modules later consume this phase's data.
