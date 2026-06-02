# Feature Specification: Training Program & Exercise Library

**Feature Branch**: `006-training-program-library`  
**Created**: 2026-06-02  
**Status**: Draft  
**Input**: User description: "Phase 3: Training Program & Exercise Library — weekly planning view, day detail, exercise detail pages"

## Overview

Phase 3 gives the athlete a way to **browse and consult** the training program that earlier phases let them configure. Phase 2 already built the editable weekly schedule (training days, the muscle group assigned to each day, exercise order within a day) and the exercise manager (create/edit/delete exercises). Phase 1 already produces the estimated 1RM (Epley) and progression flags. **Phase 3 is the read-and-understand layer on top of that data**, plus the exercise-level enrichment the athlete consults before and during training:

1. A **weekly planning view** that shows the whole week at a glance.
2. A **day detail view** that lists the exercises planned for one day, with the last weight used and a progression indicator.
3. An **exercise detail page** with full instructions, technique, media, alternatives, recent history, estimated 1RM, and a load recommendation.

This phase introduces two new data concepts (alternative-exercise links and exercise media uploads) and consumes session history that the Phase 4 Session Journal will populate. Where history does not yet exist, the views render clear empty states rather than failing.

## Clarifications

### Session 2026-06-02

- Q: Should the exercise-detail "estimated 1RM" be Epley-only (per PLAN.md), the engine's 4-formula blend, or the stored records? → A: Use the existing engine estimate (`primary_estimate_kg`, the Epley+Brzycki+Lander+Lombardi average) computed from the athlete's heaviest completed set; PLAN.md's "Epley" is treated as shorthand for the engine estimate.
- Q: What does "last weight used" mean? → A: The heaviest completed set in the most recent session that contains the exercise (warm-up/incomplete sets ignored).
- Q: How is "recommended working load" computed? → A: Reuse the progression engine — when the exercise has an active `add_load` flag, recommend last weight + the engine's `load_increment`; otherwise hold the last weight.
- Q: How do alternative-exercise links behave? → A: One-directional — A→B is a single directed link shown only on A's page; no automatic reciprocal link.

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See the whole training week at a glance (Priority: P1)

The athlete opens the training program and sees their configured week laid out: one card per training day showing the muscle group, a color badge, and how many exercises are planned. Rest days appear as a compact separator rather than full cards, so the rhythm of the week (e.g. Mon / Tue / Wed / rest / Fri / Sat / rest) is immediately readable. Tapping a training day card opens that day's detail.

**Why this priority**: This is the entry point to the entire training experience and the screen that orients the athlete. It is viable on its own — even with no session history and no exercise enrichment, a correct weekly overview that reflects the athlete's actual schedule delivers value and validates that the schedule configuration from Phase 2 reads back correctly.

**Independent Test**: With a configured schedule (default 5-day split), load the weekly planning view and confirm it shows exactly the configured training days as cards (each with muscle group, color, exercise count) and the non-training days as compact rest separators, in correct week order. Changing the schedule in Settings and returning reflects the new configuration.

**Acceptance Scenarios**:

1. **Given** the default 5-day split is configured, **When** the athlete opens the weekly planning view, **Then** five training-day cards are shown (Chest+Triceps, Back+Biceps, Legs Quads, Shoulders+Traps, Legs Hams+Glutes) each with its muscle group name, color badge, and the count of exercises assigned to that day, and the two rest days appear as compact separators.
2. **Given** a training day with three assigned exercises, **When** the weekly planning view renders that day's card, **Then** the card shows an exercise count of 3.
3. **Given** the athlete changes the schedule in Settings to 4 training days, **When** they return to the weekly planning view, **Then** four training-day cards and three rest separators are shown, in week order.
4. **Given** a training day that has a muscle group assigned but no exercises yet, **When** the card renders, **Then** it shows an exercise count of 0 and remains openable.
5. **Given** the athlete taps a training-day card, **When** the tap is registered, **Then** the day detail view for that day opens.

---

### User Story 2 - Review one day's planned exercises with progress context (Priority: P1)

The athlete opens a training day and sees the ordered list of exercises planned for it. Each exercise shows its target sets and rep range, the last weight used for that exercise, and a progression indicator telling them whether they are ready to increase the load, holding stable, or regressing. From this list the athlete can open any exercise's detail page.

**Why this priority**: This is the screen the athlete checks right before a session to know what to do and what to lift. It turns the static plan into actionable guidance. It depends on US1 conceptually (it is reached from the week view) but is independently testable with seeded plan data.

