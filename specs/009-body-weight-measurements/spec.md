# Feature Specification: Body Weight & Measurements

**Feature Branch**: `009-body-weight-measurements`
**Created**: 2026-06-03
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 6: Body Weight & Measurements ONLY."

## Overview

Phase 6 gives the athlete a single place to record and visualize their physical transformation over the 5-month program. The athlete logs a morning weigh-in (weight, optional body circumferences, a note, and an optional progress photo), then sees that data brought to life: a weight curve charting progress against an ideal-progression zone and goal line, a monthly measurements table with month-over-month deltas, and a dated photo gallery supporting before/after comparison.

This phase is **read-and-write over body data the athlete owns** — it reads from and writes to the body-measurement and progress-photo records that earlier phases scaffolded but never exposed through a full create/list/visualize surface. It does not invent new physiological calculations; body-fat % and lean-mass estimation already run automatically when a measurement is saved (Phase 1). Phase 6 surfaces, charts, and curates that data.

## Clarifications

### Session 2026-06-03

- Q: How should attaching a progress photo work relative to saving the weigh-in numbers? → A: Separate upload step — the weigh-in numbers are saved first; the photo is uploaded (and deleted) through a dedicated action, matching the Phase 3 exercise-media pattern. Numeric data is never rolled back due to a photo-file failure.
- Q: When re-saving a day that already has a photo, and the new save includes no photo, what happens to the existing photo? → A: Keep the existing photo — editing weight/measurements never alters that day's photo; photo removal is only ever an explicit delete action.
- Q: In the month-over-month measurements table, which single value represents each month for a given measurement? → A: The latest entry in that month (most recent measured date).

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Log a morning weigh-in (Priority: P1)

Every morning the athlete steps off the scale and records their weight, optionally adding tape-measure circumferences (arm, chest, thighs, shoulders, waist, neck, hip), a short note, and a progress photo. This is the data-entry foundation the entire phase depends on — without logged entries there is nothing to chart.

**Why this priority**: All other stories visualize data this story produces. It is the minimum viable slice: an athlete who can only log weigh-ins already gets a persistent, trustworthy record of their transformation and feeds downstream modules (dashboard weight metric, body-composition estimate, macro targets).

**Independent Test**: Submit a weigh-in with a weight value and a date, confirm it is stored and retrievable; submit a second weigh-in with optional measurements and a photo and confirm all fields persist. Fully testable on its own and delivers immediate value (a saved, viewable history).

**Acceptance Scenarios**:

1. **Given** the athlete is on the weigh-in form, **When** they enter a weight for today and save, **Then** the entry is persisted against today's date and appears in their history.
2. **Given** the athlete enters weight plus one or more optional circumferences and a note, **When** they save, **Then** every provided field is persisted and blank optional fields are stored as absent (not zero).
3. **Given** an entry already exists for today, **When** the athlete saves another weigh-in for today, **Then** the existing entry for that date is updated rather than creating a duplicate (one entry per athlete per day).
4. **Given** the athlete has saved a weigh-in for a date, **When** they upload a progress photo for that date through the dedicated photo action, **Then** the photo is stored and linked to that date with the recorded weight available as an overlay value.
5. **Given** the athlete submits the form with no weight and no measurements, **When** they save, **Then** the system rejects the entry with a clear message that at least one value is required.

---

### User Story 2 - See the weight curve over the program (Priority: P2)

The athlete opens the main chart and sees their weight plotted across the 5-month program, with an ideal-progression zone, a goal line at their target weight, markers for each training phase, and milestone annotations. In one glance they know whether they are on pace for +6 to +8 kg of muscle.

**Why this priority**: This is the headline visualization of the phase and the primary reason the athlete logs data. It turns a list of numbers into an answer to "am I on track?". It depends on Story 1 having data but is independently testable and demonstrable.

**Independent Test**: With a series of logged weigh-ins spanning several weeks, render the chart and verify the plotted curve matches the entries, the goal line sits at target weight, the ideal-progression zone spans from start weight to target across the program window, and phase boundaries appear at the correct dates.

**Acceptance Scenarios**:

1. **Given** multiple weigh-ins over time, **When** the athlete opens the main chart, **Then** the weight curve plots each entry in date order from the program start date across the program window.
2. **Given** the athlete has a starting weight and target weight, **When** the chart renders, **Then** a goal line is drawn at the target weight and an ideal-progression zone is shown spanning expected weight gain from start to target over the program duration.
3. **Given** the program has multiple training phases of known durations, **When** the chart renders, **Then** phase boundary markers appear at the correct calendar positions.
4. **Given** the athlete has logged fewer than two entries, **When** they open the chart, **Then** the chart shows the available point(s) and the reference lines without error and communicates that more data is needed for a trend.
5. **Given** the athlete's latest weight is within the ideal-progression zone, **When** the chart renders, **Then** the current status is visually distinguishable from being above or below the zone.

