# Phase 8 Research — Supplements

**Feature**: `011-phase8-supplements` · **Date**: 2026-06-03

All four spec clarifications were resolved in the `/speckit-clarify` session (recorded under `spec.md → Clarifications`). The decisions below translate the spec + clarifications into concrete design choices. No open `NEEDS CLARIFICATION` remains.

Format per decision — **Decision** / **Rationale** / **Alternatives considered**.

---

## D-1 — Persistence shape for daily adherence: a presence-row intake log

**Decision**: Create `supplement_intake_log` with one row **per athlete, per supplement, per day** carrying `UNIQUE(athlete_id, supplement_id, logged_on)`. **Presence of a row ≡ the supplement was taken that day.** "Mark taken" upserts-ignore the row; "un-mark" deletes it. No boolean `taken` column.

**Rationale**: Presence semantics make the uniqueness constraint do the at-most-one work (FR-003/SC-002) with no read-modify-write race, and make "missed" a pure derivation (elapsed day with no row, D-7 grid) rather than stored state that could drift. It mirrors the project's lean row-per-event tables (`nutrition_logs`). A ranged read over the streak/grid window returns exactly the taken days.

**Alternatives considered**: (a) A boolean `taken` column with a row per (supplement, day) regardless of state — wastes rows for the common "not taken yet" case and forces an UPDATE path; rejected. (b) A daily JSONB blob of taken supplement ids on a single per-day row — opaque to SQL, hard to index/aggregate for streaks, and couples all five supplements into one contended row; rejected.

## D-2 — Weekly self-assessment: one row per ISO week

**Decision**: Create `supplement_weekly_assessment` with `UNIQUE(athlete_id, week_start)` (week_start = ISO Monday) and four `int` columns `energy`, `recovery`, `sleep_quality`, `strength`, each `CHECK (… between 1 and 5)`. Saving upserts on `(athlete_id, week_start)`.

**Rationale**: One-row-per-week with a DB uniqueness key enforces FR-013 ("at most one per week") at the storage layer; the `CHECK` enforces FR-014's 1–5 range as defense-in-depth behind the zod validator. `week_start` as a date is the natural, sortable bucket key for the trend (FR-015).

**Alternatives considered**: A tall (athlete, week, dimension, value) table — flexible for arbitrary future dimensions but over-engineered for four fixed ones and noisier to read/plot; rejected (the four dimensions are fixed for this phase per the spec). Reusing a Phase 9 recovery table — rejected, the weekly supplement self-assessment is explicitly distinct from the Phase 9 daily recovery check-in (spec Assumptions).

## D-3 — Idempotent "taken" toggle

**Decision**: `markTaken` = `insert … onConflict(athlete_id,supplement_id,logged_on) ignore`; `unmark` = scoped `delete`. The controller maps the request `{ taken: true|false }` to one of the two. Reads return the set of taken `supplement_id`s for the day/range.

**Rationale**: Idempotency is structural, not procedural — tapping "taken" twice is a no-op insert, satisfying SC-002 without optimistic-lock gymnastics. Delete-on-untoggle keeps presence semantics clean (D-1).

