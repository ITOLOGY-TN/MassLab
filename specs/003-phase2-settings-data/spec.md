# Feature Specification: Phase 2 — Settings & Data Management

**Feature Branch**: `003-phase2-settings-data`
**Created**: 2026-05-08
**Status**: Draft
**Input**: User description: "read PLAN.md and create a specification for the Phase 2: Settings & Data Management ONLY"

## Clarifications

### Session 2026-05-08

- Q: Weekly schedule — muscle-group identity model? → A: Per-athlete editable catalogue (`muscle_groups` table with `athlete_id`); weekly slots reference rows by id, renames propagate, merges combine references, deletions soft-archive when referenced.
- Q: App-preferences storage location? → A: Two stores by purpose — UI/UX prefs (theme, units, sounds, notification acks) in a new `athlete_preferences` table; calculator-affecting custom nutrition targets stay in `app_config.engine_overrides` so the existing engine resolver remains the single source of truth.
- Q: Custom calorie target — do macros auto-recompute? → A: Yes — a calorie-only override re-runs the macro calculator on the new calorie total via the existing engine; protein/carbs/fat overrides, when explicitly set, take precedence per-field over the auto-derived values.
- Q: JSON import — older-schema backup policy? → A: Forward-migrate older backups through a chain of one-step migrators committed alongside each schema migration; reject newer-than-current. Each successful import is recorded with both the original and the post-migration schema versions.
- Q: Audit-log on engine-override edits (custom nutrition targets)? → A: Yes — every override save or clear emits exactly one calculation-audit row carrying the engine version, the resolved constants snapshot after applying the change, and a reason tag (`override_set` / `override_cleared`).

## User Scenarios & Testing _(mandatory)_

Phase 2 turns MassLab from a seeded-only app into one the athlete can shape. It is the control panel: athlete profile, weekly training schedule, app preferences, exercise library management, and the safety net for the athlete's accumulated data (export, import, reset). Stories below are prioritised so each one ships independent value; together they make the app self-serviceable without touching the database.

### User Story 1 — Edit athlete profile and have the program react (Priority: P1)

The athlete opens Settings, updates their identity and physical inputs (name, age, height, current weight, program start date, target weight), and saves. The calorie target, macro split, and any 1RM-derived guidance update everywhere — Dashboard, Nutrition, Load Tracking — without a manual recompute step. A change to weight is visible in tomorrow's session screen as the new target macros and any updated load suggestions.

**Why this priority**: The athlete profile is the single input that feeds every calculator and every downstream module. Without an editable profile, the seeded values are frozen and the rest of the app cannot stay accurate as the athlete's body and goals change. This is the minimum viable Settings surface.

**Independent Test**: Open Settings, change the current weight by +1 kg, save, and confirm that (a) the saved value persists across reload, (b) BMR / TDEE / macro targets visible on the Nutrition screen change accordingly, and (c) a new audit row exists for the recomputation.

**Acceptance Scenarios**:

1. **Given** the athlete is viewing the profile form pre-filled with seeded values, **When** they change current weight from 58 kg to 59 kg and save, **Then** the new weight is persisted, BMR/TDEE/macros are recomputed using the engine defaults plus any overrides, and the new targets are reflected in Nutrition and Dashboard within the same session.
2. **Given** the athlete updates height or age, **When** they save, **Then** the same recomputation chain runs and the recomputation is recorded in the calculation audit log with the engine version snapshotted.
3. **Given** the athlete enters an invalid value (negative weight, age over 120, target weight equal to start weight, start date in the future beyond the 5-month horizon), **When** they try to save, **Then** the form blocks the save with a clear, field-level message and nothing is persisted.
4. **Given** the athlete changes the target weight, **When** they save, **Then** the Dashboard goal line and the projected progress zone reflect the new target without a manual reload.

---

### User Story 2 — Configure the weekly training schedule and have every dependent screen follow (Priority: P1)

The athlete decides how many days per week they train (1–7), picks which calendar days are active, and assigns a muscle group to each active day. The weekly plan view, today's-session detection, dashboard alerts, attendance/streak counters, and load-tracking trends all reflect the new configuration immediately — no second action required.

