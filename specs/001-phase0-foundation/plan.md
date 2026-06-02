# Implementation Plan: Phase 0 — Foundation and Architecture

**Branch**: `001-phase0-foundation` | **Date**: 2026-04-28 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-phase0-foundation/spec.md`

## Summary

Build the project skeleton, schema, seed, middleware seams, and frontend scaffold that every later phase will read from and write to. The deliverable is an `npm install && npm start`-able **Node.js + Express** API backed by **Supabase PostgreSQL**, paired with a **React + Vite + Tailwind CSS** frontend scaffold served from `/frontend`. On bring-up, Supabase migrations create the schema (with `athlete_id` and Row-Level Security on every domain table), a seed script populates the program for the athlete described in PLAN.md, and the API serves a minimal versioned read-only HTTP surface at `/api/v1/`. Everything is wired so going multi-user later is a configuration change, not a rewrite: every domain row carries `athlete_id`, RLS policies are already in place, an auth middleware sits in the pipeline gated by `SINGLE_USER_MODE`, configuration is loaded through an adapter, photo storage is behind an adapter from day one, and Supabase Auth owns credential storage so the application never hashes passwords itself.

## Technical Context

**Language/Version**: Node.js 20.x LTS, JavaScript (ES2022+, ESM modules). React 18.x for the frontend. PostgreSQL 15.x via Supabase.

**Primary Dependencies**:

- Backend: `express` 4.x (HTTP), `@supabase/supabase-js` 2.x (Supabase JS client), `pino` (structured logging), `dotenv` (env loader), `zod` (config + request schema validation), `uuid` (request-id), Vitest + Supertest (tests).
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `postcss`, `autoprefixer`. Vitest + `@testing-library/react` for smoke tests.
- Tooling: `concurrently` to boot backend + frontend with a single `npm start`. `supabase` CLI (developer machine prerequisite, not an npm dep) for the local Supabase stack and migrations.

**Storage**: Supabase PostgreSQL. In development the operator runs the local Supabase stack via the Supabase CLI (`supabase start`), which boots a containerised Postgres + Supabase services. Migrations live in `supabase/migrations/<timestamp>_<name>.sql` and are applied with `supabase migration up` (local) or `supabase db push` (remote). Photo binaries do **not** live in Postgres — they go through the `photo_storage` adapter (default = local filesystem under `./data/photos/<athlete_id>/`; future swap to Supabase Storage through the same interface).

**Testing**: Vitest for unit and integration tests (backend); Supertest for HTTP integration tests against the Express app composed without binding a port; Vitest + React Testing Library for the frontend scaffold smoke test. Per Constitution Principle V, the program generator and any calculator-shaped logic ship with tests written first (red → green → refactor).

**Target Platform**: Local development on macOS / Linux; future deploy target is a hosted Supabase project plus a Linux container running the Node API. The frontend is a Vite-built static bundle served either by `vite preview` in dev or by Express (or any static host / Supabase static hosting) in production.

**Project Type**: Web application — backend Node web service at the repo root, frontend React/Vite/Tailwind app under `/frontend`. This matches PLAN.md's named layout (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). No `/models` directory: per constitution Principle II, Supabase client calls live behind data-access modules colocated with the services that own them.

**Performance Goals**:

- Cold start (Supabase already up) ≤ 10 s including any pending migrations + first-run seed.
- Warm start ≤ 5 s.
- Per-request HTTP handling ≤ 50 ms median for the read endpoints in this phase against the local Supabase stack.

**Constraints**:

- Local-dev does not require any external network beyond the local Supabase stack (which itself runs on the operator's machine via Docker). No third-party APIs are reached during Phase 0 execution.
- Idempotent seed (re-runnable safely; uses upserts keyed on stable natural keys).
- Every domain query MUST be scoped by `athlete_id`. Every domain table MUST ship its RLS policy in the same migration as the table.
- Configuration loaded through the `.env` adapter only; `SUPABASE_SECRET_KEY` (`sb_secret_…`) is server-only; only `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) is exposed to the frontend. Legacy `anon`/`service_role` keys MUST NOT appear.
- Constitution v1.1.1 governs.

