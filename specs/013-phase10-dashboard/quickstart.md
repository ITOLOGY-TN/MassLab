# Quickstart — Phase 10: Dashboard

An operator's guide to the dashboard home screen. Assumes the Phase 0–9 stack runs
(`npm install && npm start` for the API, `npm --workspace frontend run dev` for the UI)
against the configured Supabase project. **Phase 10 adds no migration** — there is
nothing to apply.

## What Phase 10 adds

- **`GET /api/v1/dashboard`** — one read-only endpoint returning the whole home screen:
  today's session card, 7-day week overview, four metric cards, a 30-day weight
  sparkline, up to three prioritized alerts, and the quote of the day.
- **Frontend home** — `DashboardHome` mounts at `/`, **replacing** the Phase 0
  `ScaffoldHome`; nav entry "Accueil".

No new table, no new dependency. It composes existing module data.

## 1. Configure (all optional — safe defaults ship)

Add to `.env` only to override (see `.env.example`):

```bash
DASHBOARD_NO_SESSION_DAYS=2          # missed scheduled training days that trigger the "no session" alert
DASHBOARD_CALORIE_DEFICIT_PCT=0.9    # yesterday < 90% of target = calorie deficit
DASHBOARD_WEIGHT_SPARKLINE_DAYS=30   # weight sparkline window
```

The low-sleep+high-stress alert reuses `RECOVERY_SLEEP_LOW_HOURS` + `RECOVERY_STRESS_HIGH`;
the creatine streak reuses `SUPPLEMENT_PRIMARY_SLUG`; the calorie target is the athlete's
resolved value. The alert **priority order is fixed in code**.

## 2. Fetch the dashboard

```bash
curl localhost:3000/api/v1/dashboard | jq .data
```

Expect a single object with `today`, `week`, `metrics`, `sparkline`, `alerts` (≤3), and
`quote`. Key things to verify:

- **Today card** — on a training day shows the muscle group, first three exercises, and
  `cta: "start"`; with an in-progress session `cta: "resume"`; once finished
  `state: "finished"`; on a rest day `is_rest: true`, `cta: null`.
- **Week strip** — 7 days each `done` / `todo` / `rest`; future training days are `todo`,
  never missed.
- **Metrics** — weight delta vs. start, yesterday's calories vs. the resolved target,
  the consecutive-session streak, and the current phase + days remaining.
- **Sparkline** — up to 30 days of weight with `goal_kg`; `has_data:false` when no weight.
- **Alerts** — at most three, in the fixed order: low sleep + high stress → no session →
  calorie deficit → ready to add load → creatine streak broken.
- **Quote** — stable for the whole calendar day; rotates the next day.

## 3. Exercise the alert priority

Seed conditions so more than three of the five hold (e.g., a poor recovery day, two
missed scheduled days, yesterday well under target, an active `add_load` flag, a lapsed
creatine streak) and confirm `data.alerts` contains exactly the **top three by priority**
— `low_sleep_high_stress`, `no_session`, `calorie_deficit` — and omits the lower two.
Seed a healthy state and confirm `data.alerts` is empty (the UI shows an "all clear"
state).

## 4. Cold start

Against a brand-new athlete with nothing logged, confirm the endpoint still returns a
full payload: empty/`null`/`has_data:false` tiles, `streak.count: 0`, no alerts, and the
quote (if any) — with **no error** (SC-009).

## 5. Read-only guarantee

Confirm a `GET /api/v1/dashboard` changes nothing: row counts in `recovery_log`,
`nutrition_logs`, `session_journal_entries`, etc. are identical before and after, and no
`calculation_results` row is written (SC-010).

## 6. Verify

```bash
npm test                      # unit (sessionStreak + dashboardAlerts + presenters), contract, integration
npm --workspace frontend test # RTL/jsdom smoke: tiles render, start CTA links to the journal, empty states
npm run lint                  # import-boundary: no @supabase import outside services/dataAccess/*
```

Test-first order (Constitution V): write the failing specs for `consecutiveSessionStreak`
/ `missedScheduledDays`, `aggregateAlerts`, and the presenters **before** their
implementations.

## Boundaries (what Phase 10 does NOT do)

- No new table/migration; no writes; no calculator/progression/audit engine (read-only).
- No new data entry — the only action is "start session", which hands off to the Phase 4
  journal.
- Does not re-derive a module's authoritative numbers (it surfaces `resolveTargets`,
  `currentTrainingPhase`, `weightChartView`, `streakForSupplement`, `pickToday`, …).
- Statistics / PDF export (Phase 11) and any AI coaching (Phase 12) are out of scope.