---

### User Story 3 - Compare measurements month over month (Priority: P3)

The athlete reviews a table of their body circumferences by month and sees, for each measurement, how it changed versus the previous month — color-coded so growth (e.g., arms, chest) and reduction (e.g., waist) are immediately legible.

**Why this priority**: Circumferences tell the body-recomposition story that scale weight alone cannot. Valuable but secondary to weight tracking and the headline chart, and it depends on the athlete having logged measurements across at least two months.

**Independent Test**: With measurements logged across two or more months, render the table and verify each row shows the representative monthly value and a signed delta versus the prior month, with appropriate up/down coloring.

**Acceptance Scenarios**:

1. **Given** measurements logged across two or more months, **When** the athlete opens the measurements table, **Then** each month shows a representative value per circumference and a signed delta versus the previous month.
2. **Given** a measurement increased versus the prior month, **When** the table renders, **Then** the delta is displayed with a distinct positive indicator; **And** a decrease is shown with a distinct negative indicator.
3. **Given** a month is missing a particular measurement, **When** the table renders, **Then** the gap is shown without a misleading delta (no delta computed against a missing value).
4. **Given** only one month of data exists, **When** the table renders, **Then** values display with no delta populated and no error.

---

### User Story 4 - Browse and compare progress photos (Priority: P3)

The athlete views their progress photos in a date-ordered gallery, each tagged with the weight recorded that day, can open a photo full-screen, and can place two photos side by side for a before/after comparison.

**Why this priority**: Photos are the most motivating evidence of transformation, but they are a curation/visualization layer on top of the weigh-in capture in Story 1. Strong engagement value, lower functional criticality than recording and charting the numbers.

**Independent Test**: With several photos attached to weigh-ins on different dates, render the gallery, verify each thumbnail shows its date and weight overlay, open one full-screen, and select two for side-by-side comparison.

**Acceptance Scenarios**:

1. **Given** photos attached across multiple dates, **When** the athlete opens the gallery, **Then** photos appear in a grid ordered by date, each showing its date and the weight recorded that day.
2. **Given** the gallery is open, **When** the athlete selects a photo, **Then** it opens in a full-screen view.
3. **Given** the gallery is open, **When** the athlete selects a "before" and an "after" photo, **Then** the two are shown side by side for comparison.
4. **Given** the athlete deletes a photo, **When** they confirm, **Then** the photo is removed from the gallery and its stored file is no longer served.
5. **Given** a weigh-in has no photo, **When** the gallery renders, **Then** that date simply has no entry in the gallery (the missing photo does not break the grid).

---

### Edge Cases

- **Future or invalid date**: A weigh-in dated in the future, or a malformed date, is rejected with a clear message.
- **Out-of-range values**: A non-positive or implausibly large weight or circumference is rejected with validation feedback rather than stored.
- **Duplicate-day edit**: Re-saving for an existing date updates that day's numeric entry by merging the provided fields over the stored values (never erasing untouched fields, FR-002/FR-006) rather than creating a second row, and leaves any existing photo for that date untouched (photo removal is a separate explicit action).
- **Oversized or wrong-type photo**: An upload exceeding the configured size limit or of an unsupported image type is rejected before storage with a clear message.
- **Photo without a measurement**: Behavior is defined for whether a photo can exist on a date with no weight logged (see Assumptions).
- **No data yet**: Charts, table, and gallery all render an empty/encouraging state instead of erroring when the athlete has logged nothing.
- **Goal/target not set**: If target weight or program start date is missing, the chart still renders the curve and omits the goal line / progression zone gracefully.
- **Unit display**: Values are recorded in kilograms/centimeters; if the athlete's preference is pounds, displayed values respect that preference without changing stored data (display-only conversion).
- **Photo storage failure**: Because the photo is a separate upload action from the numeric weigh-in, a failed photo upload never affects an already-saved weigh-in; the upload itself fails with a clear, non-silent error and no orphaned record is created.

## Requirements _(mandatory)_

### Functional Requirements

**Weigh-in capture (Story 1)**