**Why this priority**: Phase 3 (Training Program), Phase 4 (Session Journal), Phase 5 (Load Tracking), and the Phase 10 Dashboard all depend on a dynamic weekly schedule. Phase 2 is where that configuration is owned. Without it, the rest of the app is locked into the seeded 5-day split.

**Independent Test**: Switch the schedule from 5 days to 4 days, drop Saturday from the active set, reassign Friday's muscle group, save, and confirm the weekly plan view, the "today's session" auto-detection, and the streak counter all reflect the new layout on the next page load.

**Acceptance Scenarios**:

1. **Given** the seeded 5-day split is active, **When** the athlete drops the day count to 4 and removes one day from the active set, **Then** the weekly plan view shows only the 4 active days as cards and the removed day appears as a rest separator.
2. **Given** the athlete reassigns a muscle group from one active day to another, **When** they save, **Then** the today's-session auto-detection on the Dashboard and Session Journal uses the new mapping starting on the next calendar day, and historical session records remain attributed to the muscle group they were logged under.
3. **Given** the athlete tries to assign two different muscle groups to the same day, or to mark zero days active, **When** they save, **Then** the form blocks the save with a message explaining the rule.
4. **Given** a session is currently in progress for a day the athlete is about to deactivate, **When** they attempt to save, **Then** the system warns that an in-progress session exists and requires explicit confirmation before applying the change; the in-progress session is preserved either way.

---

### User Story 3 — Manage the exercise library and reorder the weekly plan (Priority: P2)

The athlete adds a new exercise to the library (name, targeted muscles, instructions, alternatives, optional image / video link), edits an existing exercise, removes an exercise that is no longer used, and reorders the exercise list inside any active training day so the warm-up / compound / accessory order matches their preference.

**Why this priority**: Once the schedule is editable (Story 2), the next adjustment athletes ask for is "I want to swap leg curls for Romanian deadlifts on Fridays." Without this story, the exercise library is read-only and the weekly plan order is frozen to the seed. This is high-value but lower-stakes than profile and schedule because it does not change calculator outputs.

**Independent Test**: Add a new exercise "Bulgarian Split Squat", attach it to an active training day, reorder it to the top of that day's list, then edit its rest-time recommendation, then delete it — confirm the Phase 3 day-detail screen reflects every change in real time and that historical sessions referring to a deleted exercise still render correctly.

**Acceptance Scenarios**:

1. **Given** the athlete is in the Exercise Manager, **When** they create a new exercise with required fields filled, **Then** the exercise appears in the library and is available to attach to any active training day.
2. **Given** an exercise has historical session entries against it, **When** the athlete deletes it, **Then** the exercise is soft-removed (hidden from selection lists and the weekly plan) but historical session records continue to render its name and remain queryable in Statistics.
3. **Given** an active training day has 5 exercises in a fixed order, **When** the athlete drags exercise #5 to position #1 and saves, **Then** the new order persists and the Session Journal walks through them in the new order on the next session.
4. **Given** the athlete edits an exercise's targeted muscles or instructions, **When** they save, **Then** the change is visible everywhere the exercise is referenced (day detail, exercise detail, session screen) and is treated as a non-versioned correction (no audit row).

---

### User Story 4 — Adjust app preferences (theme, units, sounds, custom nutrition targets) (Priority: P2)

The athlete toggles dark mode, switches between kg and lbs for body-weight and load entry, turns rest-timer sounds on or off, and optionally overrides the calculator-derived calorie / protein / carb / fat targets with a custom set when their coach has told them to eat differently from what the engine recommends. Clearing the override returns the targets to the engine values.

**Why this priority**: These are quality-of-life preferences. They make the app comfortable to use day-to-day but no module is blocked without them. They are P2 because the custom-target override interacts with the calculator engine and must be implemented carefully so it cannot silently desync from the engine version.

**Independent Test**: Toggle dark mode and confirm the change is reflected on every screen and persists across reloads. Switch units to lbs, log a body weight, switch back to kg — confirm the stored value round-trips correctly. Set custom calorie target to 3500 kcal, confirm the Nutrition module uses 3500 instead of the engine value, clear the override, confirm the engine value returns.

**Acceptance Scenarios**:

