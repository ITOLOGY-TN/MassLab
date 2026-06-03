---
description: 'Task list for Phase 8 — Supplements'
---

# Tasks: Phase 8 — Supplements

**Input**: Design documents from `/specs/011-phase8-supplements/`
**Prerequisites**: plan.md ✅, spec.md ✅ (clarified 2026-06-03), research.md ✅, data-model.md ✅, contracts/openapi.yaml ✅, quickstart.md ✅

**Tests**: **REQUIRED.** Constitution V (Test-First for Domain Logic) is NON-NEGOTIABLE — every status-/number-producing pure function (streak math, grid classification, ISO-week helpers, presenters) ships its unit test written first and failing (red → green → refactor). Contract + integration + frontend-smoke tests are included per the plan's Testing section.

**Organization**: Tasks are grouped by user story (US1–US4 from spec.md) so each story is independently implementable and testable. Exact file paths are given for every task.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 / US4 (omitted for Setup, Foundational, Polish)

## Path Conventions

Web app, repo root = `.` (repository root). Backend at root (`routes/`, `controllers/`, `services/`, `config/`, `supabase/migrations/`, `app.js`); frontend under `frontend/src/`; tests under `tests/{unit,contract,integration,frontend}/`. All Supabase access stays in `services/dataAccess/*` (Constitution II).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Configuration the rest of the phase reads.

- [X] T001 Add two config keys to `config/schema.js` — `SUPPLEMENT_PRIMARY_SLUG` (`z.string().min(1).default('creatine-monohydrate')`) and `SUPPLEMENT_ASSESSMENT_TREND_WEEKS` (`intFromString('SUPPLEMENT_ASSESSMENT_TREND_WEEKS').default(12).refine((n) => n > 0, …)`), following the Phase 7 pattern; document both (with defaults) in `.env.example`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Persistence, shared DAOs, the pure ISO-week helper, and the router/wiring hub that every user story builds on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Create migration `supabase/migrations/20260603000004_init_supplement_intake_log.sql` — `supplement_intake_log` (`id` bigint identity PK, `athlete_id` uuid FK→athletes cascade, `supplement_id` bigint FK→supplements **ON DELETE CASCADE**, `logged_on` date NOT NULL, `created_at` timestamptz default now()), `UNIQUE(athlete_id, supplement_id, logged_on)`, index `supplement_intake_log_athlete_day_idx (athlete_id, logged_on)`, and `*_own` select/modify RLS in-file (project pattern).
- [X] T003 [P] Create migration `supabase/migrations/20260603000005_init_supplement_weekly_assessment.sql` — `supplement_weekly_assessment` (`id` bigint identity PK, `athlete_id` uuid FK→athletes cascade, `week_start` date NOT NULL, `energy`/`recovery`/`sleep_quality`/`strength` int NOT NULL each `CHECK (… between 1 and 5)`, `created_at`/`updated_at` timestamptz default now()), `UNIQUE(athlete_id, week_start)`, and `*_own` select/modify RLS in-file.
- [X] T004 [P] Write FAILING unit test `tests/unit/supplementWeek.test.js` for the pure ISO-week helpers: `isoWeekStart(date)` returns the Monday on/before the date (incl. Sunday→prior Monday), `weekDays(weekStart)` returns 7 ascending ISO dates, `isCurrentIsoWeek(date, asOf)` is true only within `asOf`'s ISO week. (Constitution V — red first.)
- [X] T005 Implement `services/supplements/week.js` (`isoWeekStart`, `weekDays`, `isCurrentIsoWeek`) — pure, no I/O/globals/`Date.now()` — until T004 is green. (Depends on T004.)
- [X] T006 [P] Create `services/dataAccess/supplementIntake.dao.js` — `markTaken(athleteId, supplementId, loggedOn)` (insert `onConflict:'athlete_id,supplement_id,logged_on', ignoreDuplicates:true`), `unmark(athleteId, supplementId, loggedOn)` (scoped delete), `listForDay(athleteId, loggedOn)`, `listRange(athleteId,{from,to})`; every query `.eq('athlete_id', …)`; errors → `HttpError(500,'DB_ERROR',…)` (mirror `hydration.dao.js`).
- [X] T007 [P] Create `services/dataAccess/supplementAssessments.dao.js` — `getForWeek(athleteId, weekStart)` (maybeSingle → row|null), `upsert(athleteId, weekStart, {energy,recovery,sleep_quality,strength})` (`onConflict:'athlete_id,week_start'`, set `updated_at: new Date().toISOString()` on the update path), `listRange(athleteId,{from,to})` ascending by `week_start`; all athlete-scoped.
- [X] T008 Refactor the supplements router/controller to the `({ daos, config })` signature and wire everything in `app.js`: change `routes/supplements.routes.js` `supplementsRoutes(supplementsDao)` → `supplementsRoutes({ daos, config })` and `controllers/supplements.controller.js` `supplementsController(supplementsDao)` → `supplementsController({ daos, config })` (preserve the existing `GET /` catalogue list behavior, now reading `daos.supplements`); in `app.js` add `supplementIntake: supplementIntakeDao(sb)` and `supplementAssessments: supplementAssessmentsDao(sb)` to the `resolved` daos and change the mount to `v1.use('/supplements', supplementsRoutes({ daos: resolved, config }))`.

