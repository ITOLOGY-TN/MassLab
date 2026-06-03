# Feature Specification: Nutrition & Calories

**Feature Branch**: `010-phase7-nutrition-calories`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 7: Nutrition & Calories ONLY."

## Overview

Phase 7 gives the athlete a single daily screen to log everything they eat and drink and to see, in real time, how the day measures up against their calorie and macronutrient targets. The athlete builds the day across five named meal slots — searching a food catalogue, entering a gram amount, and watching four live progress bars (calories, protein, carbs, fat) fill toward the targets the calculators engine already produced for their profile. A one-tap "Load daily plan" pre-fills the day from the program's template meal plan, a hydration tracker counts water toward a daily goal, and a small set of trend charts turn weeks of logging into an at-a-glance answer to "am I eating enough to grow?".

This phase is **read-and-write over nutrition data the athlete owns**, layered on top of artifacts earlier phases produced but never exposed through a full logging surface: the seeded food catalogue and the program's template meal plan (Phase 0), and the daily calorie + macro targets computed and stored on the athlete profile (Phase 1). Phase 7 does **not** recompute targets or invent macro math beyond summing the foods the athlete logs — it records intake, totals it, and compares it to the stored goals.

## Clarifications

### Session 2026-06-03

- Q: When "Load daily plan" is tapped on a day that already has logged entries, what should happen? → A: Show a confirmation that lets the athlete choose to either replace the day with the template or append the template's meals to the existing entries — never a silent overwrite.
- Q: How should logging a food that isn't in the seeded catalogue work? → A: The athlete adds a custom food (name + reference macros) that is both logged on the day and saved into the searchable catalogue for reuse; the catalogue becomes athlete-writable in this phase for new-food creation.
- Q: What metric should the weekly protein trend chart show? → A: Average daily protein per week (mean protein across that week's logged days), comparable to the daily protein target.
- Q: How should the daily hydration goal be set? → A: Sourced from Settings/preferences with a default of 3 L (configurable), not hardcoded.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Log the day's food and watch the targets fill (Priority: P1)

Throughout the day the athlete opens the nutrition screen, picks the meal they're eating (breakfast, lunch, pre-workout snack, dinner, evening snack), searches the food catalogue, enters how many grams they ate, and adds it. Each addition instantly updates the four progress bars at the top — calories, protein, carbs, fat — so the athlete always knows how much is left to hit their bulking targets. This is the data-entry foundation the whole phase depends on: without logged food there is nothing to total, compare, or chart.

**Why this priority**: Every other story in this phase builds on logged intake. An athlete who can only do this story already gets the core value of the module — a trustworthy running total of calories and macros against their goal for the day, which is the single most important nutrition feedback during a muscle-gain program.

**Independent Test**: Add several foods with gram amounts across two meal slots, confirm each entry persists for the day, confirm the per-meal and daily totals are the correct sum of the logged foods, and confirm the four progress bars reflect those totals against the stored targets. Remove an entry and confirm totals and bars update. Fully testable on its own and delivers immediate value.

**Acceptance Scenarios**:

1. **Given** the athlete is on today's nutrition screen, **When** they search for a food, select it, enter a gram amount, and add it to a meal slot, **Then** the entry is persisted against today's date and that meal slot, and the day's running totals and progress bars update to include it.
2. **Given** foods are logged in multiple meal slots, **When** the screen renders, **Then** each meal slot shows its own subtotal and the top bars show the day's combined calories, protein, carbs, and fat.
3. **Given** the athlete's stored daily targets (calories, protein, carbs, fat), **When** logged totals are below, at, or above a target, **Then** each progress bar visually communicates remaining-vs-target and an over-target state is distinguishable from under-target.
4. **Given** a logged food entry, **When** the athlete edits its gram amount or removes it, **Then** the entry updates or disappears and all totals and bars recalculate accordingly.
5. **Given** the athlete enters a gram amount of zero or a negative/non-numeric value, **When** they try to add it, **Then** the entry is rejected with a clear validation message and nothing is logged.
6. **Given** a search returns no matching food, **When** the athlete adds a custom food by entering a name and its reference macros, **Then** that food is saved into the searchable catalogue for future reuse and logged on the current day.

---

### User Story 2 - Pre-fill the day from the program's meal plan (Priority: P2)

Rather than logging every food by hand, the athlete taps "Load daily plan" and the day is pre-filled with the program's template meal plan — the five planned meals with their foods and gram amounts — which they can then adjust to match what they actually ate.

**Why this priority**: This is the biggest day-to-day time saver and the main reason a busy athlete keeps logging. It depends on Story 1's logging model but adds major convenience. It is secondary only because the log is still usable (just slower) without it.

**Independent Test**: On a day with no entries, trigger "Load daily plan" and confirm the five meal slots are populated with the template's foods and amounts and that totals/bars reflect the plan. Then verify the athlete can still edit or remove any pre-filled entry.

**Acceptance Scenarios**:

1. **Given** an empty day, **When** the athlete loads the daily plan, **Then** the five meal slots are pre-filled with the template plan's foods and gram amounts and the totals/bars update to reflect the planned day.
2. **Given** a pre-filled entry, **When** the athlete changes its amount or removes it, **Then** it behaves exactly like a manually logged entry (editable, removable, recalculating totals).
3. **Given** a day that already has logged entries, **When** the athlete loads the daily plan, **Then** the system shows a confirmation offering to replace the day with the template or append the template's meals to the existing entries, and applies only the option the athlete chooses (never a silent overwrite).

---

### User Story 3 - Track hydration toward the daily goal (Priority: P2)

The athlete logs water as they drink it using quick-add buttons (+250 ml, +500 ml, +1 L) and watches a circular gauge fill toward the daily hydration goal (default 3 L). At a glance they know how much more water to drink today.

**Why this priority**: Hydration is a distinct, self-contained tracker that materially supports training and recovery, and it is fast to use. It is independent of food logging but shares the same daily screen, so it ranks alongside the plan loader rather than above the core food log.

**Independent Test**: Use the quick-add buttons several times, confirm the running total accumulates for the day, the gauge reflects total-vs-goal, and the total resets for a new day. Confirm an over-goal total is handled gracefully.

**Acceptance Scenarios**:

1. **Given** today's hydration is below goal, **When** the athlete taps a quick-add button (+250 ml / +500 ml / +1 L), **Then** the day's water total increases by that amount and the circular gauge advances toward the goal.
2. **Given** logged water for the day, **When** the athlete views the gauge, **Then** it shows current intake against the daily goal and clearly indicates when the goal is reached or exceeded.
3. **Given** a new calendar day begins, **When** the athlete opens the screen, **Then** the hydration total starts fresh for the new day while the previous day's total remains in history.
4. **Given** the athlete added water in error, **When** they undo or reduce the amount, **Then** the day's total decreases accordingly and never goes below zero.

---

### User Story 4 - See nutrition trends over time (Priority: P3)

The athlete reviews trend charts that summarize their eating: calories over the last 30 days against the calorie goal line, a breakdown of the current day's macros as proportions, and a weekly protein trend. These turn day-by-day logging into evidence of consistency.

**Why this priority**: Trends are motivating and reveal whether the athlete is consistently hitting their surplus, but they are a read-only visualization layer on top of the logging in Stories 1–2. Valuable, but the least critical slice.

**Independent Test**: With food logged across several days, render the charts and verify the 30-day calorie series matches daily totals with the goal line at the stored calorie target, the macro breakdown reflects the selected day's logged proportions, and the weekly protein trend aggregates the correct daily protein totals.

**Acceptance Scenarios**:

1. **Given** food logged across multiple days, **When** the athlete opens the trends, **Then** the calories-over-30-days chart plots each day's total calories in date order with a goal line at the stored calorie target.
2. **Given** a day with logged food, **When** the macro breakdown renders, **Then** it shows that day's protein, carbs, and fat as proportions of the day's intake.
3. **Given** several weeks of logged food, **When** the weekly protein trend renders, **Then** it shows each week's average daily protein (mean across that week's logged days) in chronological order.
4. **Given** the athlete has logged little or no data, **When** the trends render, **Then** they show a clear empty/low-data state without error.