1. **Given** the theme is light, **When** the athlete toggles to dark, **Then** every screen renders in the dark palette and the choice persists across reloads and across the whole app.
2. **Given** the unit system is kg, **When** the athlete switches to lbs, **Then** all weight inputs and displays show lbs while the underlying stored values remain canonical, and switching back to kg yields the original values without rounding drift beyond a single decimal place.
3. **Given** the engine's calorie target is 3300 kcal, **When** the athlete enters a custom calorie target of 3500 kcal and saves, **Then** the Nutrition module shows 3500 as the goal, the override is recorded as athlete-owned with a timestamp, and the calculator's underlying recommended value remains visible alongside as a reference.
4. **Given** rest-timer sounds are on, **When** the athlete toggles them off, **Then** the Phase 4 rest timer no longer emits the 10s and 0s beeps but continues to count down visually.
5. **Given** the athlete has a custom protein target set, **When** they later change their body weight on the profile screen, **Then** the engine recomputes the recommended protein but the custom override remains in force; the UI surfaces a hint that the recommendation has changed and offers to clear the override.

---

### User Story 5 — Export the athlete's data for backup (Priority: P3)

The athlete can download a full JSON backup of every athlete-owned record (profile, schedule, exercises, sessions, body measurements, nutrition logs, supplement check-ins, recovery entries, calculator results, app preferences) and, separately, a CSV containing only logged sessions and their sets. The export captures enough metadata (engine version, export timestamp, schema version) for a future import to be safe.

**Why this priority**: Data portability is not on the critical path to using the app, but it is the safety net before any reset and the prerequisite for the import flow in Story 6. Athletes who track months of data must be able to walk away with it.

**Independent Test**: Trigger a full JSON export, confirm the file contains all expected entity collections with non-empty arrays for the seeded athlete, and that schema version + engine version are present. Trigger a CSV sessions export, open it in a spreadsheet, confirm one row per logged set with exercise name, date, weight, reps, RPE, and session id columns.

**Acceptance Scenarios**:

1. **Given** the athlete has logged data across multiple modules, **When** they trigger "Export full backup (JSON)", **Then** they receive a single JSON file containing all athlete-owned records keyed by entity, plus an `_export` envelope with schema version, engine version, timestamp, and the athlete id.
2. **Given** the athlete has logged 12 sessions, **When** they trigger "Export sessions (CSV)", **Then** they receive a CSV with one row per logged set and a header row using human-readable column names.
3. **Given** the athlete has zero sessions, **When** they trigger CSV export, **Then** they still receive a valid CSV containing only the header row (not an error).

---

### User Story 6 — Restore the athlete's data from a JSON backup (Priority: P3)

The athlete uploads a previously exported JSON backup. The system validates the file (schema version, athlete id ownership, engine compatibility), shows a preview of what will be replaced, requires explicit confirmation, and then restores the athlete's data, replacing the current state. Failed validation aborts the import without partial writes.

**Why this priority**: Less frequent than export but critical for confidence in the reset/destroy flows in Story 7 and for migrating between machines. Marked P3 because most athletes will never use it, but when they do, correctness matters more than convenience.

**Independent Test**: Export a full JSON backup, modify a single profile field in-app, then import the backup, confirm the modified field reverts and that no data outside the athlete scope was touched.

**Acceptance Scenarios**:

1. **Given** the athlete uploads a valid JSON backup matching the current schema and the current athlete id, **When** they confirm the destructive replace, **Then** all athlete-owned records are replaced atomically with the backup contents and the import is logged with timestamp and source filename.
2. **Given** the athlete uploads a backup whose schema version is older than the current app's schema version, **When** the system processes it, **Then** the import is rejected with a message identifying the version gap; no data is written.
3. **Given** the athlete uploads a backup whose athlete id does not match the current athlete, **When** the system processes it, **Then** the import is rejected with a message that backups are scoped to a single athlete; no data is written.
4. **Given** an import begins and a write fails partway through, **When** the failure is detected, **Then** all writes from that import are rolled back and the athlete sees the pre-import state intact.

---

### User Story 7 — Reset module data with safeguards (Priority: P3)

The athlete chooses to wipe data from a single module (e.g., clear all session journal entries) or to perform a full reset that wipes every athlete-owned record except the athlete profile itself. Both flows require an explicit second confirmation step where the athlete types or taps a confirm token; the full reset additionally offers a one-click export-first option.

