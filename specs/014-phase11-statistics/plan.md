# Implementation Plan: Phase 11 — Statistics & Global Progress

**Branch**: `014-phase11-statistics` | **Date**: 2026-06-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/014-phase11-statistics/spec.md`

## Summary

Phase 11 is the **transformation overview** — a read-only analytics screen that answers "how far have I come since I started?", plus a downloadable **monthly PDF report**. It composes data the athlete already owns (Phases 0–9) into:

1. **Four headline metric cards** — total weight gained since start, total volume lifted since start, session completion rate, average weekly calories.
2. **Body tab** — weight curve (+ goal) and per-measurement curves over the program.
3. **Strength tab** — top-five exercise progressions (ranked by absolute working-weight gain in kg), weekly training volume, and a muscle-group radar of progress % per group.
4. **Attendance tab** — a GitHub-style contribution heatmap graded by daily training volume.
5. **Nutrition tab** — weekly calorie trends vs. the resolved target.
6. **Recovery tab** — sleep averages and a stress-vs-weight correlation view.
7. **Monthly PDF report** — summary + lifetime stats, top-three load progressions, a weight-progression chart, and deterministic, rule-based recommendations for next month.

Like Phase 5 (load-tracking) and Phase 10 (dashboard), this is a **pure read-only aggregation + reporting layer**: **0 migrations, 0 new tables, 0 new DAO**. It adds composed read endpoints under `/api/v1/statistics` that fan out athlete-scoped reads across existing DAOs and hand the plain data to pure presenters; it **never writes**, **never re-runs** the calculators/progression engine, writes **no** `calculation_results`/`auditWriter`, and contains **no AI** (the Constitution's AI boundary holds through Phase 11 — recommendations are deterministic rule mappings over existing signals). The PDF is **generated client-side on demand and downloaded** — producing it persists nothing (FR-021).

The codebase already provides every chart this phase needs — `LineChart`, `BarChart`, `RadarChart`, `CalendarHeatmap`, `ScatterPlot` and the full `chartGeometry` toolkit (incl. `calendarMonth`/`scatterPoints`/`radarPolygon`) — so Phase 11 adds **no new chart geometry**. Per the 2026-06-06 clarifications the three computed-chart definitions are pinned into pure, testable logic: top-N progressions rank by **absolute working-weight increase (kg)** since start; the muscle-group radar axes are **progress % per group** (now vs. start); the attendance heatmap is **graded by daily training volume**. All genuinely new derived logic — the headline metrics, exercise-improvement ranking, muscle-group progress, attendance grading, stress-weight pairing, and the report's recommendations — lives in pure, test-first `services/engine/` modules; view assembly lives in pure `services/statistics/` presenters; Supabase access stays in the existing `services/dataAccess/*` (Constitution II). The single new dependency is the frontend `jspdf` library (named in PLAN) for client-side PDF assembly.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies**:

- Backend (all already installed Phase 0–10; **no new backend dependency**): `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New engine/presenter modules are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`, and the existing bespoke SVG charts. **One new dependency: `jspdf`** (frontend only) for the monthly PDF — PLAN explicitly names jsPDF. **No charting library** and **no html2canvas**: every tab reuses an existing chart; the report's "weight chart screenshot" is produced by serializing the existing SVG `LineChart` to PNG via the browser's built-in canvas, then `jspdf.addImage`.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 11 ships 0 migrations / 0 new tables.** It reads only existing athlete-scoped tables through their DAOs: `body_measurements` + athlete profile, `one_rep_max_records`, `session_journal_entries`/`session_sets`, `weekly_plan_slots` + `exercises` + `muscle_groups`, `training_phases`, `nutrition_logs`, `recovery_log`, and `progression_flags`.

**Testing**: Vitest. Per Constitution V, every number-/recommendation-producing function is unit-tested first (red → green → refactor):

- `services/engine/statisticsMetrics.js` (new, pure): `totalWeightGained`, `totalVolumeSinceStart`, `sessionCompletionRate`, `averageWeeklyCalories` — each from injected DAO output; cold-start shapes for empty inputs.
- `services/engine/exerciseImprovements.js` (new, pure): `rankByWorkingWeightGain(seriesByExercise, { topN })` → top-N exercises by absolute working-weight increase (kg) since start, each with its working-weight series for the trend line (D-4).
- `services/engine/muscleGroupProgress.js` (new, pure): `progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups })` → progress % per group (now vs. start), 0/origin when insufficient data (D-5).
- `services/engine/attendanceHeatmap.js` (new, pure): `gradeByVolume({ dailyVolumes, from, to, levels })` → per-day intensity level (0 = no session; 1…levels graded by volume quantiles), GitHub-style (D-6).
- `services/engine/stressWeightSeries.js` (new, pure): `pairStressWeight({ checkins, weights, minPoints })` → paired {date, stress, weight_kg} points (a point only when both exist) + an insufficient-data flag (D-9).
- `services/engine/reportRecommendations.js` (new, pure): `buildRecommendations(signals, { strings })` → ordered deterministic advisory lines mapped from existing module signals; no AI, no free-form text (D-11).
- `services/statistics/{metricsView,bodyTab,strengthTab,attendanceTab,nutritionTab,recoveryTab,statisticsView,monthlyReport}.js` (new, pure presenters): assemble view models from injected DAO output incl. empty/insufficient-data shapes (FR-026).
- Reuses (unit-coverage already exists): `services/bodyTracking/weightChartView.js#build` (weight series + goal), `services/engine/measurementDeltas.js` (measurement series), `services/nutrition/targets.js#resolveTargets`, `services/engine/nutritionTrends.js#caloriesByDay`, `services/engine/nutritionMath.js#dayTotals`, `services/loadTracking/phaseRadarView.js` patterns (exercise→muscle-group map), `services/supplements/week.js#{isoWeekStart,weekDays}` (ISO-week bucketing), `services/sessionJournal/currentPhase.js#{currentTrainingPhase,phaseForDate}`, `services/dataAccess/oneRepMaxRecords.dao.js#seriesForAthlete`, `services/dataAccess/sessions.dao.js#dailyTrainingVolumes`.
- Contract: `GET /api/v1/statistics` and `GET /api/v1/statistics/report` against `contracts/openapi.yaml` via Supertest (live-gated; skips when `.env`/Supabase is absent — the Phase 5/10 pattern; **no migration probe needed since Phase 11 adds no schema**).
- Integration: boots `buildApp` and asserts the composed payloads for a seeded athlete — the four metrics, each tab's series, the report payload for a chosen month + the default (last-completed-month) behavior, and the cold-start empty/insufficient-data shapes. **Read-only**: asserts no row counts change across the GETs (SC-011).
- Frontend smoke (RTL + jsdom): the Statistics screen renders the four metric cards + five tabs from a stub; each tab's chart renders; the report button triggers generation from a stub without error; every cold-start empty state renders.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–10 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 11 adds one pure presenter sub-directory `services/statistics/` (mirroring `services/loadTracking/`, `services/dashboard/`), six new pure `services/engine/` helpers, one new controller + route, a few config keys, a frontend statistics screen with five tabs, and a client-side PDF builder. All Supabase access stays in the existing `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- `GET /api/v1/statistics` fans out a bounded set of athlete-scoped, indexed reads **in parallel** (`Promise.all`) and composes them in memory; wall-clock ≈ the slowest single read. Every read is bounded to the program window (`program_start_date` → today), a per-exercise series, or the schedule — none unbounded.
- The report endpoint is the same composition scoped to one month; PDF assembly is client-side and off the request path. The screen is read-only — no writes anywhere.

**Constraints**:

- **Read-only, no persistence, no engine, no AI** (FR-021/FR-022, research D-1): zero migrations/tables; endpoints only read and compose. They never call the calculators, progression engine, `programGenerator`, or `auditWriter`, and write no `calculation_results`. Recommendations are deterministic rule mappings over existing signals (D-11) — no AI, no generated prose (Constitution AI boundary, holds through Phase 11).
- **Surfaces existing module outputs** (research D-2): each tab/metric maps to an existing reader/chart and is not re-derived where a module already owns it — weight series + goal from `weightChartView`, measurement series from `measurementDeltas`, the calorie target from `resolveTargets`, calorie series from `nutritionTrends`. Only the headline metrics, the abs-kg progression ranking, the muscle-group progress %, the attendance grading, the stress-weight pairing, and the recommendations are genuinely new — all pure + test-first.
- **Pinned chart semantics** (FR-008/FR-010/FR-011, clarifications, D-4/D-5/D-6): top-N progressions rank by **absolute working-weight increase (kg)** since start; the radar axes are **progress % per group** (now vs. start); the attendance heatmap is **graded by daily training volume** (GitHub-style), no-session days at the empty shade.
- **"Since start" anchor** (FR-024, D-3): every lifetime statistic anchors on the athlete's `program_start_date` and never counts activity before it.
- **Determinism**: all new engine/presenter functions are pure — the caller supplies `asOf`/thresholds; no `Date.now()`/random/globals inside pure functions. "Today"/"yesterday", the program window, ISO-week bucketing, and the report month boundaries are computed **once** at the controller boundary (server UTC calendar day), never inside a pure fn (mirrors Phase 6/7/8/9/10). The report defaults to the **most recently completed calendar month**.
- **Tenant scoping** (Constitution I): every read is parameterised by `req.athleteId`; no endpoint accepts an athlete id from body/query. Statistics and the report expose only the requesting athlete's data.
- **Layering** (Constitution II): no `@supabase/supabase-js` import in `services/statistics/*` or `services/engine/*`; they take injected data. Dependency direction is `controller → statistics (+ engine) → dataAccess`. The controller is the only new code that touches DAOs. The frontend reaches statistics through `/api/v1/` and never touches the secret key.
- **Config over hardcoding** (Constitution III): new keys `STATISTICS_TOP_EXERCISES` (5), `STATISTICS_REPORT_TOP_PROGRESSIONS` (3), `STATISTICS_HEATMAP_LEVELS` (4), `STATISTICS_MIN_CORRELATION_POINTS` (3). Reuses (no new key): the resolved per-athlete nutrition target, `RECOVERY_SLEEP_LOW_HOURS`/`RECOVERY_STRESS_HIGH` (recovery red-flag recommendations), and `NUTRITION_LOCALE` (report/recommendation strings via the localization seam). No magic numbers or athlete data in source.

**Scale/Scope**: 1 athlete; **0 migrations / 0 new tables / 0 new DAO**; 4 new config keys; **2 new endpoints** (`GET /api/v1/statistics`, `GET /api/v1/statistics/report`); 1 new controller + route; 6 new pure `services/engine/` helpers + ~8 pure `services/statistics/` presenters; **1 new frontend dependency** (`jspdf`); a frontend statistics screen with 4 metric cards + 5 tabs + a PDF export button reusing 5 existing charts. Estimated ~750 LOC backend, ~1,500 LOC frontend, ~1,100 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. No new table. Every read is parameterised by `req.athleteId` through DAOs that already filter by `athlete_id`; no endpoint trusts a caller-supplied tenant id. Statistics and the report expose only the requesting athlete's composed data.
- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; the controller orchestrates DAO reads and hands plain data to pure presenters/engine helpers (`services/statistics/*`, six new `services/engine/*`) that import no Supabase client. No new data-access code — it reuses existing DAOs. The frontend reaches statistics through `/api/v1/` and never touches the secret key; PDF assembly is client-side over the returned JSON.
- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. The four `STATISTICS_*` keys plus reuse of the resolved nutrition target, `RECOVERY_*` thresholds, and `NUTRITION_LOCALE` are `.env`/profile-driven with safe defaults; no thresholds or athlete data hardcoded. The report month is derived from the clock, not a constant.
- **IV. Versioned API Contract** — **PASS**. The two new paths live under `/api/v1/`, use the `{ data }` envelope and the canonical error envelope, and are additive — no existing contract changes.
- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. The genuinely new number/recommendation logic — metrics, abs-kg ranking, muscle-group progress, attendance grading, stress-weight pairing, and `buildRecommendations` — is pure and unit-tested first, as are the presenters. No new calculator and no stored calculation; statistics triggers no engine. UI is exempt from strict TDD but ships smoke tests.
- **VI. Athlete-First UX** — **PASS**. Statistics answers a real recurring question ("am I transforming, and can I prove it?"), one tap shows the headline numbers (SC-001), each tab is scannable, every chart has an insufficient-data/empty state, and the PDF gives the athlete something to keep or share with a coach. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; all five charts reuse the bespoke SVG components (no chart library). The new `jspdf` dependency is feature-scoped to the export button.

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables; it documents the read inputs, the composed view models, and the report shape only. Every input traces to an existing athlete-scoped table; no cross-tenant path.
- `contracts/openapi.yaml` keeps both paths under `/api/v1/` with the `{ data }` / canonical-error envelopes; both are pure GETs with no mutation; the report takes an optional `month=YYYY-MM` query defaulting to the last completed month.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, number/recommendation logic inside pure `services/engine/*`, view assembly inside pure `services/statistics/*`; no `models/` directory is added.
- Performance budget holds: two endpoints, bounded parallel reads, O(rows) in-memory composition; charts and PDF render client-side.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/014-phase11-statistics/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-06)
├── research.md          # Phase 0 of plan — D-1…D-12 decisions + rationale
├── data-model.md        # Phase 1 of plan — read inputs + composed view models + report shape (no tables)
├── quickstart.md        # Phase 1 of plan — operator's guide to the statistics endpoints, tabs, and PDF
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — GET /statistics, GET /statistics/report
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing; clarifications resolved)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 11 extends the Phase 0–10 layout. **Bold** = new in Phase 11; everything else already exists and is reused.

```text
masslab/
├── routes/
│   └── statistics.routes.js                                  # NEW: GET /statistics, GET /statistics/report
├── controllers/
│   └── statistics.controller.js                              # NEW: getStatistics / getReport — fan out reads, read clock once, compose
├── services/
│   ├── engine/
│   │   ├── statisticsMetrics.js                              # NEW pure: 4 headline metrics
│   │   ├── exerciseImprovements.js                           # NEW pure: rank by abs working-weight gain (kg)
│   │   ├── muscleGroupProgress.js                            # NEW pure: progress % per muscle group (now vs start)
│   │   ├── attendanceHeatmap.js                              # NEW pure: grade days by training volume (GitHub-style)
│   │   ├── stressWeightSeries.js                             # NEW pure: pair stress + weight by day (+ insufficient-data)
│   │   └── reportRecommendations.js                          # NEW pure: deterministic next-month recommendations
│   └── statistics/                                           # NEW pure presenter boundary
│       ├── metricsView.js                                    # 4 metric cards
│       ├── bodyTab.js                                        # weight + measurement curves
│       ├── strengthTab.js                                    # top-5 progressions + weekly volume + radar
│       ├── attendanceTab.js                                  # contribution heatmap cells
│       ├── nutritionTab.js                                   # weekly calorie trend vs target
│       ├── recoveryTab.js                                    # sleep averages + stress/weight correlation
│       ├── monthlyReport.js                                  # month-scoped report payload (summary + lifetime + top-3 + weight series + recommendations)
│       └── statisticsView.js                                 # top-level assembler (metrics + 5 tabs)
├── config/
│   └── schema.js                                            # EXTENDED: STATISTICS_TOP_EXERCISES, STATISTICS_REPORT_TOP_PROGRESSIONS, STATISTICS_HEATMAP_LEVELS, STATISTICS_MIN_CORRELATION_POINTS
├── app.js                                                    # EXTENDED: mount /statistics router ({ daos, config })
└── frontend/src/
    ├── pages/statistics/
    │   ├── StatisticsHome.jsx                               # NEW screen at `/statistics` — metric cards + tab switcher
    │   └── tabs/{BodyTab,StrengthTab,AttendanceTab,NutritionTab,RecoveryTab}.jsx   # NEW one component per tab
    ├── components/statistics/
    │   ├── StatMetricCard.jsx                               # NEW one headline-metric tile (reused ×4)
    │   └── ReportButton.jsx                                 # NEW month picker + "Export PDF" action
    ├── components/charts/
    │   ├── LineChart.jsx                                    # reused: weight + measurement + progression + calorie curves
    │   ├── BarChart.jsx                                     # reused: weekly volume
    │   ├── RadarChart.jsx                                   # reused: muscle-group progress radar
    │   ├── CalendarHeatmap.jsx                              # reused: attendance contribution heatmap
    │   └── ScatterPlot.jsx                                  # reused: stress-vs-weight correlation
    ├── lib/
    │   ├── statisticsApi.js                                 # NEW thin wrapper (getStatistics, getReport)
    │   └── pdfReport.js                                     # NEW client-side jsPDF assembly (+ SVG→PNG via canvas)
    ├── App.jsx                                              # EXTENDED: `/statistics` route; nav "Statistiques"
    └── package.json                                         # EXTENDED: add `jspdf`
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–10. The additions mirror the Phase 5/9/10 read-only pattern: a pure `services/statistics/` presenter boundary (so the controller stays thin and view assembly is unit-testable without I/O) and six pure `services/engine/` helpers for the only genuinely new derived logic. It is **schema-light** — 0 migrations, 0 tables, no new DAO — because everything is a composition over existing athlete-scoped readers. All five tab charts reuse existing bespoke SVG components and the existing `chartGeometry` toolkit, so **no new chart geometry** is added. The single new dependency is the frontend `jspdf` library for client-side PDF assembly (PLAN names jsPDF); the "weight chart screenshot" is the existing SVG `LineChart` serialized to PNG via the browser's built-in canvas. No `models/` directory; all Supabase access stays behind the existing `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required. (Phase 11 is a read-only composition over existing athlete-scoped data plus a client-side PDF export — no new table, no new DAO, no engine call, no cross-tenant path, no AI. The one new dependency, `jspdf`, is a frontend reporting library scoped to the export button and named in PLAN.)