---

### Edge Cases

- **No targets set**: If the athlete profile has no stored calorie/macro targets yet, the progress bars and goal line render gracefully (e.g., showing logged totals without a target reference) instead of erroring.
- **Food not in the catalogue**: When the seeded catalogue lacks a food, the athlete creates a custom food (name + reference macros) that is saved into the searchable catalogue and logged immediately; logging is never hard-blocked by a missing food. Creating a custom food with a name that already exists is handled without producing a confusing duplicate (see Assumptions).
- **Future or invalid date**: Logging food or water against a future or malformed date is rejected with a clear message.
- **Out-of-range amounts**: A zero, negative, non-numeric, or implausibly large gram amount or water volume is rejected with validation feedback rather than stored.
- **Catalogue item changes later**: Because each logged entry records the macros it contributed at log time, totals for past days remain stable even if a catalogue food's reference macros are later edited.
- **Load plan twice / onto a non-empty day**: Loading the daily plan behaves predictably and non-destructively (see Assumptions); the athlete is never surprised by silent data loss.
- **Empty states**: The meal slots, hydration gauge, and every trend chart render an encouraging empty state when nothing is logged.
- **Unit display**: Calories and macro grams are stored in their canonical units; if the athlete prefers a different display unit for body weight elsewhere, nutrition values (kcal, grams, milliliters/liters) display in their standard units without altering stored data.
- **Day rollover**: "Today" is determined by the athlete's local calendar day so logging late at night attributes intake to the intended day.

