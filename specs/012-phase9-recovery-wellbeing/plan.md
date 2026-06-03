# Implementation Plan: Phase 9 — Recovery & Wellbeing

**Branch**: `012-phase9-recovery-wellbeing` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/012-phase9-recovery-wellbeing/spec.md`

## Summary

Phase 9 is the **recovery & wellbeing layer**: a fast, honest daily check-in plus the insight it unlocks. It ships three athlete-facing surfaces over a single per-day record:

1. **Daily 30-second check-in** — sleep quality (1–5 stars), hours slept, stress (0–10), energy (0–10), mood (emoji from a fixed set), and the set of sore muscle zones tapped on a clickable body diagram. One record per athlete per day; re-opening the day shows the saved values and lets the athlete adjust them.
2. **Smart contextual alerts** — a small set of deterministic, configurable recommendations derived from the recent check-ins: a high-stress ("cortisol") warning, a "reduce session volume" recommendation, and a "take a full rest day" suggestion. Advisory only — they never write to the program, never run the engine.
3. **Recovery trends** — a monthly energy heatmap calendar, a sleep-versus-performance scatter (sleep against the day's finished-session training volume, read from Phase 4), and a 30-day chart overlapping the energy, stress, and sleep curves.

Unlike Phase 7/8 this phase needs **no new table**: it **extends the existing Phase 0 `recovery_log`** table (already `athlete_id`-scoped, one row per athlete per day, RLS shipped in `20260428000013_init_recovery_log.sql`) with the three Phase 9 signals — `sleep_quality`, `mood`, and `sore_zones` (a set) — in **one forward-only migration**. The legacy scalar `soreness` column is **superseded** by the zone set (kept, deprecated). Energy and stress stay on the existing **0–10** scale (no column migration), per the clarification. The session journal (Phase 4) is **read-only** here (one thin new read for per-day volume, FR-018); recovery check-in logging is subjective journaling, so it runs **no** calculator, progression, or audit engine (FR-020) — mirroring the Phase 7 food/water and Phase 8 supplement boundaries.

Per the 2026-06-03 clarifications the design pins four decisions into pure, testable logic: the **editable window is the current ISO week only** (prior weeks read-only history, future rejected); **soreness is a set of zones with no per-zone intensity**; **energy/stress keep the 0–10 scale**; and the three alerts ship **concrete configurable default thresholds**. All new derived logic — alert evaluation, trend assembly, ISO-week guard, chart geometry, view assembly — lives in pure, test-first `services/engine/` and `services/recovery/` modules; Supabase access stays in `services/dataAccess/*` (Constitution II). The frontend adds a `/recovery` page tree and a "Récupération" nav entry, reusing the Phase 5 hand-rolled SVG `LineChart` for the 30-day overlay and adding two small bespoke SVG charts (calendar heatmap, scatter) backed by two new unit-tested `chartGeometry` helpers — no charting library.

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–8; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New engine/presenter modules are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — the 30-day overlay reuses the Phase 5 `components/charts/LineChart.jsx`; the energy heatmap and sleep-vs-performance scatter are bespoke SVG driven by two new pure `chartGeometry` helpers (`calendarMonth`, `scatterPoints`); the body diagram is hand-rolled SVG.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 9 ships 1 forward-only migration / 0 new tables** — it adds `sleep_quality` (int, CHECK 1–5), `mood` (text), and `sore_zones` (text[] NOT NULL DEFAULT '{}') to the existing `recovery_log` table. RLS is unchanged: the Phase 0 `recovery_log_select_own` / `recovery_log_modify_own` policies already key on `athlete_id` and cover the new columns. Reuses the athlete-scoped `session_journal` (read-only) for per-day finished-session volume.

**Testing**: Vitest. Per Constitution V, every status-/number-producing or recommendation-producing function is unit-tested first (red → green → refactor):

- `services/engine/recoveryAlerts.js` (new, pure): `evaluateAlerts(recentCheckins, { asOf, thresholds })` → ordered list of `{ kind, severity, message_key }`. Rules (configurable defaults): high-stress = stress ≥ 7 for ≥ 3 consecutive days; reduce-volume = avg sleep ≤ 6h AND avg energy ≤ 4 over last 3 days; full-rest = ≥ 3 of {low sleep, low energy, high stress} at once OR ≥ 4 sore zones in a day. Suppressed when the window has too few check-ins (FR-011).
- `services/engine/recoveryTrends.js` (new, pure): `energyHeatmap(checkins, { year, month })` (per-day energy buckets), `sleepPerformanceScatter(checkins, volumeByDay)` (one point per day having BOTH a check-in and a finished session — FR-014/edge case), `overlapSeries(checkins, { from, to })` (energy/stress/sleep series on a shared day axis, gaps preserved).
- `services/recovery/checkinView.js` (new, pure presenter): day form view model — saved values (or empty), `editable` flag (current ISO week), plus the config-driven allowed mood options and sore-zone list (so the UI hardcodes neither — Constitution III + localization seam).
- `services/recovery/alertsView.js` / `services/recovery/trendsView.js` (new, pure): shape engine output into view models incl. empty/low-data shapes (FR-016).
- `frontend/src/lib/chartGeometry.js` extensions (pure): `calendarMonth({ year, month, weekStartsOn })` → laid-out day cells; `scatterPoints({ points, xScale, yScale })` → `{ cx, cy }` per point. Unit-tested like the existing `gaugeArc`/`donutSegments`.
- ISO-week guard reuses the existing pure `services/supplements/week.js` (`isoWeekStart`, `isCurrentIsoWeek`) — generic, no domain coupling (research D-6).
- Contract: every `/api/v1/recovery/*` path in `contracts/openapi.yaml` via Supertest (live-gated, **probes for the `recovery_log.sleep_quality` column and skips until the migration is applied**, mirroring the Phase 7/8 pattern).
- Integration: `PUT /recovery/checkin` upsert → one row per day; partial save stores only provided fields (FR-003/SC-003); empty `sore_zones` preserved as "no soreness" vs no check-in; reject future date → 422, reject a prior-ISO-week day → 422 (FR-005/FR-005a); reject out-of-range rating / unknown mood / unknown zone → 400 (FR-004); alerts fire on a seeded triggering window and stay silent on a healthy / thin window; trends bucket per day and the scatter only emits points for days with both a check-in and a finished session; RLS probe on `recovery_log`. Integration tests **snapshot-and-restore the current-week rows** so they never destroy real recovery data (Phase 8 pattern).
- Frontend smoke (RTL + jsdom): fill + save the check-in → values persist and `editable` honored; body diagram toggles zones; mood picker selects one; alerts panel renders seeded alerts and the "all clear" state; heatmap/scatter/overlay render from stubs; all empty states render without error.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–8 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 9 adds one pure service sub-directory `services/recovery/` (presenters, mirroring `services/nutrition/` and `services/supplements/`), two new pure `services/engine/` helpers, one new DAO + one thin read on `sessions.dao`, one migration (column adds, no new table), config keys, two new `chartGeometry` helpers, and a frontend `/recovery` page tree. All Supabase imports stay in `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Saving a check-in responds well under the journal 100 ms interactive budget: one upsert of a single `recovery_log` row (atomic — `sore_zones` is an array column, so no child-row fan-out).
- Check-in + alerts assembly ≤ 300 ms: one day read + one ranged read over the alert window (a handful of rows), composed in memory.
- Trends assembly ≤ 300 ms: one ranged `recovery_log` read over the trend window + one ranged finished-session read; geometry is O(points), rendered client-side.

**Constraints**:

- **Extend, don't add** (research D-1): Phase 9 adds three columns to the existing `recovery_log` (no new table). The Phase 0 RLS policies already cover the new columns; no new policy is needed (the migration is a pure `ALTER TABLE … ADD COLUMN`). `sore_zones text[]` models the "set of zones, no intensity" clarification directly and keeps the per-day write atomic.
- **One check-in per day, upsert** (FR-002/SC-002): the existing `UNIQUE(athlete_id, logged_on)` is the upsert key; re-saving the same day updates in place. Partial saves only set provided columns (FR-003) and never substitute a value for an omitted field.
- **Editable window = current ISO week only** (FR-005a, clarification, D-2): the `PUT /recovery/checkin` controller rejects any `logged_on` outside the current ISO week (Monday–Sunday) and any future date; prior weeks remain viewable but immutable. Reuses the pure `isCurrentIsoWeek` guard already shipped in Phase 8.
- **Energy/stress 0–10, sleep quality 1–5** (clarification, D-3): energy and stress reuse the existing 0–10 `recovery_log` columns (no migration / no re-scaling of seeded data); `sleep_quality` is a new 1–5 column. Hours slept bounded 0–24.
- **Soreness = zone set** (clarification, D-1): the legacy scalar `soreness` (0–10) is superseded by `sore_zones`; zones are validated at the controller against the config-driven `RECOVERY_SORE_ZONES` list. An empty set is a valid "no soreness reported" save.
- **Alerts are deterministic, configurable, advisory** (FR-007–FR-012, clarification, D-4): the three rules are pure functions of the recent check-ins with thresholds/windows in `.env` (default values per the clarification). Alerts are **not persisted** (recomputed on read) and **never** write to the training/nutrition plan or run the calculator/progression engine or `auditWriter`.
- **No engine / no audit** (FR-020, D-5): recovery journaling is subjective recording, not a persisted engine calculation — it does **not** call the calculators, progression engine, or `auditWriter` (consistent with how Phase 7 treated food/water vs `calculation_results`).
- **Sessions read-only** (FR-018, D-7): the scatter's performance axis is the day's finished-session `total_volume_kg`, read via one thin new `sessions.dao` method; Phase 9 never writes session data.
- **Determinism**: all new engine/presenter/geometry functions are pure — the caller supplies `asOf`/thresholds; no `Date.now()`/random/globals inside pure functions. "Today" and the current-week guard read the clock once at the request boundary (controller), never inside a pure fn (mirrors the Phase 6/7/8 guard).
- **Tenant scoping** (Constitution I): every read/write is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body/query. The new DAO filters every query by `athlete_id`.
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/recovery/*` and `services/engine/*` take injected data and never import the client; dependency direction is `controllers → recovery (+ engine) → dataAccess`.
- **Config over hardcoding** (Constitution III): alert thresholds, the trend window, the allowed mood options, and the allowed sore-zone list are `.env` keys with safe defaults; no athlete data, thresholds, or zone/mood literals in source. The check-in GET surfaces the mood/zone lists so the frontend hardcodes neither.
- **No AI**: every alert and trend point is a deterministic function of logged data, consistent with the project's no-AI boundary (alerts are rule-based recommendations, not generated text).

**Scale/Scope**: 1 athlete; **1 migration / 0 new tables** (3 column adds on `recovery_log`); ~8 new config keys (alert thresholds + window + mood/zone lists); ~4 new endpoints (`GET /recovery/checkin`, `PUT /recovery/checkin`, `GET /recovery/alerts`, `GET /recovery/trends`); 1 new DAO (`recovery`) + 1 thin read on `sessions.dao`; 2 new pure engine modules + 3 presenters + 2 chart-geometry helpers; a frontend `/recovery` check-in + alerts page and a `/recovery/trends` charts page. Estimated ~700 LOC backend, ~1,200 LOC frontend, ~1,000 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. No new table: Phase 9 extends `recovery_log`, which already carries an `athlete_id` FK and ships `*_own` select/modify RLS (Phase 0). The new columns inherit those policies — a pure `ALTER TABLE … ADD COLUMN` needs no new policy. Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. The scatter reads only the athlete's own finished sessions.
- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; controllers orchestrate; the new `services/recovery/*` presenters and `services/engine/{recoveryAlerts,recoveryTrends}.js` are pure (no I/O, no globals, caller-supplied `asOf`/thresholds); the only new Supabase-touching code is the one DAO module plus one thin read on the existing `sessions.dao`. The frontend reaches every surface through `/api/v1/` and never touches the secret key.
- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. Alert thresholds/windows, the trend window, the mood options, and the sore-zone list are `.env` keys with safe defaults; no thresholds, zone/mood literals, or athlete data in source. The check-in GET surfaces the mood/zone lists so the UI renders allowed options from server config.
- **IV. Versioned API Contract** — **PASS**. All endpoints live under `/api/v1/recovery/*` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the canonical error envelope, and are purely additive within v1 — no existing contract changes.
- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every recommendation/number surfaced is produced by a pure function tested first: the alert evaluator (`evaluateAlerts` — alerts are recommendations, explicitly in scope of Principle V), the trend assemblers (`energyHeatmap`/`sleepPerformanceScatter`/`overlapSeries`), the two `chartGeometry` helpers, and the three presenters. No new calculator and no stored calculation; recovery logging triggers no engine. UI views are exempt from strict TDD but ship smoke tests.
- **VI. Athlete-First UX** — **PASS**. The screen answers real daily questions (how recovered am I / should I deload or rest / am I trending down). The check-in is a one-handed 30-second flow — star tap, sliders with large hit targets, an emoji mood row, and a tap-to-toggle body diagram; no fine-precision keyboard entry. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; charts reuse the bespoke SVG `LineChart` plus two small hand-rolled SVG charts (no generic chart library). Empty/low-data states are designed, not blank (FR-016).

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds zero tables and three columns to an already athlete-scoped, RLS-protected table; all reads/writes trace to athlete-scoped tables; no cross-tenant path.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; the only mutation is the current-ISO-week-scoped check-in upsert — never a write outside the editable window, never a write to sessions.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, status/number/recommendation logic inside pure `services/engine/*`, view assembly inside pure `services/recovery/*`; no `models/` directory is added.
- Performance budgets hold: each screen is one or two ranged indexed reads plus O(rows) in-memory composition; charts render client-side.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/012-phase9-recovery-wellbeing/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-03)
├── research.md          # Phase 0 of plan — D-1…D-8 decisions + rationale
├── data-model.md        # Phase 1 of plan — 1 migration (column adds) + DAO + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 3 surfaces
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — checkin + alerts + trends endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing; clarifications resolved)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 9 extends the Phase 0–8 layout. **Bold** = new in Phase 9; everything else already exists.

```text
masslab/
├── supabase/migrations/
│   └── 20260603000006_extend_recovery_log_phase9.sql          # NEW: ALTER recovery_log ADD sleep_quality(1–5)/mood/sore_zones[] (RLS unchanged)
├── routes/
│   └── recovery.routes.js                                     # NEW: GET /checkin, PUT /checkin, GET /alerts, GET /trends
├── controllers/
│   └── recovery.controller.js                                 # NEW: getCheckin, putCheckin, getAlerts, getTrends (clock read once at boundary)
├── services/
│   ├── engine/
│   │   ├── recoveryAlerts.js                                  # NEW pure: evaluateAlerts (deterministic, configurable, suppress-on-thin-data)
│   │   └── recoveryTrends.js                                  # NEW pure: energyHeatmap / sleepPerformanceScatter / overlapSeries
│   ├── recovery/                                              # NEW pure presenter boundary
│   │   ├── checkinView.js                                     # day form view model + editable flag + allowed moods/zones
│   │   ├── alertsView.js                                      # alert view models (+ all-clear / thin-data states)
│   │   └── trendsView.js                                      # heatmap + scatter + overlay view models
│   └── dataAccess/
│       ├── recovery.dao.js                                    # NEW: getForDay / upsert / listRange  (recovery_log)
│       └── sessions.dao.js                                    # EXTENDED: dailyTrainingVolumes(athleteId,{from,to}) read-only (FR-018)
├── config/
│   └── schema.js                                             # EXTENDED: RECOVERY_* threshold/window/mood/zone keys
├── app.js                                                     # EXTENDED: wire recovery dao; mount /recovery router with { daos, config }
└── frontend/src/
    ├── pages/recovery/
    │   ├── RecoveryHome.jsx                                   # NEW /recovery — 30s check-in form + smart alerts panel
    │   └── RecoveryTrends.jsx                                 # NEW /recovery/trends — energy heatmap + sleep-vs-perf scatter + 30-day overlay
    ├── components/recovery/
    │   ├── BodyDiagram.jsx                                    # NEW clickable SVG body — tap to toggle sore zones
    │   ├── MoodPicker.jsx                                     # NEW emoji mood row (options from server config)
    │   └── RecoveryAlerts.jsx                                 # NEW alert cards (severity-styled, all-clear state)
    ├── components/charts/
    │   ├── CalendarHeatmap.jsx                                # NEW bespoke SVG monthly energy heatmap (uses calendarMonth geometry)
    │   ├── ScatterPlot.jsx                                    # NEW bespoke SVG scatter (uses scatterPoints geometry)
    │   └── LineChart.jsx                                      # reused for the 30-day energy/stress/sleep overlay
    ├── lib/
    │   ├── chartGeometry.js                                   # EXTENDED: calendarMonth + scatterPoints (pure, unit-tested)
    │   └── recoveryApi.js                                     # NEW thin wrappers (checkin GET/PUT, alerts, trends)
    └── App.jsx                                                # EXTENDED: /recovery + /recovery/trends routes + "Récupération" nav
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–8. The additions mirror Phase 7/8: a pure `services/recovery/` presenter boundary (so controllers stay thin and view assembly is unit-testable without I/O) and new pure `services/engine/` helpers for the only new derived logic (alert evaluation, trend assembly). Unlike Phase 7/8 it is **schema-light** — it extends the existing `recovery_log` (Phase 0) with three columns rather than adding tables, because the per-day check-in already has a home and the "set of sore zones" fits an array column atomically. The ISO-week editable-window guard reuses the pure `services/supplements/week.js` helper (generic, already shipped). The 30-day overlay reuses the Phase 5 SVG `LineChart`; the heatmap and scatter are small bespoke SVG charts backed by two new unit-tested `chartGeometry` helpers — no new chart library. No `models/` directory is added; all Supabase access stays behind `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required. (Phase 9 is schema-light — one `ALTER TABLE` on an already athlete-scoped, RLS-protected table — and adds no new dependency, no engine call, and no cross-tenant path.)