**Checkpoint**: Migrations defined, intake + assessment DAOs exist, ISO-week helper is green, the supplements router takes `{ daos, config }` — user stories can begin.

---

## Phase 3: User Story 1 - Check off today's supplements (Priority: P1) 🎯 MVP

**Goal**: A daily checklist of supplement cards (name, dosage, recommended time) with a one-tap **taken** toggle that persists per athlete/supplement/day, idempotently, editable only within the current ISO week.

**Independent Test**: Open `/supplements` on today's date, toggle several cards on (state persists across reload), toggle one off (clears); double-tap a card → still exactly one record; attempt to toggle a prior-week or future day → rejected (422).

### Tests for User Story 1 (write first, must FAIL) ⚠️

- [X] T009 [P] [US1] Unit test `tests/unit/supplementChecklistView.test.js` — `checklistView` assembles one item per catalogue supplement in `display_order` with `taken` reflecting the day's records, `is_primary` true for `SUPPLEMENT_PRIMARY_SLUG`, and renders the empty (nothing-taken) shape without error (FR-001/FR-004).
- [X] T010 [P] [US1] Contract test `tests/contract/supplementsChecklist.contract.test.js` — drives `GET /api/v1/supplements/checklist` and `POST /api/v1/supplements/intake` against the `contracts/openapi.yaml` shapes; **live-gated: probe for `supplement_intake_log` and skip until the migration is applied** (Phase 4/7 pattern).
- [X] T011 [P] [US1] Integration test `tests/integration/supplementIntake.integration.test.js` — toggle taken=true → row exists; taken=false → removed; double taken=true → one row (SC-002); `logged_on` in a prior ISO week → 422 `OUTSIDE_EDIT_WINDOW`; future `logged_on` → 422 `FUTURE_DATE`; unknown `supplement_id` → 404; snapshot the (athlete, supplement, current-day) cell and restore it in `afterAll` so real adherence data is never destroyed.

### Implementation for User Story 1