## Requirements _(mandatory)_

### Functional Requirements

**Food logging (Story 1)**

- **FR-001**: The system MUST let the athlete log a food intake entry consisting of a date (defaulting to today), one of the five meal slots (breakfast, lunch, pre-workout snack, dinner, evening snack), a selected food, and a quantity in grams.
- **FR-002**: The system MUST let the athlete search the food catalogue by name and select a food to log.
- **FR-002a**: When no catalogue food matches, the system MUST let the athlete create a custom food by entering a name and its reference macros (calories, protein, carbs, fat per standard amount); the new food MUST be saved into the searchable catalogue for future reuse and be immediately loggable. The system MUST handle a custom food whose name duplicates an existing catalogue entry without creating a confusing duplicate.
- **FR-003**: The system MUST compute each logged entry's calories, protein, carbs, and fat from the selected food's reference macros scaled to the logged gram amount, and MUST persist those computed values with the entry so historical totals stay stable if the catalogue is later edited.
- **FR-004**: The system MUST reject a food entry whose quantity is zero, negative, non-numeric, or implausibly large, with a clear validation message, and persist nothing in that case.
- **FR-005**: The system MUST let the athlete edit the quantity of a logged entry and delete a logged entry, recomputing that entry's macros and all affected totals.
- **FR-006**: The system MUST compute and present per-meal-slot subtotals and a whole-day total for calories, protein, carbs, and fat from the logged entries.
- **FR-007**: The system MUST present four progress indicators — calories, protein, carbs, fat — comparing the day's totals against the athlete's stored daily targets, visually distinguishing under-target, at-target, and over-target states.
- **FR-008**: The system MUST read the athlete's daily calorie and macro targets from the values already stored on the athlete profile by the calculators engine, and MUST NOT recompute or override them in this phase.
- **FR-009**: The system MUST render the food log and progress indicators without error when no targets are set and when no food is logged.

**Daily plan loading (Story 2)**

- **FR-010**: The system MUST provide a "Load daily plan" action that pre-fills the day's meal slots from the program's seeded template meal plan, creating logged entries with the template's foods and gram amounts.
- **FR-011**: When "Load daily plan" is invoked on a day that already has entries, the system MUST present a confirmation that lets the athlete choose to either **replace** the day's entries with the template or **append** the template's meals to the existing entries, and MUST apply only the chosen option — never silently overwriting or discarding existing entries.
- **FR-012**: The system MUST treat entries created by loading the plan exactly like manually logged entries — fully editable and removable, contributing to totals identically.

