# Implementation Plan: Phase 8 — Supplements

**Branch**: `011-phase8-supplements` | **Date**: 2026-06-03 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-phase8-supplements/spec.md`

## Summary

Phase 8 is the **supplement-adherence layer**. It ships four athlete-facing surfaces over the five supplements already seeded per athlete in Phase 0 (Creatine, Serious Mass, Vitamin D3, Magnesium, Omega-3): a **daily checklist** of supplement cards (name, dosage, recommended time) each with a one-tap **taken** toggle; an **individual streak counter** per supplement with the **creatine streak displayed most prominently**; a **weekly grid** (7 days × 5 supplements) color-coded **taken / missed / upcoming**; and a **weekly self-assessment** rating four dimensions — energy, recovery, sleep quality, strength — on a 1–5 scale, with a trend chart.

Like Phase 7, this phase is **write-heavy and needs real persistence**, so it ships **2 forward-only migrations / 2 new tables**, each `athlete_id`-scoped with `*_own` RLS shipped in the same migration: `supplement_intake_log` (presence = the supplement was taken that day; absence on an elapsed day = missed) and `supplement_weekly_assessment` (one row per athlete per ISO week, four 1–5 ratings). The existing `supplements` catalogue is **read-only** here — Phase 8 records adherence against it but never edits it (catalogue management stays a Phase 2 concern). Supplement logging is **pure adherence recording**: it runs **no** calculator, progression, or audit engine (FR-020).

Per the 2026-06-03 clarifications the design pins four decisions into pure, testable logic: the **editable window is the current ISO week only** (prior weeks are read-only history); **streak counting begins at the athlete's `program_start_date`** and never earlier; **weeks are ISO weeks (Monday–Sunday)**, consistent with the app's existing ISO weekday convention (Phase 4/5); and **only the current ISO week's self-assessment is editable**. All new logic — streak math, grid cell classification, ISO-week helpers, view assembly — lives in pure, test-first `services/engine/` and `services/supplements/` modules; Supabase access stays in `services/dataAccess/*` (Constitution II). The frontend adds a `/supplements` page tree and a "Suppléments" nav entry, reusing the Phase 5 hand-rolled SVG `LineChart` for the assessment trend (no charting library).

## Technical Context

**Language/Version**: Node.js 20+ (dev runs 22.x), JavaScript ES2022 ESM. React 18.3 frontend via Vite.

**Primary Dependencies** (all already installed in Phase 0–7; **no new dependency**):

- Backend: `express`, `@supabase/supabase-js` (DAO layer only), `pino`/`pino-http`, `dotenv`, `zod`, `cors`. New engine/presenter modules are pure JS.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6`. **No charting library** — the self-assessment trend reuses the Phase 5 `components/charts/LineChart.jsx`; the weekly grid is a plain color-coded table (CSS/Tailwind), and streak counters are text/badges.

**Storage**: Supabase PostgreSQL (cloud project; local CLI stack is the offline fallback). **Phase 8 ships 2 forward-only migrations / 2 new tables** — `supplement_intake_log` and `supplement_weekly_assessment` — each carrying `athlete_id` and shipping its `*_own` RLS policies in the same migration (Constitution I + Operational Standards). Reuses the existing athlete-scoped `supplements` catalogue (read-only) and the athlete profile's `program_start_date` (streak lower bound).

**Testing**: Vitest. Per Constitution V, every number-/status-producing function is unit-tested first (red → green → refactor):

- `services/engine/supplementStreaks.js` (new, pure): `streakForSupplement(takenDates, { asOf, programStart })` — consecutive-taken-days count ending at the most recent applicable day; today-not-taken does not break; a fully-elapsed missed day resets; never counts before `programStart`; never-taken = 0.
- `services/engine/supplementGrid.js` (new, pure): `cellStatus(date, takenSet, { asOf })` → `taken | missed | upcoming` (taken = record exists; missed = elapsed day, no record; upcoming = today-not-yet-taken or future).
- `services/supplements/week.js` (new, pure): `isoWeekStart(date)` (→ Monday), `weekDays(weekStart)` (7 ISO dates), `isCurrentIsoWeek(date, asOf)` (the editable-window predicate).
- `services/supplements/{checklistView,weekGridView,assessmentView}.js` (new, pure presenters): assemble view models from synthetic DAO output with **no I/O**, including empty/low-data shapes (FR-004/FR-016).
- Contract: every `/api/v1/supplements/*` path in `contracts/openapi.yaml` via Supertest (live-gated, **probes for the `supplement_intake_log` table and skips until the migration is applied**, mirroring the Phase 4/7 pattern).
- Integration: toggle on → record exists; toggle off → removed; double-toggle-on idempotent (one row, FR-003/SC-002); reject toggle on a prior-week day → 422, reject future date → 422 (FR-005/FR-005a); streak across a taken/missed sequence; grid cell statuses for a mixed week incl. future-as-upcoming; assessment upsert → one row per ISO week (FR-013); reject editing an elapsed week's assessment → 422; reject rating outside 1–5 → 400; RLS probes on both new tables; cleans up (try/finally).
- Frontend smoke (RTL + jsdom): toggle a card → taken state + streak update; creatine streak rendered prominently; weekly grid renders cells; assessment save persists; trend renders from a stub; all empty states render without error.

**Target Platform**: Local dev on macOS/Linux today; future hosted Node container behind a Vite bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0–7 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 8 adds one pure service sub-directory `services/supplements/` (presenters + week helper, mirroring `services/nutrition/` and `services/loadTracking/`), two new pure `services/engine/` helpers, two new DAOs, two migrations, a `reset.dao` extension, and a frontend `/supplements` page tree. All Supabase imports stay in `services/dataAccess/*` (Constitution II).

**Performance Goals** (from Success Criteria + Operational Standards):

- Toggling a supplement responds well under the journal 100 ms interactive budget: one row upsert/delete + an in-memory recompute of that supplement's streak (O(days-in-window), a handful of rows).
- Checklist assembly ≤ 300 ms: one catalogue read + one ranged `(athlete_id, logged_on)` read over the streak window, composed in memory.
- Weekly grid assembly ≤ 300 ms: one catalogue read + one ranged read bounded to the 7-day week.
- Assessment trend ≤ 300 ms: one ranged `(athlete_id, week_start)` read, plotted client-side (geometry O(points)).

**Constraints**:

- **New tables, RLS-in-migration** (research D-1/D-2): `supplement_intake_log` and `supplement_weekly_assessment` are forward-only migrations, each `athlete_id`-scoped with `*_own` select/modify policies shipped in the same file (Constitution I; the app uses the secret-key client and the auth middleware is the primary guard, RLS is defense-in-depth).
- **At-most-one taken record per supplement per day** (FR-003/SC-002, D-3): `supplement_intake_log` carries `UNIQUE(athlete_id, supplement_id, logged_on)`; "mark taken" is an upsert-ignore (`onConflict do nothing`) so repeated toggles never double-count; "un-mark" is a scoped delete. Presence ≡ taken.
- **Editable window = current ISO week only** (FR-005a, clarification, D-4): the toggle controller rejects any `logged_on` outside the current ISO week (Monday–Sunday) and any future date; prior weeks remain viewable but immutable. The self-assessment upsert targets only the current ISO week; an elapsed week is read-only.
- **Streak anchored at `program_start_date`** (FR-006, clarification, D-5): streak counting never includes days earlier than the athlete's `program_start_date`, read from the athlete profile at the controller boundary and passed into the pure streak function.
- **ISO weeks** (clarification, D-6): grid columns and assessment uniqueness key on the ISO week (Monday start), consistent with the existing `isoDayOfWeek` convention (Phase 4 `services/sessionJournal/calendar.js`). The new `week.js` helpers are pure and unit-tested.
- **No engine / no audit** (FR-020, D-7): supplement logging is summation/adherence recording, not a persisted engine calculation — it does **not** call the calculators, progression engine, or `auditWriter` (consistent with how Phase 7 treated food/water logging vs `calculation_results`).
- **Determinism**: all new engine/presenter/week functions are pure — the caller supplies `asOf`/`programStart`; no `Date.now()`/random/globals inside pure functions. "Today" and the current-week guard read the clock at the request boundary (controller), never inside a pure fn (mirrors the Phase 6/7 guard).
- **Tenant scoping** (Constitution I): every read/write is parameterised by `req.athleteId`; no endpoint accepts an athlete id from the body/query. Both new DAOs filter every query by `athlete_id`.
- **Layering** (Constitution II): no `@supabase/supabase-js` import outside `services/dataAccess/*`; `services/supplements/*` and `services/engine/*` take injected data and never import the client; dependency direction is `controllers → supplements (+ engine) → dataAccess`.
- **Config over hardcoding** (Constitution III): the "most critical" supplement (creatine) is identified by a config-driven slug `SUPPLEMENT_PRIMARY_SLUG` (default `creatine-monohydrate`), not a literal in code; the assessment trend window is `SUPPLEMENT_ASSESSMENT_TREND_WEEKS` (default 12). No athlete data or slugs hardcoded in source.
- **Reset integrity** (Operational Standards): `reset.dao` is extended so the `supplements` reset module and the full wipe also clear the two new child tables (before `supplements`, though the FK cascade also covers it) — accurate `deleted_counts`.
- **No AI**: every streak, grid status, and trend point is a deterministic function of logged data, consistent with the project's no-AI boundary.

**Scale/Scope**: 1 athlete; **2 migrations / 2 new tables**; 2 new config keys; ~6 new endpoints (`GET /supplements/checklist`, `POST /supplements/intake`, `GET /supplements/grid`, `GET /supplements/assessments`, `PUT /supplements/assessment`, plus the existing unchanged `GET /supplements`); 2 new DAOs (`supplementIntake`, `supplementAssessments`); 2 new pure engine modules + 1 week helper + 3 presenters; a `reset.dao` extension; frontend `/supplements` checklist + grid + assessment page and a `/supplements/trends` chart. Estimated ~700 LOC backend, ~1,100 LOC frontend, ~1,000 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**. Both new tables carry an `athlete_id` FK from creation and ship `*_own` select/modify RLS policies in the same migration (matching the project RLS pattern). Every read/write is parameterised by `req.athleteId`; no endpoint trusts a caller-supplied tenant id. Intake records FK the athlete-scoped `supplements` catalogue (`ON DELETE CASCADE`), so a future catalogue deletion cannot orphan adherence rows.

- **II. Layered Architecture & Separation of Concerns** — **PASS**. Routes stay thin; controllers orchestrate; the new `services/supplements/*` presenters, `services/engine/{supplementStreaks,supplementGrid}.js`, and `services/supplements/week.js` are pure (no I/O, no globals, caller-supplied `asOf`/`programStart`); the only new Supabase-touching code is the two DAO modules. The frontend reaches every surface through `/api/v1/` and never touches the secret key.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**. The primary-supplement slug (`SUPPLEMENT_PRIMARY_SLUG`) and the assessment trend window (`SUPPLEMENT_ASSESSMENT_TREND_WEEKS`) are `.env` keys with safe defaults; the streak lower bound comes from the seeded athlete profile's `program_start_date`, not a constant. No athlete data, slugs, URLs, or secrets in source.

- **IV. Versioned API Contract** — **PASS**. All endpoints live under `/api/v1/supplements/*` (`contracts/openapi.yaml`), reuse the `{ data }` success envelope and the canonical error envelope, and are additive within v1 — the existing `GET /supplements` catalogue list is unchanged; checklist/intake/grid/assessment paths are added. No breaking change to any existing contract.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every status/number surfaced is produced by a pure function tested first: the streak math (`streakForSupplement`), the grid cell classifier (`cellStatus`), the ISO-week helpers (`isoWeekStart`/`weekDays`/`isCurrentIsoWeek`), and the three presenters. There is no new calculator or stored calculation; adherence logging triggers no engine. UI views are exempt from strict TDD but ship smoke tests.

- **VI. Athlete-First UX** — **PASS**. Each surface answers a real daily question (did I take everything today / how long is my creatine streak / where did I slip this week / am I trending up on recovery). Toggling uses large one-tap hit targets consistent with the journal's one-handed ergonomics; the creatine streak is the hero element. Frontend goes through the Frontend Design skill on the existing Tailwind tokens; the trend reuses the bespoke SVG `LineChart` (no generic chart library). Empty/low-data states are designed, not blank (FR-004/FR-016).

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —

- `data-model.md` adds two tables, each athlete-scoped with `*_own` RLS shipped in-migration; all reads/writes trace to athlete-scoped tables; no cross-tenant path.
- `contracts/openapi.yaml` keeps every path under `/api/v1/` with the `{ data }` / canonical-error envelopes; mutations are the day-scoped intake toggle and the current-ISO-week-scoped assessment upsert — never a write outside the editable window.
- The source layout keeps Supabase imports inside `services/dataAccess/*`, status/number logic inside pure `services/engine/*`, view assembly inside pure `services/supplements/*`; no `models/` directory is added.
- Performance budgets hold: each screen is one catalogue read plus one ranged indexed read plus O(rows) in-memory composition; the trend renders client-side.

No principle violations; no Complexity Tracking entries required. (The two migrations are required new persistence for a write-heavy phase, not an architectural workaround — they comply with Principle I rather than bypassing it.)

## Project Structure

### Documentation (this feature)

```text
specs/011-phase8-supplements/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-06-03)
├── research.md          # Phase 0 of plan — D-1…D-9 decisions + rationale
├── data-model.md        # Phase 1 of plan — 2 migrations + DAOs + view models
├── quickstart.md        # Phase 1 of plan — operator's guide to the 4 surfaces
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — checklist + intake + grid + assessment endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (passing; clarifications resolved)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 8 extends the Phase 0–7 layout. **Bold** = new in Phase 8; everything else already exists.

```text
masslab/
├── supabase/migrations/
│   ├── 20260603000004_init_supplement_intake_log.sql          # NEW: supplement_intake_log + UNIQUE + index + RLS *_own
│   └── 20260603000005_init_supplement_weekly_assessment.sql   # NEW: supplement_weekly_assessment + UNIQUE + CHECK 1–5 + RLS *_own
├── routes/
│   └── supplements.routes.js                                  # EXTENDED: GET /checklist, POST /intake, GET /grid, GET /assessments, PUT /assessment
├── controllers/
│   └── supplements.controller.js                              # EXTENDED: getChecklist, toggleIntake, getGrid, getAssessments, putAssessment
├── services/
│   ├── engine/
│   │   ├── supplementStreaks.js                               # NEW pure: streakForSupplement (program-start anchored)
│   │   └── supplementGrid.js                                  # NEW pure: cellStatus (taken/missed/upcoming)
│   ├── supplements/                                           # NEW pure presenter boundary
│   │   ├── week.js                                            # isoWeekStart / weekDays / isCurrentIsoWeek
│   │   ├── checklistView.js                                   # cards + taken + per-supplement streak (creatine flagged)
│   │   ├── weekGridView.js                                    # 7×N grid of taken/missed/upcoming cells
│   │   └── assessmentView.js                                  # current-week assessment + trend series (4 dimensions)
│   └── dataAccess/
│       ├── supplementIntake.dao.js                            # NEW: markTaken(upsert-ignore)/unmark/listForDay/listRange
│       ├── supplementAssessments.dao.js                       # NEW: getForWeek/upsert(onConflict week)/listRange
│       └── reset.dao.js                                       # EXTENDED: supplements module + FULL_WIPE_ORDER add the 2 children
├── config/
│   └── schema.js                                              # EXTENDED: SUPPLEMENT_PRIMARY_SLUG, SUPPLEMENT_ASSESSMENT_TREND_WEEKS
├── app.js                                                     # EXTENDED: wire supplementIntake + supplementAssessments daos; pass config to supplements router
└── frontend/src/
    ├── pages/supplements/
    │   ├── SupplementsHome.jsx                                # NEW /supplements — cards + toggle + streaks (creatine hero) + weekly grid + assessment form
    │   └── SupplementsTrends.jsx                              # NEW /supplements/trends — 4-dimension assessment trend (LineChart)
    ├── components/
    │   └── supplements/WeeklyGrid.jsx                         # NEW color-coded 7×N table (taken/missed/upcoming)
    ├── components/charts/
    │   └── LineChart.jsx                                      # reused (assessment trend)
    ├── lib/
    │   └── supplementsApi.js                                  # NEW thin wrappers (checklist, intake, grid, assessments, assessment)
    └── App.jsx                                                # EXTENDED: /supplements + /supplements/trends routes + "Suppléments" nav
```

**Structure Decision**: Web application, identical top-level layout to Phase 0–7. The additions mirror Phase 7 exactly: a pure `services/supplements/` presenter boundary (so controllers stay thin and view assembly is unit-testable without I/O) and new pure `services/engine/` helpers for the only new derived logic (streak counting, grid-cell classification). Like Phase 7 it is **write-heavy**, so it ships two athlete-scoped, RLS-shipping migrations rather than layering over existing data only. The catalogue is reused read-only (no schema change to `supplements`). The single chart (assessment trend) reuses the Phase 5 SVG `LineChart`; the weekly grid is plain markup, so **no new chart geometry** is needed. No `models/` directory is added; all Supabase access stays behind `services/dataAccess/*`.

## Complexity Tracking

> No Constitution Check violations. No entries required. (The two new migrations satisfy Principle I — athlete-scoped persistence with RLS — rather than working around any principle.)