**Scale/Scope**: 1 athlete in Phase 0; 14 domain tables; 9 HTTP endpoints; estimated ≈ 3,200 LOC backend source + ≈ 800 LOC frontend scaffold + ≈ 1,200 LOC tests + ≈ 600 LOC SQL migrations and seed.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**.
  - Every domain table includes a non-null `athlete_id` foreign key from its first migration (FR-002, see `data-model.md`).
  - Every domain table ships an RLS policy in the same migration. The policy is keyed on `auth.uid()` and matched against `athletes.auth_user_id`. RLS is enabled but effectively bypassed in single-user mode (the server uses the `SUPABASE_SECRET_KEY` which is exempt from RLS by design); the policies are exercised by integration tests under simulated multi-user mode.
  - Auth middleware sits in the pipeline at all times, gated by `SINGLE_USER_MODE` (FR-005, FR-016). Single-user mode resolves every request to the seeded athlete; multi-user mode validates a Supabase-issued bearer token and rejects unauthenticated requests.
  - Credential storage is delegated to Supabase Auth (`auth.users`), removing an entire class of password-handling bugs from the application surface (see clarification 2026-04-28).

- **II. Layered Architecture & Separation of Concerns** — **PASS**.
  - Routes hold no business logic (FR-007); they parse, validate the envelope, and call controllers.
  - Controllers orchestrate; services hold business logic. The program generator (`/services/programGenerator.js`) is a pure function — explicit inputs (athlete profile), explicit outputs (training plan + macro targets + supplement stack + recovery guidelines), no I/O.
  - Supabase client calls are confined to data-access modules under `/services/dataAccess/` (one module per aggregate). Routes, controllers, and pure service functions never import `@supabase/supabase-js` directly.
  - The frontend never imports the secret-key client; it only ever reads `SUPABASE_PUBLISHABLE_KEY` via Vite's runtime config, and even that is only used for future Supabase Auth flows — Phase 0 frontend reaches the API exclusively through `/api/v1/`.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**.
  - All env values via the adapter-backed loader (FR-006); `.env` gitignored; `.env.example` committed (FR-017); no athlete data in source (FR-013, SC-007).
  - The required env keys are exactly: `SINGLE_USER_MODE`, `PORT`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY` (server-only), `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGIN`. The legacy `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` are forbidden — a config-schema test asserts they are not accepted.
  - The config schema tags `SUPABASE_SECRET_KEY` (and any future credential) as `secret` so the startup log redacts it.

- **IV. Versioned API Contract** — **PASS**. All endpoints under `/api/v1/` (FR-004, SC-009). See `contracts/openapi.yaml`. Response bodies are JSON envelopes that are stable for v1.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. The program generator (FR-008) ships with unit tests written first. Calculators are not built in Phase 0 (deferred to Phase 1). The RLS policy assertions, the auth-mode switch, the tenant scoping, the seed idempotency, the config schema, and the photo storage adapter all carry integration or unit tests.

- **VI. Athlete-First UX** — **N/A but partially activated**. Phase 0 does not ship any athlete-facing screen — the frontend is a scaffold (Vite + Tailwind compile cleanly, dev server runs, a placeholder route fetches `GET /api/v1/athlete/me` and renders the seeded display name to prove plumbing). The scaffold MUST already use Tailwind utilities (no ad-hoc CSS) and MUST already wire the Frontend Design skill's design tokens, so Phase 2+ inherits a clean baseline. The one-handed-operability and 30-second auto-save requirements activate when the Journal screen ships (Phase 4).

**Post-design re-check (after Phase 1 artifacts)**: still **PASS** — `data-model.md` preserves Principle I across all 14 tables and pairs each with an RLS policy; `contracts/openapi.yaml` keeps every route under `/api/v1/`; the request/response shapes for tenant-scoping and request-correlation match FR-018/FR-019; the data-access boundary in the proposed source layout keeps Supabase client imports out of routes, controllers, and pure services.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/001-phase0-foundation/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified, supabase-aligned)
├── research.md          # Phase 0 output — stack decisions and rationale
├── data-model.md        # Phase 1 output — full schema in tabular DDL + RLS
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
├── routes/                            # /api/v1/* thin HTTP-only shells
│   ├── athlete.routes.js
│   ├── exercises.routes.js
│   ├── weeklyPlan.routes.js
│   ├── trainingPhases.routes.js
│   ├── nutrition.routes.js
│   ├── supplements.routes.js
│   ├── foods.routes.js
│   └── quotes.routes.js
├── controllers/                       # one per route file
│   ├── athlete.controller.js
│   ├── exercises.controller.js
│   └── ...
├── services/
│   ├── programGenerator.js            # pure function: profile → program
│   ├── calculators.js                 # placeholder; Phase 1 fills it
│   ├── dataAccess/                    # ONLY layer that imports supabase-js
│   │   ├── supabaseClient.js          # server-side client, uses SECRET_KEY
│   │   ├── athletes.dao.js
│   │   ├── exercises.dao.js
│   │   ├── weeklyPlan.dao.js
│   │   ├── trainingPhases.dao.js
│   │   ├── nutrition.dao.js
│   │   ├── supplements.dao.js
│   │   ├── foods.dao.js
│   │   └── quotes.dao.js
│   ├── photoStorage/
│   │   ├── index.js                   # adapter interface
│   │   ├── filesystemAdapter.js       # default
│   │   └── photoStorage.contract.js   # contract test fixture
│   └── logger.js                      # pino instance + redaction
├── config/
│   ├── index.js                       # adapter-backed loader
│   ├── dotenvAdapter.js
│   └── schema.js                      # zod schema, tags SECRET keys
├── middleware/
│   ├── requestId.js                   # generates UUID, runs first
│   ├── auth.js                        # gated by SINGLE_USER_MODE
│   ├── tenantScope.js                 # populates req.athleteId
│   ├── requestLogger.js               # one structured line per request
│   └── errorHandler.js
├── supabase/
│   ├── config.toml                    # generated by `supabase init`
│   ├── migrations/
│   │   ├── 20260428000001_init_athletes.sql
│   │   ├── 20260428000002_init_exercises.sql
│   │   ├── 20260428000003_init_weekly_plan.sql
│   │   ├── 20260428000004_init_training_phases.sql
│   │   ├── 20260428000005_init_nutrition.sql
│   │   ├── 20260428000006_init_supplements.sql
│   │   ├── 20260428000007_init_foods.sql
│   │   ├── 20260428000008_init_quotes.sql
│   │   ├── 20260428000009_init_session_journal.sql
│   │   ├── 20260428000010_init_body_measurements.sql
│   │   ├── 20260428000011_init_athlete_photos.sql
│   │   ├── 20260428000012_init_recovery_log.sql
│   │   └── 20260428000013_init_app_config.sql
│   └── seed.sql                       # static reference seed (locales, etc.)
├── seed/
│   ├── athlete.seed.js                # current-athlete profile (from PLAN.md)
│   ├── exercises.seed.json            # 18+ fr-FR exercises
│   ├── foods.seed.json                # 50 fr-FR foods
│   ├── supplements.seed.json          # 5 fr-FR supplements
│   ├── trainingPhases.seed.json       # 3 phases
│   ├── nutritionTemplate.seed.json
│   ├── quotes.seed.json               # 30 fr-FR quotes
│   ├── weeklyPlan.seed.js             # built from athlete + exercises
│   └── runSeed.js                     # idempotent, transactional, uses DAOs
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   └── api.js                 # fetches /api/v1/* with credentials
│   │   ├── pages/
│   │   │   └── ScaffoldHome.jsx       # placeholder; renders seeded name
│   │   ├── styles/
│   │   │   └── tokens.css             # Tailwind @layer base tokens
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── index.html
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   ├── vite.config.js
│   └── package.json                   # workspace member
├── data/                              # gitignored runtime data
│   └── photos/                        # photo_storage local adapter root
├── tests/
│   ├── unit/
│   │   ├── programGenerator.test.js   # written FIRST (TDD per Principle V)
│   │   ├── config.schema.test.js      # rejects legacy keys, redacts secrets
│   │   └── photoStorage.local.test.js
│   ├── integration/
│   │   ├── seed.idempotent.test.js
│   │   ├── tenant.scoping.test.js     # uses two athletes + RLS
│   │   ├── auth.modeSwitch.test.js    # flag flip, no source change
│   │   ├── http.requestId.test.js
│   │   └── rls.policies.test.js       # asserts RLS denies cross-tenant reads
│   ├── contract/
│   │   └── api.v1.test.js             # exercises every endpoint in openapi.yaml
│   └── frontend/
│       └── scaffold.test.jsx          # smoke test: page renders, fetch wired
├── .env.example
├── .gitignore                         # data/photos/, .env, supabase/.branches/
├── app.js                             # Express app composition (no listen())
├── server.js                          # binds port, starts app
├── package.json                       # npm workspaces root; defines `start`, `dev`, `seed`, `db:reset`
└── README.md
```

**Structure Decision**: Top-level layout matches PLAN.md exactly (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). The added directories (`/supabase`, `/seed`, `/tests`, `/data`) are operationally required and PLAN.md's list is illustrative. There is no `/models` directory: persistence concerns live in `/services/dataAccess/`, which is the single boundary that imports `@supabase/supabase-js`. Frontend is an npm workspace under `/frontend`; the root `npm start` runs the API server and the Vite dev server concurrently.

## Complexity Tracking

> Constitution Check is clean; this section is intentionally empty.