**Alternatives considered**: Read-then-write toggling (flip whatever's stored) — racy under double-tap and needs the current state first; rejected in favor of an explicit desired-state request.

## D-4 — Editable window = current ISO week only (clarification)

**Decision**: The intake-toggle controller computes `today = isoDay(now())` at the request boundary and rejects any `logged_on` that is **after today** (future) **or outside the current ISO week** → `422 OUTSIDE_EDIT_WINDOW` (future date → `422 FUTURE_DATE`). Prior weeks remain **readable** via the grid but immutable. The self-assessment `PUT` always targets the **current** ISO week derived from server `today`; it does not accept a week from the client, so elapsed weeks are inherently read-only.

**Rationale**: Directly encodes the clarification ("current ISO week only"). Deriving the window from the server clock — never the client — keeps "missed/honest history" tamper-resistant and matches the Phase 6/7 future-date guard pattern (clock read at the controller, never inside a pure function).

**Alternatives considered**: A trailing-7-day rolling window — the user explicitly chose "current week" over this in clarification. Today-only — also rejected in clarification (punishes a forgotten same-day tap).

## D-5 — Streak anchored at `program_start_date` (clarification)

**Decision**: `streakForSupplement(takenDates, { asOf, programStart })` counts consecutive taken days ending at the most recent applicable day, **never including any date before `programStart`**. The controller reads `program_start_date` from the athlete profile (`athletes.dao.findById`) and passes it in. Streak rule: if today is taken, the run includes today; if today is not taken (still in progress), the streak is the run ending at the most recent taken day (today does **not** break it); a fully-elapsed day with no record breaks the run.

**Rationale**: Encodes the clarification and FR-006. Anchoring at the program start ties adherence to the 5-month program timeline already used by Phase 4/5 `currentTrainingPhase`, and prevents pre-program days (or absent history) from distorting counts. Purity (caller supplies `asOf`/`programStart`) keeps it unit-testable.

**Alternatives considered**: First-recorded-intake anchor and unbounded history — both offered in clarification; the user chose program start.

## D-6 — ISO weeks (Monday–Sunday) (clarification)

**Decision**: All week math uses the **ISO week** (Monday start). New pure helpers in `services/supplements/week.js`: `isoWeekStart(date)` → the Monday on/that-precedes `date`; `weekDays(weekStart)` → the 7 ISO dates; `isCurrentIsoWeek(date, asOf)` → the editable-window predicate. The grid's 7 columns are `weekDays(weekStart)`; the assessment's `week_start` is `isoWeekStart(today)`.

**Rationale**: Encodes the clarification and stays consistent with the app's existing `isoDayOfWeek` convention (`services/sessionJournal/calendar.js`, Phase 4; `phaseForDate`, Phase 5). One canonical week definition across the codebase avoids off-by-one bucketing bugs.

**Alternatives considered**: Sunday–Saturday — rejected in clarification as diverging from the established ISO convention. Reusing `sessionJournal/calendar.js` directly — its `isoDayOfWeek` helps but it has no week-start/weekday-range helper, so a small dedicated `week.js` is cleaner than overloading the session module (kept separate to avoid cross-phase coupling; both follow the same Mon=1 rule).

## D-7 — Grid status derivation, not stored state

**Decision**: `cellStatus(date, takenSet, { asOf })` returns `taken` when the date is in `takenSet`; else `missed` when the date is strictly before `today` (fully elapsed); else `upcoming` (today-not-yet-taken or any future date). The week-grid presenter applies this per (supplement, day). Future weeks render entirely `upcoming`; a no-record elapsed week renders `missed`/`upcoming` split at `today`.

**Rationale**: Makes "missed" an honest, retrospective-only computation (FR-009/FR-010) that can never penalize time that hasn't happened — today's un-tapped supplement is `upcoming`, not `missed`. Pure and trivially testable across boundary cases.

**Alternatives considered**: Persisting a per-cell status — redundant with the intake log and prone to drift when the clock advances; rejected.

## D-8 — No engine, no audit log for supplement logging

**Decision**: Supplement intake and self-assessment writes **do not** call the calculators, progression engine, or `services/engine/auditWriter.js`; nothing is appended to `calculation_results`.

**Rationale**: FR-020 — supplement tracking is adherence recording, not a persisted engine calculation. This mirrors the Phase 7 boundary, where food/water summation logging deliberately skips the audit log (CLAUDE.md: the audit log is only for persisted engine calculations). Keeps the write path fast and side-effect-free.

**Alternatives considered**: Auditing adherence "for completeness" — rejected; it would pollute the calculation audit log with non-calculations and contradict the established boundary.

## D-9 — Config-driven primary supplement + trend window; reset wiring

**Decision**: Add two `.env` keys to `config/schema.js`: `SUPPLEMENT_PRIMARY_SLUG` (default `creatine-monohydrate`) marking the supplement whose streak is rendered most prominently (FR-008), and `SUPPLEMENT_ASSESSMENT_TREND_WEEKS` (default 12) bounding the trend read. Extend `reset.dao`: `MODULE_TABLES.supplements` becomes `['supplement_intake_log','supplement_weekly_assessment','supplements']` and `FULL_WIPE_ORDER` adds the two children **before** `supplements`.

**Rationale**: "Creatine is the most critical supplement" is athlete/program data, so the identifying slug belongs in config, not a literal in source (Constitution III). The trend window is a tunable. Extending `reset.dao` keeps Phase 2's selective/full reset accurate (`deleted_counts`) and ordering-correct — even though the `supplement_id` FK cascades, explicit deletion before `supplements` yields precise counts and is robust if the FK rule ever changes.

**Alternatives considered**: Hardcoding the creatine slug in the presenter — rejected (Constitution III). A new config key for the four assessment dimensions — rejected; they are fixed for this phase, so a constant array in the (tested) presenter is appropriate, not environment config.

---

## Resolved unknowns summary

| Topic | Resolution |
|-------|-----------|
| How "taken" is stored | Presence-row intake log, `UNIQUE(athlete_id, supplement_id, logged_on)` (D-1/D-3) |
| Weekly assessment storage | One row per ISO week, four `CHECK 1–5` columns (D-2) |
| Editable window | Current ISO week only; server-clock guard, future rejected (D-4) |
| Streak lower bound | `program_start_date` from the athlete profile (D-5) |
| Week definition | ISO week, Monday start; pure `week.js` helpers (D-6) |
| Grid statuses | Derived (`taken`/`missed`/`upcoming`), not stored (D-7) |
| Engine/audit involvement | None — pure adherence logging (D-8) |
| Primary supplement + trend window + reset | `SUPPLEMENT_PRIMARY_SLUG`, `SUPPLEMENT_ASSESSMENT_TREND_WEEKS`, `reset.dao` extension (D-9) |
