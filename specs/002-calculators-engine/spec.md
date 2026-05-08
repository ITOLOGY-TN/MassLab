# Feature Specification: Phase 1 — Calculators Engine

**Feature Branch**: `002-calculators-engine`
**Created**: 2026-05-07
**Status**: Draft
**Input**: User description: "/MassLab/PLAN.md create a specification for phase 1 only"

## Clarifications

### Session 2026-05-07

- Q: When a program is regenerated, what happens to the previous program? → A: Soft-archive: keep history with `superseded_at` + `is_active`; only one program is "active" per athlete; old rows readable via a program-history lookup.
- Q: When does a progression flag clear? → A: Auto-clear on next rule evaluation for the same exercise/scope: each new evaluation supersedes the prior flag for that scope; only the latest flag per scope is active.
- Q: Where do the configurable engine constants live? → A: Defaults in a code constants module; per-athlete overrides stored in `app_config` (extend with engine fields or a JSONB `engine_overrides` column). Engine reads defaults ⊕ override.
- Q: How is the "Calculation result" audit log stored? → A: Single shared `calculation_results` audit table; written on persisted runs only (not Calculators-page ad-hoc runs). Typed tables stay the primary read path; the audit table is replay-only.
- Q: Which UI surfaces ship in Phase 1? → A: The Calculators page (US6) plus a minimal read-only Nutrition view of the persisted daily targets and macros. Dashboard, Load Tracking, and Statistics remain deferred to their owning phases.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Personalized Daily Nutrition Targets From the Profile (Priority: P1)

The athlete's profile (age, biological sex, weight, height, morphotype, goal, activity level) drives a complete set of daily nutrition targets — total calories, protein grams, carbohydrate grams, and fat grams — without any manual computation. The numbers are precise, reproducible, and consistent across the entire app: the same targets seen on the Nutrition page are also what the Dashboard, Statistics, and program output rely on.

**Why this priority**: Nutrition is the single largest day-to-day driver of muscle gain. Without trustworthy daily targets the athlete cannot evaluate whether they ate enough on any given day, and every downstream view (calorie progress bars, macro pies, weekly trends) loses its anchor. This is the foundation that the whole nutrition module reads from.

**Independent Test**: Update the athlete profile with a known weight, height, age, sex, morphotype, goal, and activity level; the system returns four daily numbers (calories, protein g, carbs g, fat g) that satisfy the documented rules: protein meets the lean-body-mass target, fat covers at least 25 % of total calories, calories match the maintenance-plus-surplus rule for the chosen goal, and the macro grams sum (within rounding) to the calorie total.

**Acceptance Scenarios**:

1. **Given** an athlete profile with all required physical fields, **When** the targets are requested, **Then** four daily numbers are returned: calories (kcal), protein (g), carbohydrates (g), fat (g).
2. **Given** the goal is "bulk" with the default surplus, **When** the calorie target is computed, **Then** it equals the maintenance value plus the configured surplus (default +400 kcal).
3. **Given** the goal is "cut" with the default deficit, **When** the calorie target is computed, **Then** it equals the maintenance value minus the configured deficit.
4. **Given** the morphotype is "ectomorph", **When** macros are computed, **Then** carbohydrates take a larger share of calories than for "mesomorph" or "endomorph" with the same calorie total.
5. **Given** any valid profile, **When** macros are computed, **Then** protein grams are at least the prescribed grams-per-lean-body-mass target and fat is no less than 25 % of total calories.
6. **Given** the same profile is submitted twice, **When** targets are computed, **Then** the two results are identical to the gram.

---

### User Story 2 — Trustworthy Working-Weight Recommendation From a Single Lift (Priority: P1)

After the athlete logs a single set on an exercise (a weight and a rep count), the system gives them an estimated one-rep maximum and a recommended working-weight table at standard training percentages. The recommendation is the only number the athlete needs in order to know what to load on the bar next session.

**Why this priority**: Loading the bar correctly is the central decision of every training session. A trustworthy 1RM and percentage table replaces guesswork, makes progressions verifiable, and feeds every progression flag in later phases. Without it the rest of Load Tracking (Phase 5) has nothing to compare against.

