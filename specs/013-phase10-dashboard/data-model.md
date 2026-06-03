# Phase 1 Data Model — Phase 10: Dashboard

Phase 10 introduces **no stored entity, no table, and no migration**. This document
describes (1) the **read inputs** the dashboard aggregates and which existing reader
supplies each, (2) the **new pure functions** that derive the only non-trivial numbers
and the alert selection, and (3) the **composed view-model** the endpoint returns.

## 1. Read inputs (all existing, athlete-scoped)

| Input | Reader (existing) | Used for |
| --- | --- | --- |
| Weekly schedule (slots + exercises, per ISO weekday) | `weeklyPlan.dao.listSlotsWithExercises(athleteId)` | today card, week strip, schedule-aware streak/missed-day |
| In-progress session | `sessions.dao.findActiveForAthlete(athleteId)` | today card "resume" state |
| Finished sessions (id, started_at, ended_at, day_of_week) | `sessions.dao.historyForEngine(athleteId)` | today "done", week strip, streak, missed-day, last-session |
| Training phases | `trainingPhases.dao` (via `currentTrainingPhase`) | phase card |
| Athlete profile (program_start_date, start/target weight) | `athletes.dao.findById(athleteId)` | phase days-remaining, weight card, goal line |
| Body measurements (weight series) | `bodyMeasurements.dao.listForAthlete` (via `weightChartView`) | weight card, 30-day sparkline |
| Yesterday's nutrition log | `nutritionLogs.dao.listForDay(athleteId, yesterday)` | calories card, calorie-deficit alert |
| Resolved daily calorie target | `nutrition/targets.js#resolveTargets({ daos, athleteId })` | calories card, calorie-deficit alert |
| Supplement intake + catalogue | `supplementIntake.dao.listRange` + `supplements` (+ `SUPPLEMENT_PRIMARY_SLUG`) | creatine-streak alert |
| Recent recovery rows | `recovery.dao.listRange(athleteId, { from, to })` | low-sleep+high-stress alert |
| Active progression flags | `progressionFlags.dao.findActiveForAthlete(athleteId)` | ready-to-add-load alert |
| Quotes | `quotes.dao.pickToday({ athleteId, now })` | quote of the day |

The controller reads the clock **once** (`isoDay(now())` = server UTC day) and derives
`today`, `yesterday`, the current ISO week, `programStart`, and the sparkline window,
then passes plain values into the pure functions below.

## 2. New pure functions (test-first, `services/engine/`)

### 2a. `sessionStreak.js`