**Why this priority**: Resets are destructive and rarely needed, but they are part of the documented Phase 2 scope. They are P3 because the export flow (Story 5) is the prerequisite that makes reset safe.

**Independent Test**: Trigger a "reset sessions only" flow, complete the double confirmation, and confirm sessions are gone while body measurements, supplements, and the profile remain. Then trigger a full reset and confirm only the athlete profile row remains.

**Acceptance Scenarios**:

1. **Given** the athlete picks "Reset Session Journal", **When** they pass both confirmation steps, **Then** all session and set records are deleted while every other module's data is untouched.
2. **Given** the athlete picks "Full reset", **When** they pass both confirmation steps, **Then** every athlete-owned record except the profile is deleted, including app preferences and engine overrides which revert to defaults.
3. **Given** the athlete picks "Full reset", **When** they choose "Export first", **Then** a full JSON backup is generated and downloaded before the destructive operation begins.
4. **Given** the athlete fails the second confirmation step (closes the dialog, types the wrong token), **When** the reset would otherwise execute, **Then** no records are deleted and the action is treated as cancelled.

---

### Edge Cases

- The athlete changes their biological sex on the profile — the BMR formula switches between the male and female Mifflin-St Jeor variant; recomputation is triggered and the audit row records the change.
- The athlete deactivates a day that has a session scheduled for "today" — the today's-session card on the Dashboard immediately shows the rest-day state.
- The athlete has set a custom calorie target that is below the engine's BMR estimate — the form warns this is below maintenance but allows the override with explicit confirmation.
- The athlete renames a muscle group used on multiple days — the rename applies everywhere, including in historical session views.
- An exercise is deleted while it is the currently-selected next exercise in an in-progress session — the in-progress session keeps the exercise visible until completion; the deletion takes effect for future sessions only.
- The unit system is switched mid-session — quick-buttons (+2.5 / -2.5) and displayed weights update to the new unit immediately, the in-flight session continues to log canonically.
- A backup file is uploaded that exceeds a reasonable size limit (e.g., a corrupted or tampered file with millions of fake rows) — the import is rejected with a size-limit message before any parsing.
- The athlete clears a custom nutrition target while the engine has since changed its recommended value (e.g., due to weight changes) — the new engine value is adopted immediately and the change is visible on the next Nutrition view.
- The full reset is triggered but the export-first option fails to produce a file — the destructive step is blocked and the athlete is asked whether to retry the export or cancel.

## Requirements _(mandatory)_

### Functional Requirements

**Athlete profile**

- **FR-001**: Settings MUST allow the athlete to view and edit their full profile: display name, biological sex, age, height (cm), current weight (kg), program start date, target weight (kg), morphotype, activity level, sessions per week, available equipment, and known injuries.
- **FR-002**: Saving a profile change MUST recompute every dependent calculator output (BMR, TDEE, macro targets, body composition, derived load guidance) by calling the engine layer that already exists in Phase 1.
- **FR-003**: Each persisted recomputation triggered by a profile save MUST be appended to the calculation audit log with the current engine version and resolved constants snapshot.
- **FR-003a**: Each save or clear of an engine override (custom nutrition targets, including the auto-derived macro recompute path in FR-017a) MUST append exactly one row to the calculation audit log carrying the current engine version, the resolved constants snapshot computed _after_ the override change, and a reason tag (`override_set` for any save, `override_cleared` for any clear). Idempotent re-saves and no-op clears MUST still emit one row each so the override history reads linearly.
- **FR-004**: Profile inputs MUST be validated at the boundary: numeric ranges (age 13–100, height 100–250 cm, weight 30–250 kg, target weight differs from current weight by no more than ±50 kg, start date within ±12 months of today), and required fields MUST block save with field-level messages when violated.
- **FR-005**: All profile fields MUST be scoped to a single `athlete_id` row even in single-user mode and MUST never be writeable across athlete boundaries.

**Weekly training schedule**