**Independent Test**: Provide a weight (e.g. 80 kg) and reps (e.g. 5) for a named exercise; the system returns a primary estimated 1RM, the four formula values that produced it, and a percentage table from 60 % to 90 % showing the load (kg) and the recommended rep range at each percentage. Submitting reps > 10 returns the same shape plus a visible reduced-confidence indicator.

**Acceptance Scenarios**:

1. **Given** a weight and a rep count for an exercise, **When** the 1RM is requested, **Then** the response contains a primary estimated 1RM and the four individual estimates from the documented formulas.
2. **Given** an estimated 1RM, **When** the percentage table is requested, **Then** rows are returned for 60 %, 70 %, 75 %, 80 %, 85 %, and 90 % with the corresponding load (kg) and a recommended rep range for each.
3. **Given** the input rep count is greater than 10, **When** the 1RM is computed, **Then** the result is still returned and a reduced-confidence indicator is included.
4. **Given** the input rep count is 1, **When** the 1RM is computed, **Then** the primary estimate equals the input weight.
5. **Given** a 1RM has been recorded for an exercise, **When** the athlete views that exercise, **Then** the most recent 1RM and percentage table are visible without recomputation.

---

### User Story 3 — Automatic Progression Decisions After Every Logged Session (Priority: P2)

Once a session is saved, the system evaluates each exercise in it against four progression rules and produces a per-exercise decision: "ready to add load", "maintain", "stagnation", "regression", or "deload suggested". The athlete does not run any calculator manually; the decision is ready by the time they look at their Dashboard or Load Tracking screen.

**Why this priority**: The whole point of MassLab beyond logging is telling the athlete *what to do next*. Manual decisions on when to add weight, when to hold, and when to back off are noisy and inconsistent. A deterministic rule engine produces the same answer every time and frees the athlete from having to remember last week's reps. P2 only because the underlying calculators (User Stories 1 and 2) must exist first.

**Independent Test**: Replay a sequence of logged sessions for one exercise — two sessions at top of rep range across all sets — and confirm the next decision flips to "ready to add load". Replay a sequence with three flat weeks of identical volume and confirm the decision flips to "stagnation". Replay a week with average RPE ≥ 9 and confirm a deload is suggested. No request from the athlete is required between sessions and the decision; saving the session is enough.

**Acceptance Scenarios**:

1. **Given** an exercise where every set reached the top of the rep range in two consecutive sessions, **When** the second session is saved, **Then** the exercise's progression status becomes "ready to add load" with the configured increment (default +2.5 kg upper body, +5 kg lower body).
2. **Given** an exercise whose weekly volume per muscle group has been unchanged for three calendar weeks, **When** the most recent session of the third week is saved, **Then** the status becomes "stagnation".
3. **Given** a calendar week where the athlete's average RPE across sessions is at least 9, **When** the last session of that week is saved, **Then** a "deload suggested" flag appears for the following week with the prescribed adjustment (volume −30 %, intensity maintained).
4. **Given** a calendar week where two or more exercises show a load lower than two weeks earlier, **When** the last session is saved, **Then** a "deload suggested" flag is also raised.
5. **Given** progression flags exist for the athlete, **When** the athlete loads the Dashboard or Load Tracking surface, **Then** the flags are visible without further computation.
6. **Given** progression flags are advisory, **When** the athlete chooses not to act on them, **Then** the flag remains visible but does not prevent further sessions from being logged.

---

### User Story 4 — One-Action Program Generation From the Profile (Priority: P2)

From a single complete athlete profile, the system produces a full ready-to-use program: a training plan (split, exercise selection, parameters per phase), the daily nutrition targets, a supplement stack, and recovery guidelines — bundled together as one coherent output. The same action regenerates the program when the profile changes in a way that affects the output.

**Why this priority**: This is the engine that turns "this app is for one athlete" into "this app generates a program for any athlete." For the current athlete it runs once during seed and then on profile changes; for future SaaS users it will run on every signup. The architecture and reproducibility must be proven now, even if only one profile drives it today.