- **FR-001**: The system MUST let the athlete record a weigh-in consisting of a date (defaulting to today), a body weight, optional circumference measurements (arm, chest, thigh, shoulder, waist, neck, hip), and an optional free-text note.
- **FR-002**: The system MUST enforce at most one weigh-in entry per athlete per calendar date; saving for a date that already has an entry MUST update that entry by **merging** the provided fields over the stored row — omitted fields retain their previously stored values, so a partial re-save never erases data the athlete did not touch — and MUST leave any existing progress photo for that date unchanged.
- **FR-003**: The system MUST reject a weigh-in that contains neither a weight nor any measurement value, with a clear validation message.
- **FR-004**: The system MUST validate that weight and each circumference, when provided, are positive numbers within plausible human ranges, and reject out-of-range or non-numeric values.
- **FR-005**: The system MUST reject a weigh-in dated in the future or carrying an invalid date.
- **FR-006**: On a **new** day's entry, the system MUST persist only the fields the athlete provided, storing omitted optional measurements as absent (distinguishable from a recorded value of zero). On an **update** to an existing day, omitted fields retain their stored values (merge semantics, FR-002) rather than being nulled out.
- **FR-007**: When a weigh-in with a weight is saved, the system MUST trigger the existing automatic body-composition / lean-mass estimation as already defined in the calculators engine, without Phase 6 re-implementing that calculation.
- **FR-008**: The system MUST scope every weigh-in, measurement, and photo to the owning athlete and never expose another athlete's body data.

**Progress photos (Story 1 capture + Story 4 management)**

- **FR-009**: The system MUST let the athlete attach a single progress photo to a given date through a dedicated photo-upload action that is separate from saving the weigh-in numbers, recording the weight of that day alongside the photo as an overlay value. A failed photo upload MUST NOT alter or roll back any already-saved weigh-in for that date.
- **FR-010**: The system MUST validate uploaded photos against a configured maximum file size and an allowed set of image types, rejecting anything outside those bounds before storing it.
- **FR-011**: The system MUST store photo files through the application's storage adapter (not in the primary record store) and retain only a reference plus metadata (date, weight overlay, optional note) in the record.
- **FR-012**: The system MUST let the athlete delete a progress photo, removing both its gallery entry and its stored file.
- **FR-013**: The system MUST serve stored photos so they can be displayed in the gallery and full-screen view by the owning athlete.

**Retrieval & history (supports all stories)**

- **FR-014**: The system MUST provide the athlete's weigh-in history (weight and measurements over time) in date order for charting and tabular display.
- **FR-015**: The system MUST provide the athlete's progress-photo list in date order, each with its date and recorded weight, for the gallery.

**Weight chart (Story 2)**

- **FR-016**: The system MUST present the athlete's weight over the program as a curve plotted in date order across the program window starting at the program start date.
- **FR-017**: The system MUST draw a goal line at the athlete's target weight when a target weight is set, and omit it gracefully when it is not.
- **FR-018**: The system MUST display an ideal-progression zone representing the expected weight trajectory from starting weight to target weight across the program duration, and omit it gracefully when the inputs needed to compute it are missing.
- **FR-019**: The system MUST mark training-phase boundaries on the chart at their correct dates, derived from the program start date and each phase's duration.
- **FR-020**: The system MUST render the chart without error when the athlete has zero or one logged entries, communicating that more data is needed for a trend.

**Measurements table (Story 3)**

- **FR-021**: The system MUST present circumference measurements grouped by month, showing for each measurement the value from the latest entry in that month (the most recent measured date within the month).
- **FR-022**: The system MUST compute and display, per measurement, the signed change versus the previous month, visually distinguishing increases from decreases.
- **FR-023**: The system MUST omit a delta where a comparison value is missing (no prior-month value), rather than showing a misleading change.

**Photo gallery (Story 4)**

- **FR-024**: The system MUST present progress photos in a date-ordered grid, each showing its date and weight overlay.
- **FR-025**: The system MUST let the athlete open any photo in a full-screen view.
- **FR-026**: The system MUST let the athlete select two photos and view them side by side for before/after comparison.

**Cross-cutting**

- **FR-027**: The system MUST render empty states (no weigh-ins, no measurements, no photos) without error across the chart, table, and gallery.
- **FR-028**: The system MUST display weights and measurements according to the athlete's unit preference (kg/cm by default, pounds/inches if preferred) without altering the stored values.

### Key Entities _(include if feature involves data)_