- **FR-006**: Settings MUST let the athlete set the number of training days per week between 1 and 7, choose which calendar days are active vs rest, and assign exactly one muscle group to each active day; the muscle group MUST be selected from the athlete's own muscle-group catalogue (see FR-006a/b/c).
- **FR-006a**: Each athlete MUST own a `muscle_groups` catalogue (rows scoped by `athlete_id`) seeded on first run with the default split (Chest+Triceps, Back+Biceps, Legs-Quads, Shoulders+Traps, Legs-Hams+Glutes); the athlete MUST be able to add new entries and rename existing entries from Settings.
- **FR-006b**: Renaming a muscle group MUST propagate to every screen that reads it (weekly plan, dashboard, load tracking, statistics, historical session views) without rewriting historical session rows; the rename is achieved by updating the catalogue row, not by string substitution.
- **FR-006c**: The athlete MUST be able to merge two muscle-group rows (all weekly slots and historical references repointed to the surviving row) and to soft-archive an unused entry; an entry referenced by any historical session or active weekly slot MUST NOT be hard-deleted.
- **FR-007**: Saving the schedule MUST take effect immediately for: the weekly plan view, the today's-session auto-detection, dashboard alerts, the streak counter, and the attendance heatmap. No cache invalidation step MUST be required from the athlete.
- **FR-008**: The system MUST forbid configurations with zero active days, with the same muscle-group row assigned to two different active days in the same week, or with a muscle-group display name exceeding a defined character limit (e.g., 40 chars).
- **FR-009**: Historical session records MUST remain attributed to the muscle group they were originally logged under even if the schedule is later changed; because slots and sessions reference catalogue rows by id, this is preserved automatically and is not dependent on the display name remaining unchanged.
- **FR-010**: Saving a schedule change while a session is in progress for a day being deactivated MUST require an explicit second confirmation, and MUST NOT discard or modify the in-progress session record.

**Exercise manager**

- **FR-011**: The athlete MUST be able to create, edit, and remove exercises; the exercise schema MUST include name, targeted muscles, step-by-step instructions, key technique points, optional image reference, optional video reference, and a list of alternative exercises.
- **FR-012**: Removing an exercise that has historical session references MUST soft-delete it (hide from pickers and the weekly plan) while preserving the row so historical session views continue to render its name; a removed exercise without history MAY be hard-deleted.
- **FR-013**: The athlete MUST be able to attach exercises to any active training day and reorder them within that day; the order MUST persist and MUST be the order followed by the Session Journal.
- **FR-014**: Exercise edits (text, instructions, media) MUST propagate to every screen that references the exercise without versioning history.

**App preferences**

- **FR-015**: The athlete MUST be able to toggle theme (light / dark), rest-timer sounds (on / off), and unit system (kg / lbs).
- **FR-016**: The unit system MUST affect input controls and display only; canonical storage MUST remain in kilograms, and round-trip conversions MUST not introduce drift greater than 0.1 kg.
- **FR-017**: The athlete MUST be able to set custom daily calorie, protein, carbohydrate, and fat targets that override the engine-computed values for the Nutrition module; these overrides MUST be written into the existing `app_config.engine_overrides` JSONB so the Phase 1 engine resolver (defaults ⊕ override) remains the single source of truth. Clearing a custom target MUST restore the engine value.
- **FR-017a**: When the athlete sets a custom _calorie_ target without explicit macro overrides, the macro calculator MUST re-run on the new calorie total using the engine's standard rules (protein floor 2.2 g/kg LBM, fat floor 25 % of calories, carbs fill the remainder, morphotype adjustment); the resulting protein/carbs/fat targets MUST be treated as engine-derived (not as athlete overrides) so clearing the calorie override fully reverts to the original engine values.
- **FR-017b**: When the athlete explicitly sets a per-macro override (protein, carbs, or fat) it MUST take precedence over the auto-derived value for that single macro; the other macros MUST continue to be auto-derived from the prevailing calorie target. Setting all three macro overrides effectively pins the entire split.
- **FR-018**: When a custom target override is in force and the engine's recommended value subsequently changes (due to a profile change), the system MUST keep the override active and surface a non-blocking notice exactly once that the recommendation has changed; acknowledgement of that notice MUST be recorded in `athlete_preferences` so the same notice is not re-shown for the same recommendation delta.
- **FR-019**: UI/UX preferences (theme, units, sounds, notification acknowledgements) MUST be persisted in a new per-athlete `athlete_preferences` table (one row per athlete, scoped by `athlete_id`, with its own RLS shipped in the same migration). They MUST NOT be co-mingled with `engine_overrides` so the calculator engine has no dependency on UI state.