- [X] T012 [P] [US1] Create `services/supplements/checklistView.js` — pure `checklistView({ catalogue, takenIds, streaks, primarySlug })` → `{ date, supplements:[{id,slug,name,dosage,recommended_time,taken,streak,is_primary}] }`; `streak` passed through (default 0; real values arrive in US2); no I/O.
- [X] T013 [US1] Add `getChecklist` and `toggleIntake` handlers to `controllers/supplements.controller.js` — `getChecklist` reads `daos.supplements.listForAthlete` + `daos.supplementIntake.listForDay(athleteId, date)` (date defaults to `isoDay(now())` at the boundary), composes via `checklistView` (streak 0 for now), `is_primary` from `config.SUPPLEMENT_PRIMARY_SLUG`; `toggleIntake` validates the zod body, rejects future date (422 `FUTURE_DATE`) and any date outside `isCurrentIsoWeek` (422 `OUTSIDE_EDIT_WINDOW`), 404s an unknown supplement, then `markTaken`/`unmark`.
- [X] T014 [US1] Add routes to `routes/supplements.routes.js` — `r.get('/checklist', c.getChecklist)` and `r.post('/intake', c.toggleIntake)`; define the zod intake schema (`supplement_id` positive int, `logged_on` ISO date, `taken` boolean) inline/colocated as the other routers do.
- [X] T015 [US1] Create `frontend/src/lib/supplementsApi.js` (thin wrappers `getChecklist(date)`, `toggleIntake({supplement_id, logged_on, taken})`) and `frontend/src/pages/supplements/SupplementsHome.jsx` — render the cards with one-tap toggles (large hit targets, Frontend Design skill, Tailwind tokens), optimistic state, and a designed empty state.
- [X] T016 [US1] Wire the frontend route + nav in `frontend/src/App.jsx` — add `<Route path="/supplements" element={<SupplementsHome />} />` and a "Suppléments" `Link` in the nav.
- [X] T017 [P] [US1] Frontend smoke test `tests/frontend/supplementsHome.test.jsx` — render with a stubbed checklist, toggle a card → calls `toggleIntake` and shows taken state; empty state renders without error.

**Checkpoint**: US1 fully functional — the daily checklist persists toggles idempotently within the current ISO week. **MVP deliverable.**

---

## Phase 4: User Story 2 - Keep a streak going for each supplement (Priority: P2)

**Goal**: Each card shows its individual streak (consecutive taken days ending at the most recent applicable day, anchored at `program_start_date`); the creatine streak is rendered most prominently.

**Independent Test**: With N consecutive taken days incl. today, the card reads N; a fully-elapsed missed day resets to the run after it; today-not-taken does not break an existing streak; never-taken reads 0; creatine is visually prominent.

### Tests for User Story 2 (write first, must FAIL) ⚠️

