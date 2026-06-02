# Implementation Plan: Phase 1 — Calculators Engine

**Branch**: `002-calculators-engine` | **Date**: 2026-05-07 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-calculators-engine/spec.md`

## Summary

Phase 1 makes MassLab "smart". On top of the Phase 0 foundation, we add a deterministic calculator engine (BMR, TDEE, macros, 1RM, body composition), a progressive-overload rule engine (double progression / stagnation / regression / deload-by-RPE / monthly trend), a one-action program generator that reads the athlete profile and writes a soft-archive-versioned program record, and the persistence shape (typed tables + a single `calculation_results` audit log) needed for historical replay. All math is pure JavaScript; nothing reaches an external service. The Phase 0 React/Vite/Tailwind frontend grows two pages: a Calculators surface (BMR / TDEE / macros / 1RM / body comp ad-hoc forms) and a read-only Nutrition view of the active program's daily targets. Engine constants are defaults in code with per-athlete overrides on `app_config.engine_overrides` (JSONB), and the engine snapshots its resolved constants onto every persisted run so historical results stay reproducible even after a default changes.

## Technical Context

**Language/Version**: Node.js 20+ (project runs on 22.17 in dev), JavaScript ES2022 ESM. React 18.3 for the frontend.

**Primary Dependencies** (all already installed in Phase 0; nothing new at runtime):

- Backend: `express`, `@supabase/supabase-js`, `pino`, `pino-http`, `dotenv`, `zod`, `uuid`, `cors`. No new runtime dependencies for Phase 1 — the engine is pure JavaScript.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`. New dev addition for routing: `react-router-dom@^6` (the Calculators page and Nutrition view need navigation; Phase 0 had a single scaffold page).
- Tooling: `vitest` (already configured for unit + integration + contract suites), `@testing-library/react@^15` for the Calculators / Nutrition smoke tests.

**Storage**: Supabase PostgreSQL (cloud project, ref `anfrllxbetxpjkwqtkba`; local CLI stack remains as offline fallback per `quickstart.md` Path B). Phase 1 adds 5 new migrations and 1 schema-extension migration; no Phase 0 tables are altered destructively.

**Testing**: Vitest. Per Constitution Principle V, every calculator pure function (`services/engine/*.js`) and the progression rule engine (`services/progressionEngine.js`) ship with unit tests written first (red → green → refactor). Integration tests cover the persistence flow (program regeneration soft-archive, flag supersession, audit-log writes). Contract tests cover the new `/api/v1/*` endpoints. Frontend smoke tests cover the Calculators page and Nutrition view.

**Target Platform**: Same as Phase 0 — local dev on macOS/Linux, future deploy to a hosted Node container behind a Vite-built static bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). The engine lives under `/services/engine/` (one file per pure calculator) and `/services/progressionEngine.js`. The program generator already exists at `/services/programGenerator.js` — Phase 1 expands it to consume the new calculator engine and write through the soft-archive DAO.

**Performance Goals** (from Success Criteria):

- SC-001: end-to-end program generation ≤ 2 s from `POST /api/v1/program/regenerate` to response.
- SC-004: a progression flag triggered by a saved session is visible on the next read of `/api/v1/progression-flags` within 1 s of the save completing (Phase 1 ships the engine; Phase 4 wires the session-save trigger).
- SC-006: protein target reflects new lean body mass within 1 s of a body-weight save.
- SC-007: manual calculator on the Calculators page returns within 500 ms of submitting valid inputs.

**Constraints**:

- Determinism: no `Date.now()`, no `Math.random()`, no env reads inside engine pure functions. Time-dependent values (e.g. "this week's volume") are passed in by the caller.
- Engine-version pinning: every persisted calculation row carries the engine semver string and a `resolved_constants` JSONB snapshot of `default ⊕ athlete_override` so old rows can be replayed exactly.
- All domain rows continue to carry `athlete_id` and ship RLS in the same migration (Constitution I).
- No `@supabase/supabase-js` import outside `/services/dataAccess/*` (Constitution II).
- Configuration over hardcoding: every engine constant has a default in `services/engine/constants.js` and a per-athlete override path through `app_config.engine_overrides`.