**Independent Test**: Open a day that has an ordered exercise list and confirm the exercises appear in their configured order, each showing target sets/reps and — when session history exists — the last weight used and a progression indicator. With no history, the row shows a neutral "no data yet" state for weight and indicator.

**Acceptance Scenarios**:

1. **Given** a day with exercises ordered 1..n, **When** the day detail view loads, **Then** the exercises appear in that exact order, each showing target sets and target rep range.
2. **Given** an exercise that has logged sets in past sessions, **When** the day detail row renders, **Then** it shows the most recent weight used for that exercise.
3. **Given** an exercise that has an active progression flag, **When** the row renders, **Then** it shows the matching indicator: "ready to increase", "stable", or "regressing".
4. **Given** an exercise with no logged history yet, **When** the row renders, **Then** the last-weight and progression indicator show a neutral empty state and the row is still openable.
5. **Given** the athlete taps an exercise row, **When** the tap is registered, **Then** that exercise's detail page opens.

---

### User Story 3 - Consult an exercise in full detail (Priority: P2)

The athlete opens an exercise and sees everything needed to perform it correctly and progress on it: name and targeted muscles, step-by-step instructions, key technique points, an image, a video (YouTube link or uploaded local video), a list of alternative exercises, the last five sessions in which this exercise was performed, the current estimated 1RM (Epley), and a recommended working load.

**Why this priority**: This is the reference screen the athlete returns to when learning or refining an exercise. It is high value but builds on the browse layer (US1/US2) and introduces the most new data (media, alternatives, history rollups), so it follows the two browsing stories.

**Independent Test**: Open an exercise detail page for a seeded exercise and confirm it renders name, targeted muscles, instructions, technique points, image/video when present, alternative exercises when linked, the estimated 1RM and load recommendation when history exists, and a clear empty state for the history-dependent sections when none exists.

**Acceptance Scenarios**:

1. **Given** a seeded exercise, **When** its detail page loads, **Then** it shows the exercise name, targeted muscles, full instructions, and technique points.
2. **Given** an exercise with an image URL and a video reference (YouTube link or uploaded video), **When** the page renders, **Then** the image is displayed and the video is playable/embedded.
3. **Given** an exercise with one or more linked alternatives, **When** the page renders, **Then** each alternative is listed and links to its own detail page.
4. **Given** an exercise performed in at least one prior session, **When** the page renders, **Then** it lists up to the five most recent sessions with that exercise (date and the working sets), shows the current estimated 1RM (Epley), and shows a recommended working load.
5. **Given** an exercise with no recorded history, **When** the page renders, **Then** the last-5-sessions, estimated-1RM, and load-recommendation sections show clear empty states and the static content (instructions, technique, media, alternatives) still renders.

---

### User Story 4 - Manage exercise enrichment: media and alternatives (Priority: P3)

The athlete attaches a reference image, sets a video (YouTube link or uploaded local file), and links alternative exercises to an exercise, so the detail page in US3 has rich content. Removing or changing any of these is equally possible.

**Why this priority**: Enrichment makes the detail page valuable but is not required for the program to be browsable. It is the last slice because US3 can ship reading whatever media/alternatives already exist (e.g. from seeds) before in-app editing is added.

**Independent Test**: For an exercise, add an image, set a YouTube link and separately an uploaded video, and link two alternatives; confirm each persists and appears on the detail page, and that each can be removed.

**Acceptance Scenarios**:

1. **Given** an exercise, **When** the athlete uploads a reference image, **Then** the image is stored and appears on the exercise detail page.
2. **Given** an exercise, **When** the athlete sets a YouTube link or uploads a local video, **Then** the video reference persists and is playable on the detail page.
3. **Given** an exercise, **When** the athlete links another exercise as an alternative, **Then** the link persists and the alternative appears on the detail page.
4. **Given** an exercise the athlete tries to link as its own alternative, **When** they attempt to save, **Then** the system rejects the self-link.
5. **Given** an exercise with an existing image, video, or alternative, **When** the athlete removes it, **Then** the item no longer appears on the detail page.

---

### Edge Cases

