# Phase 0 Research — Phase 10: Dashboard

Resolves the design unknowns before Phase 1. Each decision is **Decision / Rationale /
Alternatives considered**. The three 2026-06-03 clarifications (alert set, priority
order, schedule-aware "no session") are already settled in the spec; this file records
how they translate into the implementation, plus the structural choices for a read-only
aggregation layer.

## D-1 — Read-only aggregation: 0 migrations, 0 tables, no engine

**Decision**: Phase 10 adds **no schema and no persistence**. It ships one composed
read endpoint `GET /api/v1/dashboard` whose controller fans out athlete-scoped reads
across existing DAOs and hands the plain data to pure presenters. It never writes,
never calls the calculators/progression engine/`programGenerator`/`auditWriter`, and
writes no `calculation_results`.

**Rationale**: Every dashboard element is a view over data an earlier phase already
persists and computes; there is nothing new to store. This mirrors the Phase 5
load-tracking layer (also "read-only analytics, 0 migrations, 0 new tables") and keeps
the home screen a pure projection — viewing it can never mutate state (SC-010), which
is exactly what a dashboard should guarantee.

**Alternatives considered**:
- **Persist a cached dashboard snapshot** (a `dashboard_cache` row refreshed on write) —
  would shave a few reads but introduces a write path, staleness, and invalidation
  complexity on a screen that must always reflect live data. Rejected: the parallel
  reads are cheap and always-fresh.
- **Per-tile endpoints** (`/dashboard/today`, `/dashboard/alerts`, …) — more granular but
  multiplies round-trips for a single screen that wants one fast paint. Rejected in
  favour of one composed endpoint (D-7).

## D-2 — Surface existing module outputs; only streak + alerts are new logic

**Decision**: Map each tile to an **existing** reader/helper and reuse it verbatim;
write new pure logic **only** for the session streak/missed-day count and the alert
aggregation. Reuse map:

| Tile | Existing source reused |
| --- | --- |
| Today's session (muscle group + exercises) | `weeklyPlan.dao.listSlotsWithExercises` + `sessionJournal/calendar.js#isoDayOfWeek` |
| Today's session state (rest/start/resume/done) | `sessions.dao.findActiveForAthlete` + `sessions.dao.historyForEngine` (finished days) |
| Current phase + days remaining | `sessionJournal/currentPhase.js#{currentTrainingPhase,phaseForDate}` + `trainingPhases.dao` + profile `program_start_date` |
| Weight vs start + 30-day series + goal | `bodyTracking/weightChartView.js#build` ( `bodyMeasurements.dao` + profile start/target ) |
| Yesterday's calories vs target | `nutritionLogs.dao.listForDay` + `engine/nutritionMath.js#dayTotals`; target from `nutrition/targets.js#resolveTargets` |
| Creatine streak | `engine/supplementStreaks.js#streakForSupplement` + `supplementIntake.dao` + `SUPPLEMENT_PRIMARY_SLUG` |
| Recovery low sleep + high stress | `recovery.dao.listRange` + `RECOVERY_SLEEP_LOW_HOURS`/`RECOVERY_STRESS_HIGH` |
| Ready to add load | `progressionFlags.dao.findActiveForAthlete` (active `add_load`) |
| Quote of the day | `quotes.dao.pickToday` |

New pure logic: `engine/sessionStreak.js` (`consecutiveSessionStreak`,
`missedScheduledDays`) and `engine/dashboardAlerts.js` (`aggregateAlerts`).

**Rationale**: Reuse keeps the authoritative computation in each owning module (the
dashboard must not drift from, e.g., the nutrition target or the current phase) and
honours Constitution II/V — no duplicated math. The only things no module already
computes are "how many scheduled sessions in a row did I complete" and "which three
alerts win", so those are the only new test-first units.

**Alternatives considered**: Re-deriving numbers inside the dashboard (e.g., recomputing
the calorie target) — rejected; it would duplicate logic and risk divergence.

## D-3 — Smart alerts: exactly five, fixed priority, schedule-aware "no session"