- [X] T018 [P] [US2] Unit test `tests/unit/supplementStreaks.test.js` — `streakForSupplement(takenDates,{asOf,programStart})`: N consecutive incl. today → N; today-not-taken with a run ending yesterday → that run (today doesn't break); a fully-elapsed gap day → counts only the run after it; never counts a date `< programStart`; never-taken → 0.
- [X] T019 [P] [US2] Extend `tests/unit/supplementChecklistView.test.js` — assert real `streak` values flow through per supplement and `is_primary` marks creatine for prominent rendering.

### Implementation for User Story 2

- [X] T020 [P] [US2] Create `services/engine/supplementStreaks.js` — pure `streakForSupplement(takenDates, { asOf, programStart })` per the streak rule (D-5); no I/O/`Date.now()`.
- [X] T021 [US2] Extend `controllers/supplements.controller.js#getChecklist` — read the athlete's `program_start_date` via `daos.athletes.findById(athleteId)` and `daos.supplementIntake.listRange(athleteId,{from: programStart, to: today})`, compute a per-supplement streak with `supplementStreaks`, and pass the `streaks` map into `checklistView`.
- [X] T022 [US2] Update `frontend/src/pages/supplements/SupplementsHome.jsx` — render each card's streak counter and give the creatine (`is_primary`) card hero prominence (size/placement/treatment via Frontend Design skill).
- [X] T023 [P] [US2] Extend `tests/frontend/supplementsHome.test.jsx` — streak counters render from the stub and the primary supplement is rendered prominently.

**Checkpoint**: US1 + US2 work independently — checklist with live, correctly-anchored streaks and a creatine hero.

---

## Phase 5: User Story 3 - See the week at a glance (Priority: P2)

**Goal**: A 7-day × N-supplement grid where each cell is `taken` / `missed` / `upcoming`, navigable across ISO weeks (read-only history; future weeks all upcoming).

**Independent Test**: For a mixed week, each of the 7×N cells shows the right status; today's un-tapped cell + future days are `upcoming`; an elapsed no-record day is `missed`; navigating weeks re-renders correctly.

### Tests for User Story 3 (write first, must FAIL) ⚠️

- [X] T024 [P] [US3] Unit test `tests/unit/supplementGrid.test.js` — `cellStatus(date, takenSet, {asOf})`: in-set → `taken`; `date < asOf` not in set → `missed`; `date === asOf` not in set → `upcoming`; `date > asOf` → `upcoming`.
- [X] T025 [P] [US3] Unit test `tests/unit/supplementWeekGridView.test.js` — `weekGridView` builds `week_start` (ISO Monday), `days` (7 dates), and one row per catalogue supplement with 7 classified cells; no-record week splits `missed`/`upcoming` at today.
- [X] T026 [P] [US3] Contract test `tests/contract/supplementsGrid.contract.test.js` — drives `GET /api/v1/supplements/grid` against the `WeekGrid` shape; live-gated skip until migration applied.

### Implementation for User Story 3

- [X] T027 [P] [US3] Create `services/engine/supplementGrid.js` — pure `cellStatus(date, takenSet, { asOf })` (D-7).
- [X] T028 [US3] Create `services/supplements/weekGridView.js` — pure `weekGridView({ catalogue, takenRows, weekStart, asOf })` → `{ week_start, days, rows:[{supplement_id,slug,name,cells:[{date,status}]}] }` using `week.js` + `cellStatus`.
- [X] T029 [US3] Add `getGrid` to `controllers/supplements.controller.js` (+ `r.get('/grid', c.getGrid)` in `routes/supplements.routes.js`) — snap `?week=` (default today) to `isoWeekStart`, read `daos.supplementIntake.listRange` over that week, compose via `weekGridView`; 400 on a malformed week date.
- [X] T030 [US3] Create `frontend/src/components/supplements/WeeklyGrid.jsx` (color-coded taken/missed/upcoming cells, Tailwind tokens — no chart library) and integrate it into `SupplementsHome.jsx` with previous/next week navigation; add `getGrid(week)` to `frontend/src/lib/supplementsApi.js`.
- [X] T031 [P] [US3] Extend `tests/frontend/supplementsHome.test.jsx` (or a new `supplementsGrid.test.jsx`) — grid renders cells from a stub and week-nav re-fetches.

**Checkpoint**: US1 + US2 + US3 independently functional — checklist, streaks, and the weekly accountability grid.

---

## Phase 6: User Story 4 - Rate weekly recovery and watch it trend (Priority: P3)

**Goal**: A weekly self-assessment of energy / recovery / sleep quality / strength (1–5), editable only for the current ISO week, with a chronological trend of all four dimensions.

**Independent Test**: Save the four ratings for the current week → persists; re-save → updates in place (one row/week); the server derives the week so an elapsed week is read-only; a rating outside 1–5 → 400; the trend plots the four dimensions chronologically; empty state renders cleanly.

### Tests for User Story 4 (write first, must FAIL) ⚠️

- [X] T032 [P] [US4] Unit test `tests/unit/supplementAssessmentView.test.js` — `assessmentView` returns `{ current|null, editable, trend:[…] }` in chronological order and handles the no-data shape (FR-016).
- [X] T033 [P] [US4] Contract test `tests/contract/supplementsAssessment.contract.test.js` — drives `GET /api/v1/supplements/assessments` + `PUT /api/v1/supplements/assessment` against the `AssessmentBundle`/`Assessment` shapes; live-gated skip until migration applied.
- [X] T034 [P] [US4] Integration test `tests/integration/supplementAssessment.integration.test.js` — `PUT` then re-`PUT` → one row per ISO week with updated values (FR-013); a rating outside 1–5 → 400; the week is server-derived (client cannot target another week); snapshot the current-week row and restore it in `afterAll`.

### Implementation for User Story 4

- [X] T035 [P] [US4] Create `services/supplements/assessmentView.js` — pure `assessmentView({ currentRow, trendRows, asOf })` → `{ current, editable: true, trend }` (the four fixed dimensions live as a tested constant here, not env config — D-9).
- [X] T036 [US4] Add `getAssessments` + `putAssessment` to `controllers/supplements.controller.js` (+ `r.get('/assessments', c.getAssessments)` and `r.put('/assessment', c.putAssessment)` in `routes/supplements.routes.js`) — `getAssessments` reads `getForWeek(isoWeekStart(today))` + `listRange` over `config.SUPPLEMENT_ASSESSMENT_TREND_WEEKS`; `putAssessment` validates the zod 1–5 schema and upserts the **current** ISO week (server-derived; never client-supplied).
- [X] T037 [US4] Frontend: add the current-week assessment form to `SupplementsHome.jsx`, create `frontend/src/pages/supplements/SupplementsTrends.jsx` (reuse `components/charts/LineChart.jsx` for the four-dimension trend), add `getAssessments()`/`putAssessment(body)` to `supplementsApi.js`, and add `<Route path="/supplements/trends" …>` + a sub-nav link in `App.jsx`.
- [X] T038 [P] [US4] Frontend smoke test `tests/frontend/supplementsTrends.test.jsx` — save an assessment (calls `putAssessment`); trend renders from a stub; empty/low-data state renders without error.

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Reset integrity, RLS coverage, docs, and validation across all stories.

- [X] T039 [P] Extend `services/dataAccess/reset.dao.js` — `MODULE_TABLES.supplements` → `['supplement_intake_log','supplement_weekly_assessment','supplements']`, and add both child tables to `FULL_WIPE_ORDER` immediately **before** `'supplements'` (D-9).
- [X] T040 [P] Add RLS probes for `supplement_intake_log` and `supplement_weekly_assessment` to `tests/integration/rls.policies.test.js` (per-test JWT against the publishable-key client; skip-until-migrated guard).
- [X] T041 [P] Add the "Phase 8 — Supplements" section to `CLAUDE.md` (write boundary, the 2 tables + RLS, pure engine/presenter modules, config keys, ISO-week/streak rules) and confirm `.env.example` documents both config keys.
- [X] T042 Run `quickstart.md` validation — apply the two migrations, `npm test` (unit + live-gated contract/integration now active), and a manual smoke of the four surfaces.
- [X] T043 [P] Verify no `@supabase/supabase-js` import outside `services/dataAccess/*`, and run `npm run lint` + Prettier across the new files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (T001)**: no dependencies.
- **Foundational (T002–T008)**: after Setup. **Blocks all user stories.** Within it: T004 → T005; T006/T007 → T008.
- **US1 (T009–T017)**: after Foundational. **MVP.**
- **US2 (T018–T023)**: after Foundational; extends US1's checklist (reuses `getChecklist` + `checklistView`) — sequence after US1 for least friction, though the `supplementStreaks` engine (T020) is independent.
- **US3 (T024–T031)**: after Foundational; independent of US1/US2 (adds the grid surface). Shares only the intake DAO + `week.js`.
- **US4 (T032–T038)**: after Foundational; independent (assessment table/DAO already foundational).
- **Polish (T039–T043)**: after all targeted stories.

### Within Each User Story

- Tests (the `### Tests …` block) are written and **fail** before implementation (Constitution V).
- Pure engine/presenter → controller → route → frontend.

### Parallel Opportunities

- **Foundational**: T002, T003, T004, T006, T007 are all `[P]` (distinct files); only T005 (needs T004) and T008 (needs T006/T007, edits shared `app.js`) serialize.
- **US1 tests**: T009, T010, T011 in parallel. **US3 tests**: T024, T025, T026 in parallel. **US4 tests**: T032, T033, T034 in parallel.
- **Cross-story (after Foundational)**: US1, US3, and US4 can proceed concurrently (distinct files); US2 is the only one that layers onto US1.
- **Polish**: T039, T040, T041, T043 in parallel; T042 last.

---

## Parallel Example: Foundational + US1 tests

```bash
# Foundational — independent files in parallel:
Task: "Migration supplement_intake_log (T002)"
Task: "Migration supplement_weekly_assessment (T003)"
Task: "Failing unit test for week.js helpers (T004)"
Task: "supplementIntake.dao.js (T006)"
Task: "supplementAssessments.dao.js (T007)"

# US1 — write the three failing tests together:
Task: "checklistView unit test (T009)"
Task: "checklist+intake contract test (T010)"
Task: "intake integration test (T011)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (apply both migrations) → 3. Phase 3 US1 → **STOP & validate** the checklist toggles persist idempotently within the current ISO week → demo.

### Incremental Delivery

Foundation → **US1 (MVP)** → US2 (streaks) → US3 (grid) → US4 (assessment + trend) → Polish. Each story is a shippable increment that doesn't break the previous ones.

### Ultracode Execution Strategy (workflows + xhigh effort)

This task list is built to be driven by **multi-agent workflows at xhigh effort**. Recommended orchestration:

1. **Run xhigh / fast mode on Opus** for the whole implementation; treat every pure-function task as strict TDD (red → green → refactor).
2. **One workflow per phase**, staying in the loop between phases (read each phase's results before launching the next):
   - **Foundational workflow** — `parallel()` the `[P]` infra tasks (T002, T003, T004→T005, T006, T007) as a barrier; then run the wiring hub T008 once they all complete (it edits shared `app.js`).
   - **Per-user-story workflow** — a `pipeline()` per story: stage 1 authors the failing tests (`[P]` fan-out), stage 2 implements pure engine/presenter, stage 3 implements controller+route, stage 4 implements frontend; then an **adversarial verify** stage re-runs the story's tests and a skeptic agent checks the clarified invariants below.
   - US1, US3, US4 workflows may run as **concurrent stages** (distinct files); US2 runs after US1.
3. **Adversarially verify** the four clarified invariants on every relevant task — they are the highest-risk correctness points:
   - Editable window = **current ISO week only** (prior week → 422, future → 422).
   - Streak anchored at **`program_start_date`**, today-not-taken never breaks, elapsed gap resets, never-taken = 0.
   - **ISO weeks** (Monday start) for grid columns and assessment uniqueness.
   - Self-assessment **upsert targets the server-derived current week only** (one row/week; elapsed weeks read-only).
4. **Completeness critic** at the end: confirm both migrations applied, all live-gated tests now run (not skipped), `reset.dao` clears the two children, RLS probes pass, and no `@supabase` import leaked outside `services/dataAccess/*`.

> Note: launching a Workflow requires explicit user opt-in (the word "ultracode", an on-session flag, or a direct request). This section documents the intended strategy; the actual run is triggered when you invoke `/speckit-implement` with ultracode or ask for a workflow.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- Every domain pure function is **test-first** (Constitution V, NON-NEGOTIABLE).
- Live contract/integration tests **probe for `supplement_intake_log` and skip until the migrations are applied** (Phase 4/7 pattern).
- No new dependency; the assessment trend reuses the Phase 5 SVG `LineChart`; the grid is plain Tailwind markup (no new chart geometry).
- Supplement logging runs **no** calculator/progression/audit engine and writes **no** `calculation_results` (FR-020).
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