```
consecutiveSessionStreak({ finishedDays, scheduleDays, asOf, programStart }) → number
missedScheduledDays({ finishedDays, scheduleDays, asOf }) → number
```
- `finishedDays`: `Set<YYYY-MM-DD>` of dates with a completed session.
- `scheduleDays`: which ISO weekdays (1–7) are training days.
- `consecutiveSessionStreak`: count of scheduled training days **completed** in an
  unbroken run ending at the most recent **elapsed** scheduled day; rest days are
  skipped (don't break), a not-yet-reached scheduled day doesn't count, counting never
  precedes `programStart`. `0` when the most recent elapsed scheduled day was missed.
- `missedScheduledDays`: consecutive elapsed scheduled training days at the tail with no
  completed session (→ the `no_session` alert). Pure; `asOf` injected.

### 2b. `dashboardAlerts.js`

```
aggregateAlerts(signals, { thresholds }) → Alert[]   // length ≤ 3
```
- `signals`: `{ lowSleepHighStress: {active, context}, noSession: {active, context},
  calorieDeficit: {active, context}, readyToAddLoad: {active, context},
  creatineStreakBroken: {active, context} }` — booleans + display context, resolved by
  the controller from the readers. **`creatineStreakBroken.active` is true only when the
  primary-supplement streak has lapsed from a positive run to 0** — a brand-new athlete
  who never logged creatine (streak always 0) is **not** "broken" (SC-009).
- Returns the **active** alerts ordered by the fixed priority
  `[low_sleep_high_stress, no_session, calorie_deficit, ready_to_add_load,
  creatine_streak_broken]`, capped at **3**. Each `Alert` =
  `{ kind, message_key, context, link }`. Pure: no I/O, no clock, no globals.

## 3. Pure presenters (`services/dashboard/`) — view assembly, no I/O

### 3a. `todayCard.js`
```
build({ slot, isRestDay, sessionState, exercises }) → {
  is_rest, muscle_group, exercises: [{id,name}],   // first 3
  state: 'not_started'|'in_progress'|'finished'|'rest',
  cta: 'start'|'resume'|'review'|null, day_of_week
}
```

### 3b. `weekOverview.js`
```
build({ weekDays, scheduleDays, finishedDays, asOf }) → {
  days: [{ date, day_of_week, status: 'done'|'todo'|'rest' }]   // 7 entries
}
```
- `done` = a finished session that day; `rest` = not a scheduled training day;
  `todo` = a scheduled day not yet completed (incl. future days — never "missed").

### 3c. `metricsView.js`
```
build({ weight, calories, streak, phase }) → {
  weight:   { current_kg, start_kg, delta_kg } | null,
  calories: { yesterday_kcal, target_kcal, delta_kcal, over: boolean } | null,
  streak:   { count },
  phase:    { name, days_remaining } | null
}
```
- Each sub-object is `null`/empty-flagged when its source data is missing (FR-018).

### 3d. `dashboardView.js`
```
build({ today, week, metrics, sparkline, alerts, quote }) → DashboardView
```
- Bundles the tiles + a `has_data` flag per tile so the frontend renders cold-start
  empty states without error (FR-018/SC-009).

## 4. Composed view-model (response `data` shape)

`GET /api/v1/dashboard`
```json
{
  "data": {
    "today": {
      "is_rest": false, "muscle_group": "Pectoraux + Triceps",
      "exercises": [{ "id": 12, "name": "Développé couché" }, { "id": 13, "name": "…" }, { "id": 14, "name": "…" }],
      "state": "not_started", "cta": "start", "day_of_week": 1
    },
    "week": { "days": [
      { "date": "2026-06-01", "day_of_week": 1, "status": "done" },
      { "date": "2026-06-03", "day_of_week": 3, "status": "todo" },
      { "date": "2026-06-07", "day_of_week": 7, "status": "rest" }
    ] },
    "metrics": {
      "weight":   { "current_kg": 60.2, "start_kg": 58.0, "delta_kg": 2.2 },
      "calories": { "yesterday_kcal": 2900, "target_kcal": 3300, "delta_kcal": -400, "over": false },
      "streak":   { "count": 4 },
      "phase":    { "name": "Hypertrophie", "days_remaining": 19 }
    },
    "sparkline": { "has_data": true, "points": [{ "date": "2026-05-05", "weight_kg": 58.4 }], "goal_kg": 65, "days": 30 },
    "alerts": [
      { "kind": "low_sleep_high_stress", "message_key": "dashboard.alert.low_sleep_high_stress", "context": {}, "link": "/recovery" },
      { "kind": "no_session", "message_key": "dashboard.alert.no_session", "context": { "days": 2 }, "link": "/journal" },
      { "kind": "calorie_deficit", "message_key": "dashboard.alert.calorie_deficit", "context": { "delta_kcal": -400 }, "link": "/nutrition" }
    ],
    "quote": { "text": "…", "author": "…" }
  }
}
```
(Any tile renders an empty/`null`/`has_data:false` shape when its source has no data; the
whole payload still returns for a cold-start athlete — SC-009.)

## 5. Validation / boundary rules (controller)

| Concern | Rule |
| --- | --- |
| Tenant scoping | every read parameterised by `req.athleteId`; no id from body/query (FR-017) |
| Read-only | GET only; no write, no engine, no `auditWriter`, no `calculation_results` (FR-016/SC-010) |
| Clock | read once at the boundary (`isoDay(now())`); pure fns get `asOf` injected (FR-019) |
| Alerts | exactly the five kinds; fixed priority; capped at 3 (FR-010/FR-011) |
| `no_session` threshold | `DASHBOARD_NO_SESSION_DAYS` scheduled-day count (default 2) |
| `calorie_deficit` | yesterday < `DASHBOARD_CALORIE_DEFICIT_PCT` × resolved target |
| low sleep + high stress | latest recovery sleep ≤ `RECOVERY_SLEEP_LOW_HOURS` AND stress ≥ `RECOVERY_STRESS_HIGH` |
| sparkline window | `DASHBOARD_WEIGHT_SPARKLINE_DAYS` (default 30) |
| empty states | every tile renders a cold-start shape; the overall screen renders when any single source is empty (FR-018) |

## 6. Config keys (Constitution III)

`DASHBOARD_NO_SESSION_DAYS` (2), `DASHBOARD_CALORIE_DEFICIT_PCT` (0.9),
`DASHBOARD_WEIGHT_SPARKLINE_DAYS` (30). Reused: `RECOVERY_SLEEP_LOW_HOURS`,
`RECOVERY_STRESS_HIGH`, `SUPPLEMENT_PRIMARY_SLUG`, and the resolved nutrition target.
The alert priority order is fixed in code.