**Decision**: `aggregateAlerts(signals, { thresholds })` (pure) evaluates **exactly the
five** conditions and returns at most three in a **fixed priority order**:

1. `low_sleep_high_stress` — recent recovery shows sleep ≤ `RECOVERY_SLEEP_LOW_HOURS`
   **and** stress ≥ `RECOVERY_STRESS_HIGH` (reusing the Phase 9 config).
2. `no_session` — `missedScheduledDays ≥ DASHBOARD_NO_SESSION_DAYS` (default 2),
   schedule-aware (rest days never count).
3. `calorie_deficit` — yesterday's calories < `DASHBOARD_CALORIE_DEFICIT_PCT` (default
   0.9) × the resolved daily target.
4. `ready_to_add_load` — an active `add_load` progression flag exists (names the
   exercise).
5. `creatine_streak_broken` — the primary-supplement streak is 0 today after having
   been positive (i.e., a previously-running streak lapsed).

The function takes already-resolved `signals` (booleans + context built by the
controller from the readers) plus thresholds; it owns only the selection + ordering +
top-3 cap. `asOf` and thresholds are injected — no clock/I/O inside.

**Rationale**: The clarifications fixed the set, the order, and the schedule-aware
trigger, so the only logic worth a pure unit is "given which conditions hold, pick and
order the visible three" — exactly what `aggregateAlerts` tests. Keeping the order fixed
(not config) makes SC-006 deterministic and testable; keeping thresholds in config
satisfies Constitution III. Reusing the Phase 9 recovery thresholds avoids a second
source of truth for "low sleep / high stress".

**Alternatives considered**:
- **Severity-tagged ordering** — flexible but less predictable and needs a severity per
  type; rejected by the clarification in favour of a fixed order.
- **Calendar-day "no session"** — simpler but false-triggers on ordinary rest days;
  rejected by the clarification in favour of schedule-aware missed-day counting.
- **Reuse Phase 9 `evaluateAlerts` for the recovery signal** — viable, but Phase 9's
  rules (consecutive-day windows, reduce-volume averages) are richer than the
  dashboard's single "low sleep + high stress today" tile; a direct threshold check on
  the latest recovery row is simpler and sufficient. The dashboard reads `recovery.dao`
  and applies the two existing thresholds.

## D-4 — Session streak + missed-day count (schedule-aware, pure)

**Decision**: `consecutiveSessionStreak({ finishedDays, scheduleDays, asOf,
programStart })` counts scheduled training days completed in an unbroken run ending at
the most recent **elapsed** scheduled day; rest days are skipped (never break the
streak), a future scheduled day not yet reached doesn't count, and counting never starts
before `programStart`. `missedScheduledDays(...)` counts the consecutive elapsed
scheduled training days at the tail with no completed session (drives the `no_session`
alert). `finishedDays` = the set of dates with a completed session (from
`sessions.dao.historyForEngine`); `scheduleDays` = which ISO weekdays are training days
(from `weeklyPlan`).

**Rationale**: "Consecutive sessions" only makes sense against the **configured
schedule** (the athlete trains 5 specific days), not raw calendar days — otherwise rest
days would reset every streak. Making it pure with injected `finishedDays`/`scheduleDays`
makes it exhaustively testable (mixed done/missed/rest/future histories), consistent
with how the app treats "missed" as retrospective-only (Phase 8/9).

**Alternatives considered**:
- **Calendar-day streak** (consecutive days with any session) — wrong for a 5-day
  schedule; rejected.
- **Put streak logic in the DAO** — pushes derivation into the data layer; rejected to
  keep the DAO thin and the math unit-tested.

## D-5 — Day/week conventions + deterministic quote

**Decision**: "Today"/"yesterday" and the daily quote resolve to the **server UTC
calendar day**, read **once** at the controller boundary (`isoDay(now())`). The current
week uses the existing ISO-weekday convention (`isoDayOfWeek`, Mon=1…Sun=7) and
`supplements/week.js#{isoWeekStart,weekDays}` for the 7-day strip. The quote reuses the
existing deterministic `quotes.dao.pickToday` (`dayIndex(now) % count`) — stable within
a day, rotates daily, no randomness.