**Data export**

- **FR-020**: The athlete MUST be able to trigger a full JSON export containing every athlete-owned record across all current and future modules, plus an `_export` envelope with: schema version, engine version, export timestamp (ISO-8601, UTC), and athlete id.
- **FR-021**: The athlete MUST be able to trigger a CSV export of all logged sets across all sessions, with human-readable column headers, and the export MUST succeed (header-only file) when no sessions exist.
- **FR-022**: Exports MUST exclude any cross-athlete or system-only data and MUST NOT include keys, secrets, or auth tokens.

**Data import**

- **FR-023**: The athlete MUST be able to upload a previously exported JSON backup; the system MUST validate schema version compatibility, athlete-id ownership, and structural integrity before any write.
- **FR-023a**: When the backup's schema version is older than the current app's schema version, the system MUST forward-migrate the in-memory backup through the chain of one-step migrators committed alongside each schema migration; if any required migrator is missing the import MUST be rejected with a message identifying the gap. When the backup's schema version is newer than the current app's schema version, the import MUST be rejected outright.
- **FR-024**: A successful import MUST replace the athlete's current data atomically — either every athlete-owned record from the backup (after any forward migration) is restored, or no change is persisted.
- **FR-025**: A failing import (schema-newer-than-current, missing migrator, ownership mismatch, partial-write failure, oversized payload, structural validation failure) MUST leave the pre-import state intact and MUST surface a message identifying which validation failed.
- **FR-026**: A successful import MUST be recorded with the timestamp, source filename, the engine version of the backup, and **both** the original schema version of the file and the schema version it was migrated to before being written.

**Reset**

- **FR-027**: The athlete MUST be able to reset a single module's data (sessions, body measurements, nutrition logs, supplement check-ins, recovery entries, calculator results) without affecting other modules or the profile.
- **FR-028**: The athlete MUST be able to perform a full reset that wipes every athlete-owned record except the profile row; engine overrides and app preferences MUST also be cleared back to defaults.
- **FR-029**: Both reset flows MUST require two distinct confirmation steps, the second of which MUST require an explicit token (typed phrase or matching tap) rather than a single-click confirm.
- **FR-030**: The full reset flow MUST offer a one-click "Export first" path that produces a full JSON backup before any deletion; if that backup fails, the destructive step MUST be blocked.

**Cross-cutting**

- **FR-031**: Every Settings mutation MUST be available through a versioned HTTP endpoint under `/api/v1/` and MUST flow through the existing controller / service layering — no `@supabase/supabase-js` import outside the data-access layer.
- **FR-032**: All Settings reads and writes MUST be scoped by the resolved `athlete_id` from the auth/single-user middleware; the system MUST refuse any request that resolves to no athlete.

### Key Entities _(include if feature involves data)_

