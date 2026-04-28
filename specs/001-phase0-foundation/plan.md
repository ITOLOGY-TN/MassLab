# Implementation Plan: Phase 0 — Foundation and Architecture

**Branch**: `001-phase0-foundation` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-phase0-foundation/spec.md`

## Summary

Build the project skeleton, schema, seed, and middleware seams that all later phases will read from and write to. The deliverable is an `npm install && npm start`-able Node.js + Express + SQLite application that, on first launch, creates the database, runs migrations, seeds the program for the athlete described in PLAN.md, and serves a minimal versioned read-only HTTP API. Everything is wired so going multi-user later is a configuration change, not a rewrite: every domain row carries `athlete_id`, an auth middleware sits in the pipeline gated by `SINGLE_USER_MODE`, configuration is loaded through an adapter, and photo storage is behind an adapter from day one.

## Technical Context

**Language/Version**: Node.js 20.x LTS, JavaScript (ES2022+, ESM modules). Vanilla JS for any UI (UI not in scope this phase).
**Primary Dependencies**: Express 4.x (HTTP), better-sqlite3 (synchronous SQLite, single-process best-fit), pino (structured logging), dotenv (env loader), bcrypt (password hashing — seam only this phase), zod (config + request schema validation), Vitest + Supertest (tests).
**Storage**: SQLite file at `./data/masslab.db`, accessed via better-sqlite3. Migrations are forward-only `.sql` files under `./migrations/` run by a small custom migration runner.
**Testing**: Vitest for unit and integration tests; Supertest for HTTP integration tests. Per the constitution, the program generator and any calculator-shaped logic ship with tests written first.
**Target Platform**: Local development on macOS / Linux; future deploy target is Linux containers.
**Project Type**: Single Node web service with a static-asset directory for the future UI. Layout per PLAN.md: `/routes`, `/controllers`, `/services`, `/models`, `/public`, `/data`, plus `/middleware`, `/migrations`, `/seed`, `/tests` (illustrative additions allowed by PLAN.md's "service layer" wording).
**Performance Goals**: Cold start (no DB) ≤30 s including migrations + seed; warm start ≤5 s; per-request HTTP handling ≤50 ms median for the read endpoints in this phase.
**Constraints**: Offline-capable (no outbound network); idempotent seed; every domain query scoped by `athlete_id`; configuration via the `.env` adapter only.
**Scale/Scope**: 1 athlete in Phase 0; 14 domain tables; 9 HTTP endpoints; estimated ≈3,500 LOC for source + ≈1,200 LOC for tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reviewed against `.specify/memory/constitution.md` v1.0.0:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — PASS. Every domain table includes a non-null `athlete_id` foreign key from migration 0001 (FR-002). Auth middleware sits in the pipeline at all times, gated by `SINGLE_USER_MODE` (FR-005). Single-user mode injects athlete id 1; multi-user mode rejects unauthenticated requests (FR-016). See `data-model.md`.
- **II. Layered Architecture & Separation of Concerns** — PASS. Routes hold no business logic (FR-007); services are pure functions where applicable (program generator, future calculators); models hold all persistence; middleware lives in `/middleware`.
- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — PASS. All env values via the adapter-backed loader (FR-006); `.env` gitignored; `.env.example` committed (FR-017); no athlete data in source (FR-013, SC-007).
- **IV. Versioned API Contract** — PASS. All endpoints under `/api/v1/` (FR-004, SC-009). See `contracts/openapi.yaml`.
- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — PASS. The program generator (FR-008) ships with unit tests written first. Calculators are not built in Phase 0 (deferred to Phase 1).
- **VI. Athlete-First UX** — N/A for this phase. No UI ships in Phase 0; the principle activates in Phase 2+ when screens appear. Documented in spec Assumptions.

**Post-design re-check (after Phase 1 artifacts)**: still PASS — the schema (`data-model.md`) preserves Principle I across all 14 tables; the contract (`contracts/openapi.yaml`) keeps every route under `/api/v1/`; the request/response shapes for tenant-scoping and request-correlation match FR-018/FR-019.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-phase0-foundation/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified)
├── research.md          # Phase 0 output — stack decisions and rationale
├── data-model.md        # Phase 1 output — full schema in tabular DDL
├── quickstart.md        # Phase 1 output — operator's bring-up guide
├── contracts/
│   └── openapi.yaml     # Phase 1 output — REST surface for this phase
├── checklists/
│   └── requirements.md  # From /speckit-specify
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

```text
masslab/
├── routes/                       # /api/v1/* thin HTTP-only shells
│   ├── athlete.routes.js
│   ├── exercises.routes.js
│   ├── weeklyPlan.routes.js
│   ├── trainingPhases.routes.js
│   ├── nutrition.routes.js
│   ├── supplements.routes.js
│   ├── foods.routes.js
│   └── quotes.routes.js
├── controllers/                  # one per route file
│   ├── athlete.controller.js
│   ├── exercises.controller.js
│   └── ...
├── services/
│   ├── programGenerator.js       # pure function: profile → program
│   ├── calculators.js            # placeholder; Phase 1 fills it
│   ├── photoStorage/             # adapter interface + local impl
│   │   ├── index.js
│   │   ├── filesystemAdapter.js
│   │   └── photoStorage.contract.js
│   ├── config/                   # adapter-backed loader
│   │   ├── index.js
│   │   ├── dotenvAdapter.js
│   │   └── schema.js             # zod schema with secret tags
│   └── logger.js                 # pino instance + redaction
├── models/                       # one file per entity, encapsulates SQL
│   ├── athlete.model.js
│   ├── exercise.model.js
│   ├── weeklyPlan.model.js
│   └── ...
├── middleware/
│   ├── requestId.js              # generates UUID, runs first
│   ├── auth.js                   # gated by SINGLE_USER_MODE
│   ├── tenantScope.js            # populates req.athleteId
│   ├── requestLogger.js          # one structured line per request
│   └── errorHandler.js
├── migrations/
│   ├── 0001_init_athletes.sql
│   ├── 0002_init_exercises.sql
│   ├── 0003_init_weekly_plan.sql
│   ├── 0004_init_training_phases.sql
│   ├── 0005_init_nutrition.sql
│   ├── 0006_init_supplements.sql
│   ├── 0007_init_foods.sql
│   ├── 0008_init_quotes.sql
│   ├── 0009_init_session_journal.sql
│   ├── 0010_init_body_measurements.sql
│   ├── 0011_init_athlete_photos.sql
│   ├── 0012_init_recovery_log.sql
│   ├── 0013_init_app_config.sql
│   └── runner.js                 # forward-only migration runner
├── seed/
│   ├── athlete.seed.js
│   ├── exercises.seed.json       # 18+ fr-FR exercises
│   ├── foods.seed.json           # 50 fr-FR foods
│   ├── supplements.seed.json     # 5 fr-FR supplements
│   ├── trainingPhases.seed.json  # 3 phases
│   ├── nutritionTemplate.seed.json
│   ├── quotes.seed.json          # 30 fr-FR quotes
│   ├── weeklyPlan.seed.js        # built from athlete + exercises
│   └── runSeed.js                # idempotent, transactional
├── public/                       # future UI assets (empty in Phase 0)
├── data/                         # gitignored runtime data
│   ├── masslab.db                # SQLite file
│   └── photos/                   # photo_storage local adapter root
├── tests/
│   ├── unit/
│   │   ├── programGenerator.test.js
│   │   ├── config.schema.test.js
│   │   └── photoStorage.local.test.js
│   ├── integration/
│   │   ├── seed.idempotent.test.js
│   │   ├── tenant.scoping.test.js
│   │   ├── auth.modeSwitch.test.js
│   │   └── http.requestId.test.js
│   └── contract/
│       └── api.v1.test.js        # exercises every endpoint in openapi.yaml
├── .env.example
├── .gitignore                    # data/masslab.db, data/photos/, .env
├── app.js                        # Express app composition (no listen())
├── server.js                     # binds port, starts app
├── package.json
└── README.md
```

**Structure Decision**: Single Node web service per PLAN.md. Top-level directories follow PLAN.md exactly (`/routes`, `/controllers`, `/services`, `/models`, `/public`, `/data`); `/middleware`, `/migrations`, `/seed`, `/tests` are added because PLAN.md's list is illustrative ("strict MVC architecture with a service layer") and these directories are required by the FR set. No `/src` wrapper because PLAN.md explicitly names paths starting at the repo root.

## Complexity Tracking

> Constitution Check is clean; this section is intentionally empty.