**Rationale**: Matches every other phase's date handling (Phase 6/7/8/9) so boundaries
agree across tiles; reusing `pickToday` means the quote requirement (FR-015/SC-008) is
already satisfied by existing, tested code.

**Alternatives considered**: A random daily quote — would change on reload within a day
(violates SC-008). Rejected; deterministic by day index.

## D-6 — Config keys (Constitution III)

**Decision**: Add three zod-validated `.env` keys (in `config/schema.js`, listed in
`.env.example`), all with safe defaults so the phase boots with no `.env` edits:

| Key | Default | Meaning |
| --- | --- | --- |
| `DASHBOARD_NO_SESSION_DAYS` | `2` | Consecutive elapsed scheduled training days with no session that trigger the `no_session` alert. |
| `DASHBOARD_CALORIE_DEFICIT_PCT` | `0.9` | Yesterday under this fraction of the daily target = `calorie_deficit`. |
| `DASHBOARD_WEIGHT_SPARKLINE_DAYS` | `30` | Window (days) for the home-screen weight sparkline. |

Reused (no new key): `RECOVERY_SLEEP_LOW_HOURS`, `RECOVERY_STRESS_HIGH` (low sleep + high
stress), `SUPPLEMENT_PRIMARY_SLUG` (creatine), and the resolved per-athlete nutrition
target. The alert **priority order is fixed in code** (not config), per the clarification.

**Rationale**: Every dashboard-specific threshold is an env key with a default so
acceptance tests assert concrete behavior while nothing is hardcoded; reusing the
Phase 9 recovery thresholds keeps a single source of truth for "low sleep/high stress".

**Alternatives considered**: A config-driven priority order — rejected; the clarification
fixed the order, and a fixed order keeps SC-006 deterministic.

## D-7 — One composed endpoint; dashboard becomes the home `/`

**Decision**: A single `GET /api/v1/dashboard` returns the whole composed view model
(`{ data: { today, week, metrics, sparkline, alerts, quote } }`). The frontend
`DashboardHome.jsx` mounts at `/`, **replacing** the Phase 0 `ScaffoldHome`. The
controller fans out the ~9 reads with `Promise.all`, builds the alert `signals`, and
calls the pure presenters.

**Rationale**: One round-trip gives the home screen a single fast paint (SC-001) and one
place to assemble the cold-start empty states (FR-018). Replacing the scaffold home is
the explicit intent of Phase 10 ("the home screen"). The composed payload keeps the
frontend dumb (render tiles), with all derivation server-side and unit-tested.

**Alternatives considered**: Keeping `ScaffoldHome` and mounting the dashboard at
`/dashboard` — rejected; PLAN defines the dashboard as *the* home. Per-tile endpoints —
rejected (D-1) for round-trip cost.

## Summary of decisions

| ID | Decision |
| --- | --- |
| D-1 | Read-only aggregation; 0 migrations/tables; no engine/audit; one composed GET. |
| D-2 | Reuse existing readers for every tile; new pure logic only for streak + alert aggregation. |
| D-3 | Exactly five alerts, fixed priority order, schedule-aware `no_session`; pure `aggregateAlerts`. |
| D-4 | Pure `consecutiveSessionStreak`/`missedScheduledDays` against the configured schedule. |
| D-5 | Server-UTC day + ISO week; reuse deterministic `quotes.pickToday`. |
| D-6 | Three `DASHBOARD_*` config keys; reuse `RECOVERY_*` / `SUPPLEMENT_PRIMARY_SLUG`; fixed priority in code. |
| D-7 | One `GET /api/v1/dashboard`; `DashboardHome` replaces `ScaffoldHome` at `/`. |

All NEEDS CLARIFICATION items are resolved (the spec's clarifications + these structural
decisions). Ready for Phase 1 design artifacts.