- **No schedule configured / zero training days**: the weekly planning view shows an empty-week state directing the athlete to Settings, rather than a blank screen.
- **Archived/inactive exercise still referenced by a day slot**: the day detail view still shows the slot but visibly marks the exercise as archived; its detail page remains viewable.
- **Muscle group renamed or reassigned in Settings**: the planning and day views reflect the new name/color on next load (no stale labels).
- **Alternative exercise later deleted**: the alternative link is dropped from the detail page automatically and does not produce a broken link.
- **Exercise with logged history but missing rep/weight on some sets**: the last-weight and 1RM computations ignore incomplete sets and still render a result from the valid ones.
- **Day with a muscle group but no exercises**: both the week card and the day detail render with a "no exercises assigned" state, not an error.
- **Same exercise appearing on multiple days**: history, 1RM, and progression are computed per exercise (not per day), so they read consistently wherever the exercise appears.
- **Uploaded media exceeding the configured size limit or an unsupported type**: the upload is rejected with a clear message and the prior media is preserved.

## Requirements _(mandatory)_

### Functional Requirements

#### Weekly planning view

- **FR-001**: System MUST present the athlete's configured week as an ordered set of training-day cards and rest-day separators, derived from the current schedule configuration (not a hardcoded 7-day map).
- **FR-002**: Each training-day card MUST display the assigned muscle group name, its color badge, and the count of exercises assigned to that day.
- **FR-003**: Rest days MUST be rendered as a compact separator, visually distinct from and lighter than training-day cards.
- **FR-004**: The weekly planning view MUST reflect the current schedule on each load, including changes made in Settings (training-day count, day assignment, muscle group, color).
- **FR-005**: Selecting a training-day card MUST navigate to that day's detail view.
- **FR-006**: When no training days are configured, the view MUST show an empty-week state that points the athlete to schedule configuration.

#### Day detail view

- **FR-007**: The day detail view MUST list that day's exercises in their configured order.
- **FR-008**: Each exercise row MUST show the planned target sets and target rep range.
- **FR-009**: Each exercise row MUST show the last weight used for that exercise — defined as the heaviest **completed** set in the most recent session containing the exercise — when session history exists, and a neutral empty state when it does not. Warm-up and incomplete sets are excluded.
- **FR-010**: Each exercise row MUST show a progression indicator with one of three states — ready to increase, stable, or regressing — based on the athlete's current progression flag for that exercise, and a neutral state when none exists.
- **FR-011**: Selecting an exercise row MUST navigate to that exercise's detail page.
- **FR-012**: A day with no assigned exercises MUST render a "no exercises assigned" state rather than an error.

#### Exercise detail page

- **FR-013**: The exercise detail page MUST display the exercise name, targeted muscles, step-by-step instructions, and key technique points.
- **FR-014**: The page MUST display the exercise image when present and a playable video when a YouTube link or uploaded video is present.
- **FR-015**: The page MUST list linked alternative exercises, each navigable to its own detail page, and MUST omit the section gracefully when there are none.
- **FR-016**: The page MUST show the up-to-five most recent sessions in which the exercise was performed, including each session's date and working sets, when history exists.
- **FR-017**: The page MUST show the current estimated 1RM using the existing calculator engine's primary estimate (`primary_estimate_kg`, the average of Epley, Brzycki, Lander, and Lombardi), computed from the athlete's heaviest completed set in recent history, when sufficient history exists.
- **FR-018**: The page MUST show a recommended working load derived from the progression engine: when the exercise has an active `add_load` flag, the recommendation is the last weight used plus the engine's `load_increment`; otherwise it holds the last weight used. Shown only when sufficient history exists.
- **FR-019**: When no history exists, the history-dependent sections (recent sessions, estimated 1RM, load recommendation) MUST show clear empty states while static content still renders.

#### Exercise enrichment (media & alternatives)

- **FR-020**: Athletes MUST be able to attach and remove a reference image for an exercise.
- **FR-021**: Athletes MUST be able to set a video for an exercise as either a YouTube link or an uploaded local video, and to remove it.
- **FR-022**: Athletes MUST be able to link and unlink other exercises as alternatives for an exercise. Links are one-directional — linking A→B makes B appear as an alternative on A's page only; no reciprocal B→A link is created automatically.
- **FR-023**: The system MUST reject linking an exercise as its own alternative and MUST reject duplicate alternative links (the same A→B link cannot be created twice).
- **FR-024**: Uploaded media MUST be validated against an allowed type set and a configured size limit; rejected uploads MUST preserve any existing media and return a clear message.

#### Cross-cutting

- **FR-025**: All training-program and exercise data MUST be scoped to the current athlete; no cross-athlete data may be read or written.
- **FR-026**: All history-derived figures (last weight, recent sessions, estimated 1RM, load recommendation, progression indicator) MUST be computed read-only in this phase; capturing new session data is out of scope (Phase 4).
- **FR-027**: Computations that depend on logged sets MUST ignore incomplete or invalid sets and still produce a result from the valid remainder.