**Hydration (Story 3)**

- **FR-013**: The system MUST let the athlete add water to the day's total via quick-add amounts of +250 ml, +500 ml, and +1 L.
- **FR-014**: The system MUST track a per-athlete-per-day water total and compare it against a daily hydration goal — sourced from configuration (default 3 L) plus any existing per-athlete override — presenting progress as a circular gauge that indicates reaching or exceeding the goal. The in-app Settings editor for a per-athlete goal is a Phase 2 concern; Phase 7 reads the configured default and any existing override (read-only here).
- **FR-015**: The system MUST let the athlete reduce or undo a water addition, never allowing the day's total to drop below zero.
- **FR-016**: The system MUST scope hydration totals to a single calendar day so a new day starts at zero while prior days remain in history.

**Trends (Story 4)**

- **FR-017**: The system MUST present a calories-over-30-days chart plotting each day's total calories in date order, with a goal line at the stored calorie target when one exists.
- **FR-018**: The system MUST present the selected day's macro breakdown showing protein, carbs, and fat as proportions of that day's intake.
- **FR-019**: The system MUST present a weekly protein trend showing each week's average daily protein (mean protein across that week's logged days) in chronological order, comparable to the daily protein target.
- **FR-020**: The system MUST render every trend chart without error in low-data and no-data conditions.

**Retrieval & history (supports all stories)**

- **FR-021**: The system MUST provide the athlete's logged food entries for a given date, grouped by meal slot, for display and editing.
- **FR-022**: The system MUST provide the athlete's daily nutrition totals over a date range for the trend charts.

**Cross-cutting**

- **FR-023**: The system MUST scope every food-log entry, hydration entry, and nutrition total to the owning athlete and never expose another athlete's nutrition data.
- **FR-024**: The system MUST reject logging food or water against a future date or an invalid date with a clear message.

### Key Entities _(include if feature involves data)_