**Scale/Scope**: 1 athlete in Phase 1, 6 new tables (5 typed + 1 audit log), 1 schema-extension migration, ~14 new HTTP endpoints, ~2,400 LOC backend (engine + DAOs + controllers + routes + migrations), ~900 LOC frontend (Calculators page + Nutrition view + shared form components), ~1,500 LOC tests.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**.
  - All 5 new typed tables (`generated_programs`, `progression_flags`, `one_rep_max_records`, `body_composition_results`, `calculation_results`) carry `athlete_id NOT NULL` from migration day one. Each ships RLS in the same migration following the Phase 0 pattern (`<table>_select_own` + `<table>_modify_own` policies indirected through `athletes.auth_user_id = auth.uid()`).
  - The `app_config` schema extension (adds `engine_overrides JSONB`) keeps the existing `app_config_self` policy; no policy change is needed because the predicate is unchanged.
  - The auth middleware from Phase 0 continues to gate every request; new routes are mounted under the existing `/api/v1/` pipeline so the same `req.athleteId` resolution applies.

- **II. Layered Architecture & Separation of Concerns** — **PASS**.
  - Engine pure functions (`services/engine/*.js` and `services/progressionEngine.js`) take explicit inputs, return explicit outputs, perform no I/O. They never import `@supabase/supabase-js`.
  - DAOs (`services/dataAccess/*.dao.js`) remain the only Supabase-import boundary; new DAOs (`generatedPrograms.dao.js`, `progressionFlags.dao.js`, `oneRepMaxRecords.dao.js`, `bodyComposition.dao.js`, `calculationResults.dao.js`, `appConfig.dao.js`) follow the Phase 0 shape.
  - Controllers orchestrate: read DAO → call engine → write DAO → audit-log write. No business logic in routes.
  - Frontend never imports the secret-key client; it reaches the new endpoints exclusively through `/api/v1/`.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**.
  - Engine constants live in `services/engine/constants.js` (defaults) plus per-athlete overrides on `app_config.engine_overrides`. The engine resolves every read as `default ⊕ override` and snapshots the result onto each persisted run.
  - No new env keys are introduced. The Phase 0 six-key set is sufficient.
  - No athlete data lives in source; the seed pipeline from Phase 0 continues to be the single source of athlete identity.

- **IV. Versioned API Contract** — **PASS**. All new endpoints live under `/api/v1/` (see `contracts/openapi.yaml`). Response envelopes use the existing `{ data: ... }` shape and the canonical error envelope from Phase 0; new fields are additive within v1.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Every calculator pure function and the progression rule engine ship with unit tests written first. Specifically, the following modules have RED-then-GREEN unit tests authored before implementation:
  - `services/engine/bmr.js` — Mifflin–St Jeor across both sexes.
  - `services/engine/tdee.js` — five-level activity factor.
  - `services/engine/macros.js` — protein floor, fat floor, ectomorph carb skew, mesomorph balance, endomorph fat skew, calorie-sum tolerance.
  - `services/engine/oneRepMax.js` — Epley / Brzycki / Lander / Lombardi individual values + averaged primary + percentage table monotonicity + reduced-confidence flag at reps>10.
  - `services/engine/bodyComposition.js` — multi-measurement (waist+neck+height) and BMI-based fallback, plausibility ranges.
  - `services/progressionEngine.js` — double-progression positive/negative, stagnation 3-week, regression 2-week, deload-by-RPE, deload-by-double-regression, insufficient-history suppression.
  - `services/programGenerator.js` (extended) — soft-archive supersession behavior, idempotency on no-op profile change, full-program constraint set on the held-out 50-profile fixture.

- **VI. Athlete-First UX** — **PARTIAL → PASS**. Phase 1 ships two surfaces:
  - **Calculators page** (US6): one navigable page, sub-routes per calculator (`/calculators/bmr`, `/calculators/tdee`, etc.) using `react-router-dom`. Tailwind utilities only; design tokens from `frontend/src/styles/tokens.css`. Form inputs use the same large hit-target convention the Phase 4 journal will need; even though Phase 1 doesn't have set-logging, building the input pattern now keeps Phase 4 cheap.
  - **Nutrition view**: read-only display of `calories / protein g / carbs g / fat g` for the active program, plus the per-meal breakdown from the existing nutrition_template_meals. No charts in Phase 1.
  - One-handed operability and 30-second auto-save activate when the journal screen ships in Phase 4 — Phase 1 has no editing surfaces other than the Calculators forms (which are explicitly _not_ persisting), so the auto-save rule does not apply.

**Post-design re-check (after Phase 1 artifacts)**: still **PASS** —