- **Athlete profile**: The single row per athlete representing identity, physical inputs, goal inputs, lifestyle inputs, and the current/target program horizon. Source of truth for every calculator input.
- **Weekly schedule**: Per-athlete configuration describing day count (1–7), the active set of calendar days, and the muscle-group reference assigned to each active day. Consumed by every training-related module.
- **Muscle group**: A row in the per-athlete muscle-group catalogue (`muscle_groups` keyed by `athlete_id` + display name). Referenced by id from weekly schedule slots and historical session records; renames update the catalogue row in place; merges and soft-archives are first-class operations. Seeded with the default 5-day split on first run.
- **Exercise**: A named training movement with descriptive content (instructions, technique points, media, alternatives). Soft-deletable when historical sessions reference it.
- **Weekly plan slot**: The ordered association between an active day and an exercise — what the athlete will do, in what order, on a given day of the week.
- **Athlete preferences**: A new per-athlete row (`athlete_preferences`, keyed by `athlete_id`) holding UI/UX state only — theme, unit system, rest-timer sounds, and notification acknowledgements (e.g., the "recommendation changed" hint). No calculator inputs live here.
- **Engine override**: The existing `app_config.engine_overrides` JSONB. Continues to be the single calculator-input override store; Phase 2 adds custom nutrition targets to it (calorie / protein / carbs / fat). Read by the Phase 1 resolver via `resolveConstants(override)`. Cleared by a full reset.
- **Backup envelope**: The structured JSON payload produced by export and consumed by import; carries schema version, engine version, timestamp, athlete id, and one collection per athlete-owned entity.
- **Audit entry**: A row appended to the calculator audit log every time a profile change triggers a recomputation; carries engine version and resolved constants. Already defined in Phase 1.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: The athlete can update any profile field and see every dependent target (calories, macros, load suggestions) reflect the change on the next screen they open in under 2 seconds, with zero manual recompute action.
- **SC-002**: 100% of profile saves that change a calculator input produce exactly one calculation audit row carrying the active engine version.
- **SC-003**: A change to the weekly schedule is reflected on the weekly plan view, the dashboard, the today's-session detection, and the streak counter on the very next render — no stale cache visible to the athlete in any of those four surfaces.
- **SC-004**: 0% of historical session records change muscle-group attribution when the weekly schedule is edited; this is verifiable by snapshotting historical rows before and after a schedule change.
- **SC-005**: An exercise deletion never breaks a historical session view: 100% of sessions logged before the deletion still render the exercise name correctly afterwards.
- **SC-006**: Switching unit systems (kg ↔ lbs ↔ kg) on a logged body weight introduces no drift beyond ±0.1 kg.
- **SC-007**: A custom nutrition-target override remains in force across at least one profile change that would otherwise have shifted the engine recommendation, and the athlete is shown a non-blocking notice exactly once per such change.
- **SC-008**: A full JSON export of an athlete with at least 30 days of logged data completes in under 5 seconds from click to file ready, and the resulting file passes structural validation against the current schema.
- **SC-009**: A round-trip (export → modify a profile field → import the export) restores the modified field to its pre-modification value with 100% byte-identical equality on the restored row.
- **SC-010**: 100% of failed imports leave the database state unchanged from before the import attempt — verifiable by hashing the athlete's record set before and after a deliberately corrupted upload.
- **SC-011**: A full reset reduces athlete-owned records to exactly the single profile row and the seeded calculator/exercise/quote catalogues; preferences and engine overrides return to documented defaults.
- **SC-012**: 0% of destructive resets execute without the athlete passing both confirmation steps; this is verifiable by automated tests that close the second-confirmation dialog and assert no rows were deleted.

## Assumptions

- The athlete operates the app in single-user mode (`SINGLE_USER_MODE=true`); the auth middleware injects the seeded athlete id on every request, and Settings reads/writes inherit that scope without change.
- Phase 1's calculator engine, audit-log writer, and engine-override mechanism are already in place and are the only pathway for recomputation; Phase 2 does not redefine formulas or duplicate audit logic.
- Tables persisting Phase 2 state already exist or will be added by a forward-only migration that ships with this feature, including any extension to `app_config` for app preferences and any new `weekly_schedule` or `weekly_plan_slot` rows; each new table includes `athlete_id` and ships its own RLS in the same migration.
- The Frontend Design skill is used for the entire Settings UI; visual treatment is premium, sport-focused, and consistent with the rest of the app.
- The unit system affects display and input only; canonical storage remains kilograms across all body-weight, load, and food entries.
- The CSV sessions export uses comma separator and UTF-8 encoding with a BOM only when the runtime detects the file is being prepared for spreadsheet apps that require it; otherwise plain UTF-8.
- The export and import envelope schema is versioned starting at `1` for this feature; every future schema bump MUST ship with a one-step forward migrator (`backup-migrators/v<from>-to-v<to>.js`) so the import path can transparently upgrade older backups. Newer-than-current backups remain hard-rejected.
- A "module" for selective reset is one of: session journal, body measurements + photos, nutrition logs, supplement check-ins, recovery entries, calculator results, or app preferences. The athlete profile row itself is never wiped by selective reset and is preserved by full reset.
- "Soft-deletion" of an exercise is implemented by an `is_active` flag plus filtering in pickers; no separate archive table is introduced.
- AI generation remains out of scope per the constitution — Phase 2 introduces no AI-driven defaults, suggestions, or write paths.