### Key Entities _(include if feature involves data)_

- **Weekly plan slot** _(existing)_: a single day's training assignment — day of week, assigned muscle group, color, order. Consumed by the weekly planning and day detail views.
- **Weekly plan exercise** _(existing)_: the ordered placement of an exercise within a day's slot, with target sets and target rep range.
- **Exercise** _(existing, enriched)_: name, targeted muscles, instructions, technique points, image reference, video reference, active/archived state. Phase 3 reads all of these and lets the athlete edit media.
- **Exercise alternative link** _(new)_: an athlete-owned association between a source exercise and an alternative exercise; directional, no self-links, no duplicates.
- **Session set** _(existing, read-only here)_: a logged set (exercise, weight, reps, RPE, completion) used to derive last weight and recent-session history. Populated by Phase 4.
- **Progression flag** _(existing, read-only here)_: the current per-exercise progression state used to render the day-detail indicator.
- **1RM record / estimate** _(existing, read-only here)_: the Epley-based estimate surfaced on the exercise detail page.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: From the training program entry point, the athlete can identify any training day's muscle group and exercise count without opening the day — 100% of configured training days are represented as cards and 100% of rest days as separators, in correct week order.
- **SC-002**: The weekly planning view reflects a schedule change made in Settings within one reload, with zero stale day/muscle-group/color labels.
- **SC-003**: For any exercise that has session history, the day detail row and exercise detail page show the same last-weight value and a progression indicator that matches the athlete's current flag, with no contradiction between the two screens.
- **SC-004**: 100% of exercises render a usable detail page regardless of history — exercises with no logged sets still show full static content and clear empty states for history-dependent sections, with no errors.
- **SC-005**: The athlete can attach an image, set a video, and link an alternative to an exercise and see all three reflected on the detail page, and can remove each, with changes persisting across reloads.
- **SC-006**: Invalid enrichment actions are prevented — self-links and duplicate alternative links are rejected, and oversized/unsupported uploads are rejected while preserving existing media — in 100% of attempts.
- **SC-007**: The athlete can go from the weekly view to a specific exercise's full instructions in no more than two taps (day card → exercise row).

## Assumptions

- **Schedule configuration is reused, not rebuilt**: choosing training days, assigning a muscle group to a day, and reordering exercises within a day already exist from Phase 2. Phase 3 consumes that configuration and does not re-specify it. The only schedule-adjacent editing introduced here is exercise enrichment (media and alternatives).
- **Session history is read-only in this phase**: last weight used, recent-session lists, estimated 1RM, and load recommendations are derived from already-logged session data. The Phase 4 Session Journal populates that data; until it exists, these surfaces show empty states. This phase does not capture new sessions.
- **Progression indicator source**: the ready/stable/regressing indicator is read from the existing progression-flag mechanism (Phase 1) rather than recomputed in this phase.
- **Estimated 1RM source**: the estimate uses the existing Phase 1 calculator engine's `primary_estimate_kg` (the average of Epley, Brzycki, Lander, and Lombardi) fed from the athlete's heaviest completed set; Phase 3 surfaces it but does not introduce a new formula. PLAN.md's reference to "Epley" is treated as shorthand for this engine estimate.
- **Media storage reuse**: uploaded images and videos use the existing storage adapter and configured size/type limits; YouTube videos are referenced by link only and are not downloaded.
- **Alternatives are athlete-owned and one-directional**: an alternative link is stored per athlete from a source exercise to a target and is shown only on the source's page; no reciprocal link is auto-created.
- **Single-user / single-locale for now**: the current athlete operates in one locale (matching seeded exercise content); multi-locale exercise content is out of scope for this phase.
- **No AI**: instructions, alternatives, and recommendations are sourced from stored data and deterministic engine output, consistent with the project's no-AI-until-later boundary.

## Dependencies

- **Phase 1 (Calculators Engine)**: provides the Epley 1RM estimate and the progression-flag mechanism surfaced in the day and exercise views.
- **Phase 2 (Settings & Data Management)**: provides the editable weekly schedule, muscle groups, and exercise CRUD that this phase reads.
- **Phase 4 (Session Journal)**: will populate the session-set history that powers last-weight, recent-sessions, and load-recommendation surfaces. Phase 3 is built to degrade gracefully until that data exists.
- **Existing storage adapter**: required for image and local-video uploads.