- `data-model.md` enumerates the 5 new tables + the `app_config` extension; every domain table carries `athlete_id` and ships RLS.
- `contracts/openapi.yaml` keeps every new path under `/api/v1/` with the `{ data }` envelope; the canonical error envelope from Phase 0 is reused unchanged.
- The proposed source layout keeps Supabase imports inside `services/dataAccess/*` and engine logic inside pure modules under `services/engine/` and `services/progressionEngine.js`. No `models/` directory is introduced.
- The performance goals are within reach against the cloud Supabase project (Phase 0 measured ~50–170 ms per indexed `select`; the program-generation flow is at most 6 sequential write paths plus the audit-log row, comfortably under SC-001's 2 s budget).

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/002-calculators-engine/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-05-07)
├── research.md          # Phase 0 of plan — calculator/rule decisions and rationale
├── data-model.md        # Phase 1 of plan — 5 new tables + app_config extension
├── quickstart.md        # Phase 1 of plan — operator's guide to running the engine
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — new /api/v1/* endpoints
├── checklists/
│   └── ...              # From earlier /speckit-* runs (if any)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 1 extends the Phase 0 layout. **Bold** = new in Phase 1; everything else already exists.

```text
masslab/
├── routes/
│   ├── athlete.routes.js                # extended: PATCH /me triggers conditional regenerate
│   ├── exercises.routes.js
│   ├── weeklyPlan.routes.js
│   ├── trainingPhases.routes.js
│   ├── nutrition.routes.js              # extended: GET /macros/today (active program targets)
│   ├── supplements.routes.js
│   ├── foods.routes.js
│   ├── quotes.routes.js
│   ├── program.routes.js                # NEW: GET /, POST /regenerate, GET /history
│   ├── calculators.routes.js            # NEW: POST /bmr, /tdee, /macros, /1rm, /body-composition
│   ├── oneRepMaxRecords.routes.js       # NEW: POST /, GET /, GET /:exerciseId/latest
│   └── progressionFlags.routes.js       # NEW: GET / (active), GET /history, POST /evaluate
├── controllers/
│   ├── athlete.controller.js            # extended
│   ├── ...                              # existing controllers unchanged
│   ├── program.controller.js            # NEW
│   ├── calculators.controller.js        # NEW
│   ├── oneRepMaxRecords.controller.js   # NEW
│   └── progressionFlags.controller.js   # NEW
├── services/
│   ├── programGenerator.js              # extended: soft-archive write, full-program assembly
│   ├── progressionEngine.js             # NEW: pure rule eval (4 rules + suppression)
│   ├── engine/                          # NEW directory: every calculator is pure
│   │   ├── constants.js                 # NEW: engine defaults (surplus, increments, windows…)
│   │   ├── bmr.js                       # NEW: Mifflin–St Jeor
│   │   ├── tdee.js                      # NEW: 5-level activity factor
│   │   ├── macros.js                    # NEW: protein-first split, morphotype skew
│   │   ├── oneRepMax.js                 # NEW: 4 formulas + average + % table
│   │   ├── bodyComposition.js           # NEW: multi-measurement + BMI fallback
│   │   └── resolveConstants.js          # NEW: default ⊕ athlete_override merge
│   ├── dataAccess/
│   │   ├── athletes.dao.js              # extended: activity_level read/write
│   │   ├── exercises.dao.js
│   │   ├── weeklyPlan.dao.js
│   │   ├── trainingPhases.dao.js
│   │   ├── nutrition.dao.js
│   │   ├── supplements.dao.js
│   │   ├── foods.dao.js
│   │   ├── quotes.dao.js
│   │   ├── generatedPrograms.dao.js     # NEW: findActive, listHistory, archiveAndInsert
│   │   ├── progressionFlags.dao.js      # NEW: findActiveForAthlete, supersedeAndInsert
│   │   ├── oneRepMaxRecords.dao.js      # NEW: insert, listForAthlete, latestForExercise
│   │   ├── bodyComposition.dao.js       # NEW: insert, latestForAthlete
│   │   ├── calculationResults.dao.js    # NEW: insert (append-only audit), listForAthlete
│   │   └── appConfig.dao.js             # NEW: getOverridesFor, setOverridesFor
│   ├── photoStorage/                    # unchanged
│   └── logger.js                        # unchanged
├── middleware/                          # unchanged from Phase 0
├── config/                              # unchanged
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260428000001_init_athletes.sql … 20260428000014_init_app_config.sql  (Phase 0)
│   │   ├── 20260507000001_extend_athletes_activity_level.sql        # NEW
│   │   ├── 20260507000002_init_generated_programs.sql               # NEW
│   │   ├── 20260507000003_init_progression_flags.sql                # NEW
│   │   ├── 20260507000004_init_one_rep_max_records.sql              # NEW
│   │   ├── 20260507000005_init_body_composition_results.sql         # NEW
│   │   ├── 20260507000006_init_calculation_results.sql              # NEW
│   │   └── 20260507000007_extend_app_config_engine_overrides.sql    # NEW
│   └── seed.sql                          # unchanged (still empty)
├── seed/
│   ├── athlete.seed.js                  # extended: adds activity_level
│   ├── ...                              # other JSON seeds unchanged
│   └── runSeed.js                       # extended: writes initial active program row
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   └── api.js                   # extended: apiPost helper
│   │   ├── pages/
│   │   │   ├── ScaffoldHome.jsx         # existing — kept as `/`
│   │   │   ├── NutritionHome.jsx        # NEW: read-only daily targets
│   │   │   └── calculators/             # NEW: one component per calculator
│   │   │       ├── CalculatorsHome.jsx
│   │   │       ├── BmrCalculator.jsx
│   │   │       ├── TdeeCalculator.jsx
│   │   │       ├── MacrosCalculator.jsx
│   │   │       ├── OneRepMaxCalculator.jsx
│   │   │       └── BodyCompositionCalculator.jsx
│   │   ├── components/                  # NEW: shared form primitives
│   │   │   ├── NumberField.jsx
│   │   │   ├── SelectField.jsx
│   │   │   └── ResultCard.jsx
│   │   ├── styles/tokens.css            # unchanged
│   │   ├── App.jsx                      # extended: Router with three top-level pages
│   │   └── main.jsx                     # unchanged
│   ├── tailwind.config.js               # unchanged
│   ├── vite.config.js                   # unchanged
│   ├── vitest.config.js                 # unchanged
│   └── package.json                     # adds react-router-dom
└── tests/
    ├── unit/
    │   ├── engine.bmr.test.js                       # NEW (TDD red)
    │   ├── engine.tdee.test.js                      # NEW (TDD red)
    │   ├── engine.macros.test.js                    # NEW (TDD red)
    │   ├── engine.oneRepMax.test.js                 # NEW (TDD red)
    │   ├── engine.bodyComposition.test.js           # NEW (TDD red)
    │   ├── engine.resolveConstants.test.js          # NEW
    │   ├── progressionEngine.test.js                # NEW (TDD red, replaces Phase 0 stub)
    │   └── programGenerator.test.js                 # extended: soft-archive, fixture set
    ├── integration/
    │   ├── program.regenerate.test.js               # NEW: profile change → archive prior, write new
    │   ├── progression.flags.lifecycle.test.js      # NEW: flag supersession across re-evals
    │   ├── oneRepMaxRecords.persist.test.js         # NEW
    │   ├── bodyComposition.refresh.test.js          # NEW: weight entry → LBM → protein refresh
    │   ├── calculationResults.audit.test.js         # NEW: audit row written on persisted runs
    │   └── ...                                      # Phase 0 integration tests unchanged
    ├── contract/
    │   └── api.v1.test.js                           # extended: covers new endpoints from openapi.yaml
    └── frontend/
        ├── scaffold.test.jsx                        # unchanged
        ├── calculatorsPage.test.jsx                 # NEW: renders each calculator, submits, shows result
        └── nutritionView.test.jsx                   # NEW: renders active targets, no recompute on read
```

**Structure Decision**: Phase 1 grows the existing layout rather than introducing new top-level directories. Two intentional additions:

1. `services/engine/` is a new sub-directory because Phase 1 introduces five distinct pure calculators plus a constants resolver; bundling them under `services/engine/` keeps the existing top-level `services/` from becoming cluttered and makes the engine boundary visually obvious in code review (everything under `services/engine/` is pure; nothing imports `@supabase/supabase-js`).
2. `frontend/src/pages/calculators/` is a sub-directory because the Calculators surface is one logical page with five sub-views routed by `react-router-dom`. The Nutrition view sits beside it as a peer page.

Migrations are timestamped `20260507000001`–`20260507000007` so they sort lexically after every Phase 0 file (`20260428…`). No Phase 0 migration is altered; the only Phase 0 schema touched is `athletes` (column add) and `app_config` (column add) — both backward-compatible additions.

## Complexity Tracking

> Constitution Check is clean; this section is intentionally empty.