- **Weigh-in / Body Measurement entry**: One record per athlete per date capturing body weight and optional circumferences (arm, chest, thigh, shoulder, waist, neck, hip) plus an optional note. This is the canonical source for the weight curve and the measurements table. (Backed by the existing measurements record store; one row per athlete per day.)
- **Progress Photo**: A dated image owned by the athlete, with the weight recorded that day as an overlay value and an optional note. Stored as a file reference plus metadata; powers the gallery and comparison views. (Backed by the existing progress-photo record store.)
- **Body Composition estimate**: The automatically derived body-fat % and lean body mass produced when a weigh-in with weight is saved. Consumed read-only by Phase 6 where relevant; produced by the existing calculators engine, not by this phase.
- **Athlete profile context**: Starting weight, target weight, and program start date — read-only inputs that define the chart's goal line, ideal-progression zone, and time axis.
- **Training phase**: Named program phases with durations — read-only inputs that place the phase-boundary markers on the chart.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The athlete can record a complete morning weigh-in (weight + optional measurements + note) in under 30 seconds.
- **SC-002**: A saved weigh-in is reflected in the weight chart and measurement history without any manual refresh or additional step.
- **SC-003**: 100% of saved weigh-ins respect the one-entry-per-day rule — re-logging for the same day never produces a duplicate.
- **SC-004**: The weight chart correctly positions every logged point, the goal line, the ideal-progression zone, and all phase markers for a representative 5-month dataset, verifiable against the underlying entries.
- **SC-005**: The measurements table shows a correct signed month-over-month delta for every measurement that has a prior-month value, and no delta where the prior value is absent.
- **SC-006**: The athlete can attach a photo to a weigh-in, see it appear in the gallery with the correct date and weight overlay, and place it side by side with an earlier photo for comparison.
- **SC-007**: Every chart, table, and gallery renders a clear empty state (no errors) when the athlete has logged no corresponding data.
- **SC-008**: Oversized or unsupported photo uploads are rejected before storage 100% of the time, with a message the athlete can act on.
- **SC-009**: No athlete can retrieve, view, or delete another athlete's weigh-ins, measurements, or photos.

## Assumptions

- **Reuses existing records**: Phase 6 builds on the already-defined measurements record (one entry per athlete per day, with weight and the seven circumference fields) and the already-defined progress-photo record (date, storage reference, weight overlay, note). No new physiological calculation is introduced.
- **Body composition is upstream**: Body-fat % and lean-body-mass estimation already run automatically when a weigh-in is saved (Phase 1 calculators engine). Phase 6 does not duplicate or replace that logic; it only reads the results where useful.
- **Single athlete today, multi-tenant-ready**: The app runs in single-user mode now, but all body data remains athlete-scoped so the feature works unchanged when multiple users exist.
- **Photo storage via the existing adapter**: Photos are written through the application's pluggable storage adapter (filesystem by default) and served for display; only a reference is kept in the record store. Size and type limits come from configuration, not hardcoded values. Photo upload and deletion are dedicated actions separate from saving the weigh-in numbers (see Clarifications).
- **Photo serving & privacy**: Progress photos are served through the existing static media path using opaque, athlete-scoped storage keys (the same pattern as exercise media). For single-user/local operation this satisfies athlete isolation. Because body photos are more sensitive than exercise media, an **authenticated photo-fetch path is a documented follow-up** that MUST be added before multi-user (`SINGLE_USER_MODE=false`) ships, so that SC-009 holds against URL guessing once tenants share an origin. This is out of scope for Phase 6's single-user delivery but is recorded so the multi-user milestone does not miss it.
- **One photo per date**: A given date carries at most one progress photo, uploaded through the dedicated photo action. A photo may be uploaded on a date that also has a weight entry; uploading a photo on a date with no weight is allowed, in which case the weight overlay is simply empty.
- **Ideal-progression zone definition**: The zone represents a steady, healthy lean-gain trajectory from starting weight toward target weight across the program duration (the +6 to +8 kg over 5 months goal), bounded by the program start date and total program length. Exact band width is a presentation detail tuned during planning.
- **Units**: Data is stored in kilograms and centimeters; pound/inch display is a conversion at presentation time governed by the athlete's existing unit preference and never changes stored values.
- **No editing-history audit**: Re-saving a day's entry merges the provided fields over the stored values (FR-002/FR-006) and keeps no versioned audit trail of prior values for the same date.
- **Scope boundary**: This specification covers Phase 6 only — body weight, circumference measurements, and progress photos with their charts, table, and gallery. It explicitly excludes nutrition (Phase 7), supplements (Phase 8), recovery (Phase 9), the dashboard (Phase 10), and global statistics / PDF export (Phase 11), even where those modules later consume this phase's data.
