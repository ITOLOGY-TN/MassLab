# Implementation Plan: Phase 10 — Dashboard

**Branch**: `013-phase10-dashboard` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/013-phase10-dashboard/spec.md`

## Summary

Phase 10 is the **home screen** — a single read-only view that composes data the athlete already owns (Phases 0–9) into a one-glance picture of their day:

1. **Today's session card** — today's muscle group, first three exercises, and a state-aware action (start / resume / completed / rest) that hands off to the existing session journal.
2. **Four metric cards** — current weight vs. start, yesterday's calories vs. the resolved daily target, the consecutive-session streak, and the current training phase with days remaining.
3. **30-day weight sparkline** with the goal line.
4. **Smart alerts** — at most three, in a fixed priority order, limited to exactly five conditions.
5. **Quote of the day** — deterministic by calendar day.
6. **Compact 7-day week overview** — session-done / to-do / rest per day.

Like Phase 5 (load tracking), this is a **pure read-only aggregation layer**: **0 migrations, 0 new tables, no new dependency**. It adds one composed endpoint `GET /api/v1/dashboard` that fans out athlete-scoped reads across the existing DAOs and hands the plain data to pure presenters; it **never writes**, **never re-runs** the calculators/progression engine, and **writes no** `calculation_results` (FR-016). It surfaces each module's existing numbers/signals rather than inventing new ones, and its only action ("start the session") reuses the Phase 4 journal start flow.

Per the 2026-06-03 clarifications the smart-alerts design is pinned into pure, testable logic: the alert set is **exactly the five** PLAN conditions; when more than three hold they are shown in a **fixed priority order** (low sleep + high stress → no session → calorie deficit → ready to add load → creatine streak broken); and the "no session" alert is **schedule-aware** (fires after 2+ consecutive elapsed *scheduled training* days with no completed session — rest days never trigger it). All new derived logic — the session-streak count, the missed-scheduled-day count, and the alert aggregation/prioritisation — lives in pure, test-first `services/engine/` modules; view assembly lives in pure `services/dashboard/` presenters; Supabase access stays in the existing `services/dataAccess/*` (Constitution II). The frontend replaces the Phase 0 scaffold home at `/` with the dashboard.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–9; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New engine/presenter modules are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — the weight sparkline reuses the Phase 5 `components/charts/LineChart.jsx` (or a thin sparkline over the existing `chartGeometry` `linePath`/`linearScale`); every other tile is plain Tailwind markup.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 10 ships 0 migrations / 0 new tables.** It reads only existing athlete-scoped tables through their DAOs: `weekly_plan_slots`/exercises, `session_journal_entries`, `training_phases`, `body_measurements` + athlete profile, `nutrition_logs`, `supplement_intake_log` + `supplements`, `recovery_log`, `progression_flags`, and `quotes`.

**Testing**: Vitest. Per Constitution V, every status-/number-/recommendation-producing function is unit-tested first (red → green → refactor):

- `services/engine/sessionStreak.js` (new, pure): `consecutiveSessionStreak({ finishedDays, scheduleDays, asOf, programStart })` (consecutive completed scheduled training days ending at the most recent applicable day; rest days don't break it; future days don't count) and `missedScheduledDays({ finishedDays, scheduleDays, asOf })` (consecutive elapsed scheduled training days with no completed session — drives the "no session" alert).
- `services/engine/dashboardAlerts.js` (new, pure): `aggregateAlerts(signals, { thresholds })` — builds the ≤5 candidate alerts from injected signals (booleans + context), applies the **fixed priority order**, returns the top 3. Pure: no I/O, no clock, no globals.
- `services/dashboard/{todayCard,weekOverview,metricsView,dashboardView}.js` (new, pure presenters): assemble view models from injected DAO output incl. empty/cold-start shapes (FR-018).
- Reuses (and unit-coverage already exists for): `services/nutrition/targets.js#resolveTargets`, `services/engine/nutritionMath.js#dayTotals`, `services/sessionJournal/currentPhase.js#{currentTrainingPhase,phaseForDate}`, `services/bodyTracking/weightChartView.js#build` (30-day series + goal), `services/engine/supplementStreaks.js#streakForSupplement`, `services/sessionJournal/calendar.js#isoDayOfWeek`, `services/supplements/week.js#{isoWeekStart,weekDays}`, `services/dataAccess/quotes.dao.js#pickToday`.
- Contract: `GET /api/v1/dashboard` against `contracts/openapi.yaml` via Supertest (live-gated; skips when `.env`/Supabase is absent, the Phase 5/7/8 pattern — no migration probe needed since Phase 10 adds no schema).
- Integration: boots `buildApp` and asserts the composed payload for a seeded athlete — today card state transitions (rest/start/resume/done), week strip statuses (incl. future-as-to-do), the four metrics, the sparkline series, alert selection + priority capping at 3, and the cold-start empty payload. **Read-only**: asserts no row counts change across a GET (SC-010).
- Frontend smoke (RTL + jsdom): the dashboard renders today card + 4 metrics + sparkline + alerts + quote + week strip from a stub; the start CTA links into the journal; every cold-start empty state renders without error.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–9 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 10 adds one pure presenter sub-directory `services/dashboard/` (mirroring `services/loadTracking/` and `services/recovery/`), two new pure `services/engine/` helpers, one new controller + route, a few config keys, and a frontend dashboard home (replacing the scaffold). All Supabase access stays in the existing `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- The dashboard is one endpoint that fans out ~9 athlete-scoped, indexed reads **in parallel** (`Promise.all`) and composes them in memory; wall-clock ≈ the slowest single read, comfortably within a normal page-load budget. No read is unbounded (each is a single-day, ranged-window, or active-only query).
- The single interactive action (start session) reuses the Phase 4 path and meets its existing < 100 ms journal-interaction budget; the dashboard itself does no writes.

**Constraints**:

- **Read-only, no persistence, no engine** (FR-016, research D-1): zero migrations/tables; the endpoint only reads and composes. It never calls the calculators, progression engine, `programGenerator`, or `auditWriter`, and writes no `calculation_results` — consistent with the Phase 5 read-only analytics boundary.
- **Surfaces existing module outputs** (research D-2): each tile maps to an existing reader/helper; the dashboard does not re-derive a module's authoritative numbers (e.g., the calorie target comes from `resolveTargets`, the current phase from `currentTrainingPhase`, the 30-day weight series + goal from `weightChartView`, the creatine streak from `streakForSupplement`, the quote from `quotes.pickToday`). Only the **session streak / missed-day count** and the **alert aggregation** are genuinely new derived logic, and both are pure + test-first.
- **Exactly five alerts, fixed priority** (FR-010/FR-011, clarification, D-3): the aggregator considers exactly {low sleep + high stress, no session, calorie deficit, ready to add load, creatine streak broken}, orders them by the fixed priority, and returns at most three. The order is fixed (not config); the thresholds are config.
- **Schedule-aware "no session"** (clarification, D-3): fires after `DASHBOARD_NO_SESSION_DAYS` (default 2) consecutive elapsed *scheduled training* days with no completed session; rest days never trigger it (uses the configured weekly schedule, not raw calendar days).
- **Determinism**: all new engine/presenter functions are pure — the caller supplies `asOf`/thresholds; no `Date.now()`/random/globals inside pure functions. "Today"/"yesterday"/the daily quote read the clock **once** at the controller boundary (server UTC calendar day), never inside a pure fn (mirrors Phase 6/7/8/9). The quote reuses the existing deterministic `pickToday` (dayIndex % length).
- **Tenant scoping** (Constitution I): every read is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body/query. The dashboard exposes only the requesting athlete's data.
- **Layering** (Constitution II): no `@supabase/supabase-js` import in `services/dashboard/*` or `services/engine/*`; they take injected data. Dependency direction is `controller → dashboard (+ engine) → dataAccess`. The controller is the only new code that touches DAOs.
- **Config over hardcoding** (Constitution III): new keys `DASHBOARD_NO_SESSION_DAYS` (2), `DASHBOARD_CALORIE_DEFICIT_PCT` (0.9 — yesterday under 90% of target = deficit), `DASHBOARD_WEIGHT_SPARKLINE_DAYS` (30). The recovery low-sleep+high-stress check reuses `RECOVERY_SLEEP_LOW_HOURS` + `RECOVERY_STRESS_HIGH`; the creatine streak reuses `SUPPLEMENT_PRIMARY_SLUG`; the calorie target is the resolved per-athlete value. No magic numbers or athlete data in source.
- **No AI**: every tile and alert is a deterministic function of existing logged data, consistent with the project's no-AI boundary.

**Scale/Scope**: 1 athlete; **0 migrations / 0 new tables**; 3 new config keys; **1 new endpoint** (`GET /api/v1/dashboard`); 1 new controller + route; 2 new pure `services/engine/` helpers + 4 pure `services/dashboard/` presenters; a frontend dashboard home (replacing `ScaffoldHome` at `/`) with ~6 tiles + a sparkline. No new DAO (reuses ~9 existing ones). Estimated ~600 LOC backend, ~1,100 LOC frontend, ~900 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. No new table. Every read is parameterised by `req.athleteId` through DAOs that already filter by `athlete_id`; no endpoint trusts a caller-supplied tenant id. The dashboard exposes only the requesting athlete's composed data.
- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; the controller orchestrates DAO reads and hands plain data to pure presenters/engine helpers (`services/dashboard/*`, `services/engine/{sessionStreak,dashboardAlerts}.js`) that import no Supabase client. No new data-access code — it reuses existing DAOs. The frontend reaches the dashboard through `/api/v1/` and never touches the secret key.
- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. The three `DASHBOARD_*` keys (no-session days, deficit %, sparkline days) plus reuse of `RECOVERY_*` / `SUPPLEMENT_PRIMARY_SLUG` / the resolved nutrition target are `.env`/profile-driven with safe defaults; no thresholds or athlete data hardcoded.
- **IV. Versioned API Contract** — **PASS**. The single new path `GET /api/v1/dashboard` lives under `/api/v1`, uses the `{ data }` envelope and the canonical error envelope, and is additive — no existing contract changes.
- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. The genuinely new derived logic — `consecutiveSessionStreak`/`missedScheduledDays` (numbers) and `aggregateAlerts` (recommendations + priority) — is pure and unit-tested first, as are the presenters. No new calculator and no stored calculation; the dashboard triggers no engine. UI is exempt from strict TDD but ships smoke tests.
- **VI. Athlete-First UX** — **PASS**. The dashboard is the answer to "what do I do right now" — today's session is one tap from the home screen (SC-001), the week strip and metrics are scannable, alerts are capped at three so the screen stays calm, and every element has a designed cold-start empty state. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; the sparkline reuses the bespoke SVG `LineChart` (no chart library).

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables; it documents the read inputs and the composed view model only. Every input traces to an existing athlete-scoped table; no cross-tenant path.
- `contracts/openapi.yaml` keeps the one path under `/api/v1/` with the `{ data }` / canonical-error envelopes; it is a pure GET with no mutation.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, number/recommendation logic inside pure `services/engine/*`, view assembly inside pure `services/dashboard/*`; no `models/` directory is added.
- Performance budget holds: one endpoint, ~9 parallel indexed reads, O(rows) in-memory composition; the sparkline renders client-side.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/013-phase10-dashboard/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-03)
├── research.md          # Phase 0 of plan — D-1…D-7 decisions + rationale
├── data-model.md        # Phase 1 of plan — read inputs + composed view model (no tables)
├── quickstart.md        # Phase 1 of plan — operator's guide to the dashboard endpoint + tiles
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — GET /dashboard
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing; clarifications resolved)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 10 extends the Phase 0–9 layout. **Bold** = new in Phase 10; everything else already exists and is reused.

```text
masslab/
├── routes/
│   └── dashboard.routes.js                                    # NEW: GET /dashboard
├── controllers/
│   └── dashboard.controller.js                               # NEW: getDashboard — fan out reads, read clock once, compose
├── services/
│   ├── engine/
│   │   ├── sessionStreak.js                                  # NEW pure: consecutiveSessionStreak / missedScheduledDays
│   │   └── dashboardAlerts.js                                # NEW pure: aggregateAlerts (fixed priority, top 3)
│   └── dashboard/                                            # NEW pure presenter boundary
│       ├── todayCard.js                                      # today's muscle group + first 3 exercises + state
│       ├── weekOverview.js                                   # 7-day done/to-do/rest strip
│       ├── metricsView.js                                    # 4 metric cards
│       └── dashboardView.js                                  # top-level assembler (cards + sparkline + alerts + quote + week)
├── config/
│   └── schema.js                                            # EXTENDED: DASHBOARD_NO_SESSION_DAYS, DASHBOARD_CALORIE_DEFICIT_PCT, DASHBOARD_WEIGHT_SPARKLINE_DAYS
├── app.js                                                    # EXTENDED: mount /dashboard router ({ daos, config })
└── frontend/src/
    ├── pages/dashboard/
    │   └── DashboardHome.jsx                                 # NEW home at `/` — composes the tiles (replaces ScaffoldHome)
    ├── components/dashboard/
    │   ├── TodaySessionCard.jsx                              # NEW today card + start/resume CTA
    │   ├── MetricCard.jsx                                    # NEW one quick-metric tile (reused ×4)
    │   ├── WeekStrip.jsx                                     # NEW 7-day done/to-do/rest strip
    │   ├── AlertList.jsx                                     # NEW up-to-3 prioritized alert cards
    │   └── QuoteCard.jsx                                     # NEW quote of the day
    ├── components/charts/
    │   └── LineChart.jsx                                     # reused for the 30-day weight sparkline (+ goal line)
    ├── lib/
    │   └── dashboardApi.js                                   # NEW thin wrapper (getDashboard)
    └── App.jsx                                               # EXTENDED: `/` → DashboardHome (replaces ScaffoldHome); nav "Accueil"
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–9. The additions mirror the Phase 5/9 read-only pattern: a pure `services/dashboard/` presenter boundary (so the controller stays thin and view assembly is unit-testable without I/O) and two pure `services/engine/` helpers for the only genuinely new derived logic (session-streak/missed-day counting and alert aggregation/prioritisation). It is **schema-light** — 0 migrations, 0 tables, no new DAO — because everything is a composition over existing athlete-scoped readers. The single chart (weight sparkline) reuses the Phase 5 SVG `LineChart`; every other tile is plain Tailwind markup. The dashboard becomes the app home, replacing the Phase 0 `ScaffoldHome` at `/`. No `models/` directory; all Supabase access stays behind the existing `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required. (Phase 10 is a read-only composition over existing athlete-scoped data — no new table, no new dependency, no engine call, no cross-tenant path.)