- **Food log entry**: One record per athlete, per date, per meal slot, per logged food — capturing the selected food, the gram quantity, and the computed calories/protein/carbs/fat snapshot for that portion. This is the canonical source for daily totals, progress bars, and trends. (Backed by the existing nutrition-log record store.)
- **Food (catalogue item)**: A named food with reference macros (calories, protein, carbs, fat) per standard amount (per 100 g), used for search and to compute logged portions. Seeded with the common-foods catalogue in Phase 0; **athlete-writable in this phase** — the athlete may add a custom food (name + reference macros) that persists into the searchable catalogue for reuse (FR-002a). (Backed by the existing food-database store.)
- **Daily meal-plan template**: The program's planned five-meal day (meal slots, foods, and gram amounts) produced by the program generator and seeded in Phase 0; read-only source for the "Load daily plan" action.
- **Hydration entry**: The athlete's water intake for a calendar day measured against a daily goal; powers the quick-add tracker and circular gauge.
- **Daily nutrition targets**: The stored calorie and macro (protein/carbs/fat) goals on the athlete profile, produced by the calculators engine (Phase 1). Read-only inputs that define the progress bars and the calorie goal line.
- **Meal slot**: One of the five fixed named slots (breakfast, lunch, pre-workout snack, dinner, evening snack) that organize a day's entries.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The athlete can find a food, enter a gram amount, and add it to a meal slot in under 15 seconds, and the progress bars update immediately.
- **SC-002**: Daily totals and per-meal subtotals exactly equal the sum of the logged entries' computed macros for any set of logged foods.
- **SC-003**: The four progress bars correctly reflect day totals against the stored targets, with over-target clearly distinguishable from under-target, for any logged dataset.
- **SC-004**: "Load daily plan" populates the five meal slots from the template and produces totals that match the template plan, with every pre-filled entry editable and removable.
- **SC-005**: Loading the daily plan on a day that already has entries never silently destroys existing entries (verifiable by the defined non-destructive behavior).
- **SC-006**: The hydration gauge reflects the correct day total after any sequence of quick-add and undo actions, never dropping below zero, and resets at the start of a new day.
- **SC-007**: The calories-over-30-days chart, the macro breakdown, and the weekly protein trend (each week's average daily protein) each match the underlying logged data for a representative multi-week dataset, with the calorie goal line at the stored target.
- **SC-011**: An athlete can create a custom food for an item missing from the catalogue, log it immediately, and find it by search on a later day without re-entering its macros.
- **SC-008**: Editing a catalogue food's reference macros does not change the totals already recorded for past days (historical stability).
- **SC-009**: Every surface (food log, progress bars, hydration gauge, all trend charts) renders a clear empty state without error when no corresponding data is logged.
- **SC-010**: No athlete can retrieve, view, or modify another athlete's food log, hydration, or nutrition totals.

## Assumptions

- **Reuses existing data**: Phase 7 builds on the food catalogue and the template meal plan seeded in Phase 0 and on the daily calorie/macro targets stored on the athlete profile by the Phase 1 calculators. It introduces no new macro formula; logged-entry macros are a straightforward scaling of catalogue reference values by gram amount.
- **Targets are upstream**: The calorie and macro targets (e.g., the current athlete's ~3300 kcal / 175 g protein / 430 g carbs / 90 g fat) are computed and stored by the calculators engine and by Settings (custom targets, Phase 2). Phase 7 reads them as goals and never recomputes or persists them.
- **Five fixed meal slots**: The five named meal slots (breakfast, lunch, pre-workout snack, dinner, evening snack) are fixed for this phase; reorganizing or renaming meals is a data-management concern handled elsewhere, not in Phase 7.
- **Gram-based portions**: Food is logged by gram amount, with catalogue macros stored per 100 g and scaled to the logged portion. Per-unit conveniences (e.g., "1 egg") are out of scope for this phase.
- **Custom food creation**: So logging is never blocked by a missing food, the athlete may create a custom food (name + reference macros per standard amount). Per the clarification, this food is **saved into the searchable catalogue for reuse** and logged immediately (FR-002a) — the food catalogue is athlete-writable for new-food creation in this phase. A custom food whose name duplicates an existing catalogue entry must be reconciled (e.g., match the existing food rather than create a confusing duplicate); full catalogue management (bulk edit/delete/merge of foods) remains a Phase 2 concern.
- **Macro snapshot at log time**: Each logged entry stores the macros it contributed when added, so totals and historical charts remain stable even if a catalogue food is later edited (FR-003, SC-008).
- **Load-plan behavior on a non-empty day**: Per the clarification, invoking "Load daily plan" on a day that already has entries shows a confirmation offering **replace** (swap the day's entries for the template) or **append** (add the template's meals on top), applying only the athlete's choice and never silently erasing entries (FR-011). The visual presentation of the confirmation is refined during planning.
- **Hydration goal**: The daily hydration goal defaults to 3 L and is sourced from configuration / the athlete's preferences rather than hardcoded; water totals are tracked per calendar day and reset each day. The in-app setter for a per-athlete goal lives in Phase 2 Settings; Phase 7 honors the `HYDRATION_GOAL_ML` default plus any existing `engine_overrides.hydration.goal_ml` override without providing a way to change it.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but all nutrition data remains athlete-scoped so the feature works unchanged when multiple users exist.
- **Today by local calendar day**: "Today" is the athlete's local calendar day; intake logged late at night attributes to the intended day, and a future-dated entry is rejected (FR-024).
- **Units**: Nutrition values are stored and displayed in their canonical units (kilocalories, grams, milliliters/liters). The kg/lbs preference used for body weight elsewhere does not alter nutrition values.
- **Scope boundary**: This specification covers Phase 7 only — daily food logging with macro totals and progress bars, daily-plan loading, hydration tracking, and nutrition trend charts. It explicitly excludes supplements (Phase 8), recovery (Phase 9), the dashboard's nutrition summary card (Phase 10), and global statistics / PDF export (Phase 11), even where those modules later consume this phase's data.