**Independent Test**: Submit a complete profile (the seeded athlete's). The system returns one program object containing four sections — training plan, nutrition targets, supplement list, recovery guidelines — and persists it as belonging to that athlete. Change the goal from "bulk" to "cut" on the same profile and request again; the new program is internally consistent (calories and macros recompute, training parameters appropriate for the goal) and replaces the previous one without orphaning data.

**Acceptance Scenarios**:

1. **Given** a complete athlete profile, **When** a program is generated, **Then** the result contains a training plan, daily nutrition targets, a supplement list, and recovery guidelines, and is persisted as belonging to that athlete.
2. **Given** a previously generated program, **When** the profile's weight, goal, activity level, morphotype, or sessions-per-week is updated and a regeneration is requested, **Then** the new program reflects the change and supersedes the previous program.
3. **Given** the same profile is submitted twice without changes, **When** generation is run twice, **Then** the two programs are identical in their numerical outputs.
4. **Given** a generated program, **When** any later view (Dashboard, Nutrition, Training, Statistics) reads its values, **Then** they read the same numbers stored at generation time without recomputing.
5. **Given** profile fields that do not affect program output change (e.g. display name), **When** regeneration is *not* requested, **Then** the persisted program is left unchanged.

---

### User Story 5 — Body Composition Refines Targets Automatically (Priority: P3)

When the athlete records a weight or measurement entry, the system updates body-fat percentage and lean-body-mass estimates in the background and refreshes the daily macro targets that depend on lean mass. The athlete does nothing beyond logging the entry on the Body Weight & Measurements page.

**Why this priority**: This makes nutrition targets adapt to real progress instead of remaining frozen at the original profile values. It is P3 because the targets stay correct without it (using the most recent profile weight); refinement via measurements is a quality-of-life improvement, not a correctness issue.

**Independent Test**: With waist, neck, and height available on a profile, log a body-weight entry; the system updates body-fat % and lean body mass and the protein target on the Nutrition page reflects the new lean mass. With only weight and height (no neck/waist), the system uses the BMI-based fallback and still produces an estimate; the targets still refresh.

**Acceptance Scenarios**:

1. **Given** the athlete has logged waist, neck, and height, **When** a new body-weight entry is saved, **Then** the system computes body-fat % using the documented multi-measurement formula.
2. **Given** the athlete has not logged neck or waist, **When** a body-weight entry is saved, **Then** the system computes body-fat % using the BMI-based fallback.
3. **Given** body-fat % updates, **When** macros are next read, **Then** the protein target reflects the new lean body mass.
4. **Given** measurements are within plausible human ranges, **When** body-fat % is computed, **Then** the result lies within the documented physiologically plausible range; out-of-range inputs are rejected with a clear validation error.

---

### User Story 6 — Manual Calculator Surface for Exploration (Priority: P3)

The athlete can open a "Calculators" section in the app and run any single calculator (BMR, TDEE, macros, 1RM, body composition) on ad-hoc inputs without committing the result to their profile. The calculator forms accept the same inputs the engine uses internally and return the same numbers the engine would produce — a transparent window into the rules.

**Why this priority**: This builds trust. The athlete can verify that the targets they see on the Nutrition page are reproducible from their own numbers, and they can explore "what if I weighed 60 kg" or "what if I did one more session per week" without changing their actual profile. P3 because the engine is correct without this surface; the surface only exposes it.

**Independent Test**: Open the Calculators section, fill in BMR inputs that match the athlete's current profile, and confirm the result matches the BMR used by the live nutrition targets. Change one input (weight) and observe the result change accordingly. Close the page; the athlete profile is unchanged.

**Acceptance Scenarios**:

1. **Given** the Calculators section is open, **When** the athlete fills in any single calculator's inputs, **Then** the result is shown immediately on the same page.
2. **Given** the athlete leaves the Calculators page, **When** they return to their profile or Nutrition view, **Then** their persisted profile and targets are unchanged unless they explicitly applied the result.
3. **Given** identical inputs, **When** the manual calculator and the engine-internal calculation run, **Then** they produce identical numerical results.

---

### Edge Cases

- **Insufficient session history**: progression rules that need 2 consecutive sessions, 3 weeks of volume, or full-week RPE coverage emit no flag (silently) when the underlying history is too short, rather than emitting a misleading "maintain" or "stagnation".
- **Sparse RPE data**: deload detection requires that at least 60 % of the week's logged sets carry an RPE value; below that threshold the rule does not fire.
- **Profile with rep-max input but no logged sessions**: 1RM and percentage tables are still computed; progression flags simply do not appear yet.
- **Goal change mid-cycle**: regenerating the program supersedes the previous one; existing 1RM history, session logs, and measurements are preserved (only forward-looking targets change).
- **Weight or measurement entry outside plausible range**: rejected with a validation error before any recompute runs; previously persisted targets are not overwritten.
- **Reps > 10 on 1RM input**: result is returned with a reduced-confidence indicator; not blocked.
- **Reps = 0 or weight = 0 on 1RM input**: rejected as invalid input.
- **Unit handling**: all stored values are kilograms and centimeters; the lbs/inches presentation toggle is a Phase 2 concern and does not change stored values.
- **Activity level change for the week (e.g. illness rest week)**: targets recompute on the next profile save; the athlete is not forced to update mid-week if they prefer to keep targets stable.
- **Athlete deletes their last body-weight entry**: the most recent prior weight is used; if no weight history remains, the profile's starting weight is used.

## Requirements *(mandatory)*

### Functional Requirements

**Energy and macro targets**

- **FR-001**: System MUST compute basal metabolic rate (BMR) from weight (kg), height (cm), age (years), and biological sex using the documented Mifflin–St Jeor formula.
- **FR-002**: System MUST compute total daily energy expenditure (TDEE) by multiplying BMR by an activity factor selected from five named levels (sedentary 1.2 / lightly active 1.375 / moderately active 1.55 / very active 1.725 / extremely active 1.9).
- **FR-003**: System MUST compute the daily calorie target by adjusting TDEE according to goal: bulk (TDEE + configurable surplus, default +400 kcal, allowed range +300 to +500), cut (TDEE − configurable deficit, default −400 kcal), maintain (TDEE).
- **FR-004**: System MUST compute daily macronutrient targets in grams: protein at the documented grams-per-lean-body-mass target (default 2.2 g/kg lean mass) prioritised first; fat at no less than 25 % of total calories; carbohydrates from the remaining calories.
- **FR-005**: System MUST adjust the macro split by morphotype: ectomorph carbohydrates may rise to 55 % of total calories, endomorph fat is moderately raised and carbohydrates moderately reduced, mesomorph is balanced — all within the protein-floor and fat-floor constraints.
- **FR-006**: System MUST persist the computed daily nutrition targets as athlete-owned records and reuse them across all views without recomputation on read.

**One-rep maximum and load percentages**

- **FR-007**: System MUST compute a one-rep-maximum estimate from a single (weight, reps) input by averaging four documented formulas (Epley, Brzycki, Lander, Lombardi) and MUST also expose the four individual values.
- **FR-008**: System MUST attach a reduced-confidence indicator to any 1RM result whose input rep count exceeds 10.
- **FR-009**: System MUST produce a recommended-load table at 60 %, 70 %, 75 %, 80 %, 85 %, and 90 % of the estimated 1RM with a recommended rep range at each percentage.
- **FR-010**: System MUST link each 1RM record to a specific exercise and to the athlete and MUST timestamp it.

**Progressive-overload rule engine**

- **FR-011**: System MUST be able to evaluate progression rules without athlete intervention. In Phase 1 the rule engine is invokable via `POST /api/v1/progression-flags/evaluate` (used by the seed step, integration tests, and manual triggers); in Phase 4, when the session-save endpoint ships, that endpoint MUST automatically call the same evaluation flow on every session save so flags appear without any explicit action from the athlete. The athlete MUST NOT need to invoke any calculator for flags to appear once Phase 4 has shipped.
- **FR-012**: System MUST flag an exercise as "ready to add load" when every working set has reached the top of its prescribed rep range across two consecutive sessions of that exercise; the suggested increment defaults to +2.5 kg for upper-body lifts and +5 kg for lower-body lifts and MUST be configurable per category.
- **FR-013**: System MUST flag "stagnation" for a muscle group whose total weekly volume (sets × reps × load, summed over the muscle group) has not changed for three consecutive calendar weeks.
- **FR-014**: System MUST flag "regression" for an exercise whose most recent working load is lower than the load logged for that exercise two weeks earlier.
- **FR-015**: System MUST raise a "deload suggested" flag when the calendar week's average RPE across logged sets is at least 9, OR when at least two exercises register a regression in the same week; the suggested adjustment is volume −30 % with intensity maintained.
- **FR-016**: System MUST suppress all progression flags for which the underlying history is insufficient (fewer than two qualifying sessions, fewer than three weeks of volume data, or RPE coverage below 60 % of the week's sets) rather than emit an inaccurate flag.
- **FR-017**: System MUST compute a per-exercise month-over-month percentage change in estimated 1RM and expose an "on pace / off pace" indicator relative to the athlete's stated goal.
- **FR-018**: Progression flags MUST be persisted as athlete-owned records with a timestamp and the rule that produced them, so later views (Dashboard, Load Tracking) can display them without recomputation. Each rule re-evaluation MUST supersede the prior flag for the same scope (athlete + exercise, or athlete + muscle group for volume rules) by setting its `superseded_at` and writing the new flag with `is_active = true`; at most one flag per scope is active at any moment, and superseded rows MUST remain readable for history. No manual dismiss action is required.

**Body composition**

- **FR-019**: System MUST estimate body-fat percentage from waist, neck, and height using the documented multi-measurement formula when those measurements are present.
- **FR-020**: System MUST fall back to a BMI-based body-fat estimate when waist or neck is missing.
- **FR-021**: System MUST recompute lean body mass and the dependent protein target whenever a new body-weight or measurement entry is saved.
- **FR-022**: System MUST reject body-weight, height, neck, waist, and measurement values that fall outside documented physiologically plausible ranges and MUST leave previously persisted targets unchanged on rejection.

**Program generation**

- **FR-023**: System MUST generate a complete program from a single athlete profile, comprising a training plan (split, exercises, phase parameters), daily nutrition targets, a supplement list, and recovery guidelines, and MUST persist it as belonging to the athlete.
- **FR-024**: System MUST regenerate the program when any field that influences its output changes (weight, goal, activity level, morphotype, sessions per week, equipment, injuries) and MUST supersede the previous program by soft-archive: the previous row is retained with `superseded_at` set and `is_active = false`, the new row is written with `is_active = true`, and at most one row per athlete carries `is_active = true`. Historical session, weight, and measurement records remain attached to the athlete unchanged. The archived programs MUST be retrievable through a program-history lookup.
- **FR-025**: System MUST NOT regenerate the program in response to changes that do not affect program output (e.g. display name, theme preference).

**Reproducibility, scope, and surfaces**

- **FR-026**: All calculator outputs MUST be deterministic: identical inputs MUST produce identical outputs every time, with no randomness, no time-of-day dependence, and no external data calls.
- **FR-026a**: Engine constants (bulk surplus, cut deficit, protein g/kg-LBM, load increments per category, deload volume cut, stagnation window, double-progression window, deload RPE threshold, regression window, RPE coverage minimum) MUST live as defaults in a single code constants module. Per-athlete overrides MUST be stored on the existing `app_config` row (via an `engine_overrides` JSONB column added in Phase 1) and the engine MUST resolve every read as `default ⊕ athlete_override`. The resolved value used by a calculation MUST be snapshotted onto the calculation result so historical replay reproduces the original output even if defaults or overrides later change. Phase 1 ships with no override rows populated; the Phase 2 Settings UI is the first writer.
- **FR-027**: All calculator outputs MUST be athlete-scoped; nothing produced by the engine is global or shared across athletes.
- **FR-028**: System MUST expose a Calculators surface where the athlete can run any single calculator (BMR, TDEE, macros, 1RM, body composition) on ad-hoc inputs without modifying their persisted profile or targets. Phase 1 MUST ship this as a navigable page in the React/Vite/Tailwind frontend, served alongside the Phase 0 scaffold.
- **FR-028a**: Phase 1 MUST ship a minimal read-only Nutrition view in the same frontend that displays the persisted daily nutrition targets (calories, protein g, carbs g, fat g) for the active program. The view reads `/api/v1/nutrition/template` (or its Phase 1 successor exposing the engine-computed targets) and never recomputes client-side.
- **FR-029**: The Calculators surface MUST produce results numerically identical to the engine-internal calculations on the same inputs. Runs initiated from the Calculators surface MUST NOT write to the `calculation_results` audit table or to any typed calculation table; they are read-only with respect to persisted state.
- **FR-030**: All calculator inputs entering through any surface (profile save, session save, Calculators page) MUST be validated against documented ranges before any computation runs, and validation failures MUST return a clear, actionable message without partial writes.

### Key Entities *(include if feature involves data)*

- **Athlete profile inputs (existing)**: age, biological sex, weight (kg), height (cm), morphotype, goal (bulk/cut/maintain), activity level, sessions per week, available equipment, injuries. The single source of truth that every calculator reads from.
- **Body measurement entry (existing)**: athlete-scoped record of weight (kg) and optional measurements (waist, neck, arm, chest, thighs, shoulders) at a date, used to refine lean-body-mass and body-fat estimates.
- **Calculation result**: a single shared `calculation_results` audit table holding one row per persisted calculator run — `athlete_id`, `calculator_name`, `inputs` (JSONB snapshot), `outputs` (JSONB), `engine_version`, `resolved_constants` (JSONB snapshot of `default ⊕ override` at run time), `created_at`. Written on athlete-affecting runs (profile save → BMR/TDEE/macros, session save → progression flags, body-weight save → body-fat/LBM, program generation, 1RM record), NOT on Calculators-page ad-hoc runs (US6). Typed tables (`one_rep_max_records`, `progression_flags`, `generated_programs`) remain the primary read path; this table is the replay-only safety net for auditability.
- **One-rep-maximum record**: athlete- and exercise-scoped, holds the primary estimate, the four formula-specific estimates, the percentage table, the source (weight, reps), the confidence indicator, and a timestamp.
- **Progression flag**: athlete- and exercise- (or muscle-group-) scoped record with a flag type ("add-load" / "maintain" / "stagnation" / "regression" / "deload-suggested"), the rule that produced it, the suggested adjustment, `created_at`, `superseded_at` (nullable), and `is_active` (boolean). At most one row per (athlete, scope) is active; the next rule evaluation for the same scope soft-supersedes the prior row. Consumed by Dashboard and Load Tracking views in later phases via an "active flags" query that filters on `is_active = true`.
- **Generated program**: athlete-scoped composite record bundling the training plan, daily nutrition targets, supplement list, and recovery guidelines produced by one generation run. Carries `generated_at`, `superseded_at` (nullable), and `is_active` (boolean). At most one row per athlete is active; regeneration soft-archives the prior row (`superseded_at = now()`, `is_active = false`) before inserting the new active row. All archived rows remain readable for history.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The athlete can request a complete program (training plan, nutrition targets, supplements, recovery) for a fully filled profile and receive it within 2 seconds, end to end.
- **SC-002**: Running any single calculator on the same inputs 100 times produces identical outputs in 100 cases out of 100.
- **SC-003**: Daily macro targets satisfy the documented constraints on every generation: protein in grams is at least the configured grams-per-lean-mass floor, fat covers at least 25 % of total calories, and the macro grams sum to within ±2 % of the calorie total.
- **SC-004**: After the rule engine is invoked (via `POST /api/v1/progression-flags/evaluate` in Phase 1; automatically on session save once Phase 4 ships), any progression flag the inputs trigger is queryable from `GET /api/v1/progression-flags` within 1 second of the evaluate call returning. (The Dashboard and Load Tracking surfaces that consume the flags are owned by Phases 3 and 5; their render time is not a Phase 1 success criterion.)
- **SC-005**: The averaged 1RM estimate lies within the minimum-to-maximum range of the four individual formula estimates on 100 % of valid inputs.
- **SC-006**: When an athlete saves a body-weight entry on a profile that has the measurements required for the multi-measurement body-fat formula, the protein target on the Nutrition surface reflects the new lean-body-mass within 1 second.
- **SC-007**: Any single calculator opened on the Calculators surface returns a result within 500 ms of the athlete submitting valid inputs.
- **SC-008**: Regenerating a program from a profile that differs only in goal, weight, activity level, morphotype, or sessions-per-week produces a new program in which the calorie target, macro grams, and training-phase parameters are all internally consistent (no contradictions between them) on 100 % of regenerations.
- **SC-009**: Across a held-out fixture set of 50 representative profiles, every generated program passes the constraint set (protein floor, fat floor, macro-sum tolerance, percentage-table monotonicity, no negative values) without exception.
- **SC-010**: For invalid inputs (out-of-range weight, height, age, reps, or measurements) the calculator returns a clear validation message and leaves persisted profile and target values unchanged on 100 % of attempts.

## Assumptions

- The current operating mode is single-user, but the engine is athlete-scoped from the first call so the same logic serves the future multi-user platform without rewrite.
- Biological sex is captured as Male or Female because the Mifflin–St Jeor formula has only those two parameterisations; any future inclusion option is a UI/profile concern outside Phase 1.
- The bulk surplus default is +400 kcal (within the +300 to +500 range stated in the roadmap); the cut deficit default is −400 kcal; both are user-overridable from Settings (delivered in Phase 2).
- The protein target default is 2.2 g per kilogram of lean body mass; this is a configurable value in the engine even though no UI exposes it in Phase 1.
- Progression-rule constants — load increments per category (+2.5 kg upper / +5 kg lower), deload volume cut (−30 %), stagnation window (3 weeks), double-progression window (2 sessions), deload RPE threshold (≥ 9), regression window (2 weeks), and the RPE-coverage requirement (60 % of week's sets) — are defaults in a code constants module. Per-athlete overrides live on `app_config.engine_overrides` (JSONB, added in Phase 1, not exposed by any UI yet). The Settings UI that writes overrides is owned by Phase 2.
- All stored values are SI units (kg, cm); the lbs/inches presentation toggle is a Phase 2 concern and does not change stored values or engine inputs.
- RPE is collected per set in Phase 4; until Phase 4 ships, the deload-by-RPE branch of the rule engine simply does not fire and is not an error.
- Phase 1 ships two frontend surfaces: the Calculators page (US6) and a minimal read-only Nutrition view of the persisted daily targets and macros. All other visualisation surfaces (Dashboard, Load Tracking, Statistics) read engine outputs; their UIs are owned by Phases 3, 5, 10, and 11 and are out of scope here. Phase 1 emits and persists the data those later surfaces consume.
- AI-generated explanations or suggestions are explicitly out of scope; every output in this phase comes from deterministic formulas and rules.
- The exercise library, weekly plan, training phases, and supplement catalogue used by the program generator are the seeded values delivered in Phase 0; expanding or editing them is a Phase 2 (Settings) and Phase 3 (Training) concern.

## Dependencies

- Phase 0 — Foundation and Architecture: athlete profile, body measurement, exercise, weekly plan, training phase, nutrition template, supplement, food, and quote tables are seeded and athlete-scoped; the data-access layer, configuration loader, request-id and logging middleware, and single-user auth bypass are in place. The calculator engine reads and writes through these existing seams.
- Constitution v1.1.1: layered architecture (no platform-data imports outside the data-access layer), config-over-hardcoding, versioned API path (`/api/v1/`), and test-first for domain logic apply unchanged.
