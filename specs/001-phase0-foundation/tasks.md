---
description: 'Task list for MassLab Phase 0 — Foundation and Architecture (Supabase stack)'
---

# Tasks: Phase 0 — Foundation and Architecture

**Input**: Design documents from `/specs/001-phase0-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml
**Constitution**: v1.1.1 (Supabase stack: Node + Express + Supabase Postgres + Supabase Auth + React/Vite/Tailwind)

**Tests**: Phase 0 ships strict TDD only for the program generator (Constitution Principle V — domain-logic-only). Other tests are integration / contract / smoke tests written alongside or right after their target file (still merged in this phase). Calculator-shaped logic is deferred to Phase 1.

**Organization**: Tasks are grouped by user story. US1 and US2 are both P1; US1 is treated as the MVP because it produces visible, demoable seed data. US2 is verification-heavy and rides on the architecture established in Foundational + US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Different file, no dependency on incomplete tasks → safe to run in parallel.
- **[Story]**: `[US1]`–`[US4]` only on user-story tasks. Setup, Foundational, and Polish carry no story label.
- All file paths are repository-relative.

## Path Conventions

- Backend at repo root: `routes/`, `controllers/`, `services/`, `services/dataAccess/`, `middleware/`, `config/`, `seed/`, `tests/`, `supabase/migrations/`.
- Frontend under `frontend/` (npm workspace). Tests for the frontend live under `tests/frontend/`.
- **No `models/` directory** — all Supabase client calls are confined to `services/dataAccess/*`. Constitution Principle II forbids `@supabase/supabase-js` imports outside that directory and the frontend's own scaffolded client.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, dependency installation, tooling.

- [x] T001 Initialize root `package.json` with npm workspaces (root + `frontend`), engines `node >=20`, scripts: `start`, `dev`, `seed`, `db:reset`, `test`, `test:contract`, `lint`, `format`
- [x] T002 [P] Create `.gitignore` covering `node_modules/`, `.env`, `data/`, `frontend/dist/`, `supabase/.branches/`, `supabase/.temp/`, `coverage/`, `.DS_Store`
- [x] T003 [P] Create `.env.example` listing exactly the six keys (`SINGLE_USER_MODE=true`, `PORT=3000`, `SUPABASE_URL=`, `SUPABASE_SECRET_KEY=`, `SUPABASE_PUBLISHABLE_KEY=`, `CORS_ORIGIN=http://localhost:5173`) with placeholder values and inline comments naming the legacy keys (`anon`/`service_role`) as forbidden
- [x] T004 [P] Install backend dependencies (`express`, `@supabase/supabase-js`, `pino`, `pino-http`, `dotenv`, `zod`, `uuid`, `cors`) and devDeps (`vitest`, `supertest`, `concurrently`, `eslint`, `prettier`)
- [x] T005 [P] Scaffold the Vite + React + Tailwind frontend at `frontend/` (`npm create vite@latest frontend -- --template react`, then add `tailwindcss`, `postcss`, `autoprefixer`); commit `frontend/package.json` as a workspace member
- [x] T006 [P] Configure ESLint + Prettier at repo root (`.eslintrc.cjs`, `.prettierrc`); add `lint` and `format` scripts in root `package.json`
- [x] T007 Run `supabase init` to create `supabase/config.toml`; commit it
- [x] T008 [P] Add `vitest.config.js` at repo root with separate projects for `unit`, `integration`, `contract`, and a `frontend` project rooted at `frontend/`
- [x] T009 [P] Configure `frontend/tailwind.config.js` with the Phase 0 design tokens (color, spacing, typography, radius); reference tokens via CSS vars defined in `frontend/src/styles/tokens.css`
- [x] T010 Wire root `npm start` to run the Express server and the Vite dev server in parallel via `concurrently` (Express on `PORT`, Vite on its default `5173`)

**Checkpoint**: `npm install` succeeds at the root and `supabase start` boots a local stack.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-cutting plumbing every user story depends on.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T011 Create configuration schema in `config/schema.js` using `zod`: defines all six required keys, tags `SUPABASE_SECRET_KEY` as `secret`, **rejects** the legacy `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_ANON_KEY` keys with a named error, validates `SUPABASE_SECRET_KEY` starts with `sb_secret_` and `SUPABASE_PUBLISHABLE_KEY` starts with `sb_publishable_`
- [x] T012 Create dotenv adapter in `config/dotenvAdapter.js` (single function `loadFromDotenv()` returning a flat object)
- [x] T013 Create config loader in `config/index.js` that takes an adapter, validates against the schema (T011), and exports a frozen config object; throws a descriptive error per FR-010 / SC-008 when a required key is missing
- [x] T014 [P] Write config schema tests in `tests/unit/config.schema.test.js` covering: legacy-key rejection, missing-key fast-fail, secret tagging visible to the redactor, malformed key prefix rejection
- [x] T015 Create pino logger in `services/logger.js` with `redact` paths covering every `secret`-tagged config key + the `Authorization` header
- [x] T016 [P] Implement requestId middleware in `middleware/requestId.js` (FR-018): accepts client `X-Request-Id`, otherwise generates `uuid.v4()`, attaches to `req` and response header, runs first
- [x] T017 [P] Implement requestLogger middleware in `middleware/requestLogger.js` (FR-019): emits one structured line per request with `method`, `path`, `status`, `duration_ms`, `request_id`, and `athlete_id` if set
- [x] T018 [P] Implement errorHandler middleware in `middleware/errorHandler.js` returning the canonical error envelope from `contracts/openapi.yaml` and including `request_id`
- [x] T019 Create the server-side Supabase client in `services/dataAccess/supabaseClient.js` initialized with `SUPABASE_URL` + `SUPABASE_SECRET_KEY`; export a single shared instance; add a top-of-file comment forbidding imports outside `services/dataAccess/`
- [x] T020 Author the first migration `supabase/migrations/20260428000001_init_athletes.sql` creating the `athletes` table per `data-model.md` §1, including `auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL`, `pgcrypto` extension, indexes, **and** the `athletes_self` RLS policy in the same file
- [x] T021 Implement auth middleware in `middleware/auth.js` (FR-005, FR-016): when `SINGLE_USER_MODE=true`, resolves `req.athleteId` to the seeded athlete (lookup once, cache); when `false`, validates the bearer token via `supabase.auth.getUser(token)` and resolves `req.athleteId` from `athletes.auth_user_id`; rejects unauthenticated requests with the canonical 401 envelope; sits **after** `requestId` so rejected requests still carry a `request_id`
- [x] T022 [P] Write photo-storage adapter contract test in `tests/unit/photoStorage.local.test.js` (round-trip put/get/delete, key opacity)
- [x] T023 [P] Define the photo-storage interface in `services/photoStorage/index.js` (`put`, `get`, `delete`, `url`)
- [x] T024 [P] Implement the filesystem photo adapter in `services/photoStorage/filesystemAdapter.js` writing under `./data/photos/<athlete_id>/<uuid>.<ext>` and returning opaque keys (FR-021)
- [x] T025 Compose the Express app in `app.js`: pipeline order `cors → requestId → requestLogger → auth → routes → errorHandler`; export the app **without** binding a port
- [x] T026 Create `server.js` that loads config, binds `PORT`, and emits a single structured startup log line per FR-014 (loaded keys with secrets redacted, single-user-mode state, whether seeding occurred)

**Checkpoint**: `node server.js` boots, returns a 401 in multi-user mode for unauthenticated requests, and emits one structured log per request.

---

## Phase 3: User Story 1 — First Launch Is Ready to Use (Priority: P1) 🎯 MVP

**Goal**: A fresh clone, after the documented bring-up, displays the seeded athlete's full program (profile, exercise library, weekly plan, training phases, nutrition template, supplements, foods, quotes) without any user setup action.

**Independent Test**: Run the bring-up sequence from `quickstart.md` on a clean checkout. Open `http://localhost:5173`. The scaffold page renders the seeded athlete's `display_name`. Hitting each `/api/v1/*` endpoint returns the expected seeded payload (≥ 18 exercises, 5 weekly slots, 3 phases, 5 meals, 5 supplements, ≥ 50 foods, ≥ 30 quotes).

### TDD task — program generator (Principle V) ⚠️

> **MUST be written first and assert RED before T028.**

- [x] T027 [P] [US1] Write program-generator unit tests in `tests/unit/programGenerator.test.js`: given the PLAN.md athlete profile, asserts the returned program contains a 5-day training plan, daily kcal in the bulk surplus band (TDEE + 300–500), protein-first macro split honoring ectomorph carb skew, the 5-supplement stack, and recovery guidelines; assert purity (no I/O, deterministic across calls)

### Implementation — program generator

- [x] T028 [US1] Implement program generator in `services/programGenerator.js` as a pure function `(athleteProfile) => program`; passes T027 (no Supabase imports, no `Date.now()` reads, no env reads)

### Migrations (each ships table + RLS in the same file, per data-model.md)

- [x] T029 [P] [US1] `supabase/migrations/20260428000002_init_exercises.sql` — table + indexes + RLS policies
- [x] T030 [P] [US1] `supabase/migrations/20260428000003_init_weekly_plan.sql` — `weekly_plan_slots` and `weekly_plan_exercises` + indexes + RLS
- [x] T031 [P] [US1] `supabase/migrations/20260428000004_init_training_phases.sql`
- [x] T032 [P] [US1] `supabase/migrations/20260428000005_init_nutrition.sql` — `nutrition_template_meals`
- [x] T033 [P] [US1] `supabase/migrations/20260428000006_init_supplements.sql`
- [x] T034 [P] [US1] `supabase/migrations/20260428000007_init_foods.sql`
- [x] T035 [P] [US1] `supabase/migrations/20260428000008_init_quotes.sql`
- [x] T036 [P] [US1] `supabase/migrations/20260428000009_init_session_journal.sql`
- [x] T037 [P] [US1] `supabase/migrations/20260428000010_init_session_sets.sql`
- [x] T038 [P] [US1] `supabase/migrations/20260428000011_init_body_measurements.sql`
- [x] T039 [P] [US1] `supabase/migrations/20260428000012_init_athlete_photos.sql`
- [x] T040 [P] [US1] `supabase/migrations/20260428000013_init_recovery_log.sql`
- [x] T041 [P] [US1] `supabase/migrations/20260428000014_init_app_config.sql`

### Seed inputs (static reference data, locale `fr-FR`)

- [x] T042 [P] [US1] Author 18+ exercises in `seed/exercises.seed.json`
- [x] T043 [P] [US1] Author 50 foods (with macros per 100 g) in `seed/foods.seed.json`
- [x] T044 [P] [US1] Author 5 supplements in `seed/supplements.seed.json` (Creatine 5g, Serious Mass, Vitamin D3, Magnesium, Omega-3 — dosage + timing)
- [x] T045 [P] [US1] Author 3 training phases in `seed/trainingPhases.seed.json`
- [x] T046 [P] [US1] Author the nutrition template (5 meals) in `seed/nutritionTemplate.seed.json`
- [x] T047 [P] [US1] Author 30 motivational quotes in `seed/quotes.seed.json`
- [x] T048 [P] [US1] Compile static reference seed in `supabase/seed.sql` (uses `INSERT ... ON CONFLICT (locale, slug) DO NOTHING` against the JSON files via generated SQL — Supabase auto-runs this on `db reset`)

### Athlete-scoped seed

- [x] T049 [US1] Author the current athlete profile in `seed/athlete.seed.js` (29 yrs, 173 cm, 58 kg, ectomorph, intermediate, 5 sessions/week, +6–8 kg over 5 months — sourced from PLAN.md, **never** from a constant in `services/`)
- [x] T050 [US1] Build the weekly plan in `seed/weeklyPlan.seed.js` from the athlete + exercises (default 5-day split per PLAN.md; muscle groups configurable)
- [x] T051 [US1] Implement the seed runner in `seed/runSeed.js`: idempotent, transactional; calls `programGenerator(athleteProfile)` and upserts the resulting program through the data-access modules; safe to re-run
- [x] T052 [US1] Wire `npm run seed` and an optional `--seed` flag on `npm start` in root `package.json`

### Data-access modules (one per aggregate; only place that imports `supabase-js`)

- [x] T053 [P] [US1] `services/dataAccess/athletes.dao.js` — `findById`, `findBySeed`, `upsertProfile`
- [x] T054 [P] [US1] `services/dataAccess/exercises.dao.js` — `listForAthlete({ locale })`, `upsertMany`
- [x] T055 [P] [US1] `services/dataAccess/weeklyPlan.dao.js` — `listSlotsWithExercises(athleteId)`, `upsertSlot`, `upsertSlotExercise`
- [x] T056 [P] [US1] `services/dataAccess/trainingPhases.dao.js` — `listForAthlete({ locale })`, `upsertMany`
- [x] T057 [P] [US1] `services/dataAccess/nutrition.dao.js` — `listTemplateMeals(athleteId)`, `upsertMeal`
- [x] T058 [P] [US1] `services/dataAccess/supplements.dao.js` — `listForAthlete({ locale })`, `upsertMany`
- [x] T059 [P] [US1] `services/dataAccess/foods.dao.js` — `list({ athleteId, locale, category })`, `upsertMany`
- [x] T060 [P] [US1] `services/dataAccess/quotes.dao.js` — `list({ athleteId, locale })`, `pickToday(athleteId, locale)`

### Controllers (orchestrate, no Supabase imports)

- [x] T061 [P] [US1] `controllers/athlete.controller.js` — `getMe(req, res)` calls `athletes.dao.findById(req.athleteId)`
- [x] T062 [P] [US1] `controllers/exercises.controller.js` — `list(req, res)`
- [x] T063 [P] [US1] `controllers/weeklyPlan.controller.js` — `list(req, res)`
- [x] T064 [P] [US1] `controllers/trainingPhases.controller.js` — `list(req, res)`
- [x] T065 [P] [US1] `controllers/nutrition.controller.js` — `getTemplate(req, res)`
- [x] T066 [P] [US1] `controllers/supplements.controller.js` — `list(req, res)`
- [x] T067 [P] [US1] `controllers/foods.controller.js` — `list(req, res)` with `?category=` filter
- [x] T068 [P] [US1] `controllers/quotes.controller.js` — `list` and `getToday`

### Routes (thin shells under `/api/v1/`)

- [x] T069 [P] [US1] `routes/athlete.routes.js` — `GET /me`
- [x] T070 [P] [US1] `routes/exercises.routes.js` — `GET /` with `?locale=`
- [x] T071 [P] [US1] `routes/weeklyPlan.routes.js` — `GET /`
- [x] T072 [P] [US1] `routes/trainingPhases.routes.js` — `GET /`
- [x] T073 [P] [US1] `routes/nutrition.routes.js` — `GET /template`
- [x] T074 [P] [US1] `routes/supplements.routes.js` — `GET /`
- [x] T075 [P] [US1] `routes/foods.routes.js` — `GET /` with `?locale=&category=`
- [x] T076 [P] [US1] `routes/quotes.routes.js` — `GET /` and `GET /today`
- [x] T077 [US1] Register all routers under `/api/v1/` in `app.js` (depends on T069–T076)

### Frontend scaffold (Tailwind + tokens from day one)

- [x] T078 [P] [US1] Configure Vite proxy `/api/v1 → http://localhost:${PORT}` in `frontend/vite.config.js`
- [x] T079 [P] [US1] Define design tokens in `frontend/src/styles/tokens.css` (`@layer base` + CSS vars consumed by Tailwind config)
- [x] T080 [P] [US1] Implement `frontend/src/lib/api.js` with `apiGet(path)` reading `import.meta.env` for any base override; default same-origin
- [x] T081 [US1] Implement `frontend/src/pages/ScaffoldHome.jsx` fetching `/api/v1/athlete/me` and rendering `display_name` with Tailwind utility classes only (no ad-hoc CSS)
- [x] T082 [US1] Wire `frontend/src/App.jsx` and `frontend/src/main.jsx` to mount `<ScaffoldHome />`
- [x] T083 [P] [US1] Frontend smoke test in `tests/frontend/scaffold.test.jsx` (renders, fetch is wired, accessible heading present)

### Story-level integration & contract tests

- [x] T084 [US1] OpenAPI contract test in `tests/contract/api.v1.test.js` exercising every path in `contracts/openapi.yaml` against the booted Express app via Supertest (response shape, status codes, `X-Request-Id` echoed)
- [x] T085 [US1] Seed idempotency integration test in `tests/integration/seed.idempotent.test.js`: run seed twice, assert row counts unchanged for every seeded table (FR-011 / SC-005)

**Checkpoint**: US1 demoable end-to-end. Open the browser → see the seeded athlete name. Hit every `/api/v1/*` endpoint → see the expected payload.

---

## Phase 4: User Story 2 — Tenant-Isolated Data From Day One (Priority: P1)

**Goal**: Every domain row is scoped to its athlete; a hypothetical second athlete cannot see the seeded athlete's records.

**Independent Test**: Insert a second athlete row directly into Supabase. Issue a request authenticated as that second athlete. None of the seeded athlete's records appear in any `/api/v1/*` response.

> **NOTE**: The architectural work for US2 (every table has `athlete_id`, every table has RLS, DAOs filter by `req.athleteId`) is satisfied by the Foundational migrations (T020) and US1 migrations (T029–T041) and DAOs (T053–T060). US2 in this phase is **verification**.

- [x] T086 [P] [US2] Tenant-scoping integration test in `tests/integration/tenant.scoping.test.js`: seeds a second athlete via the dao, switches the auth middleware's resolver to that athlete, asserts every `/api/v1/*` endpoint returns only the second athlete's rows (none of the seeded athlete's rows leak)
- [x] T087 [P] [US2] RLS policy integration test in `tests/integration/rls.policies.test.js`: uses Supabase Auth to create two test users, mints two JWTs, hits Postgres directly via `@supabase/supabase-js` (publishable-key client + per-test JWT) and asserts cross-tenant SELECT returns zero rows on every domain table

**Checkpoint**: US2 verified — both at the application layer (tenant scoping) and at the DB layer (RLS).

---

## Phase 5: User Story 3 — Multi-User Mode Activates Without Code Changes (Priority: P2)

**Goal**: Flipping `SINGLE_USER_MODE` from `true` to `false` and restarting changes auth behavior with zero source-code edits.

**Independent Test**: With `SINGLE_USER_MODE=true`, `GET /api/v1/athlete/me` returns 200 without an `Authorization` header. Stop the server, flip the flag in `.env` to `false`, restart, hit the same endpoint with no header → 401. With a valid Supabase JWT → 200. `git diff` between the two states → empty diff outside `.env`.

- [x] T088 [P] [US3] Auth-mode-switch integration test in `tests/integration/auth.modeSwitch.test.js`: boots the app twice (once per mode) via the config loader, asserts behavior diverges as specified above; asserts no source file under tracked paths is modified between runs
- [x] T089 [P] [US3] Request-id correlation test in `tests/integration/http.requestId.test.js`: in multi-user mode, an unauthenticated request still carries `X-Request-Id` on the response and in the structured log line (FR-018)

**Checkpoint**: US3 verified — the flag is the only switch.

---

## Phase 6: User Story 4 — One-Command Startup on a Fresh Machine (Priority: P3)

**Goal**: The bring-up sequence in `quickstart.md` works for a new operator on a clean machine.

**Independent Test**: In a fresh temp directory, clone the repo, follow `quickstart.md` step-by-step, reach `http://localhost:5173` showing the seeded name within 5 minutes. No undocumented manual file edits required.

- [x] T090 [US4] Verify root `package.json` scripts (`start`, `dev`, `seed`, `db:reset`, `test`) match exactly what `quickstart.md` instructs the operator to run
- [x] T091 [US4] Dry-run `quickstart.md` in a temp directory (`/tmp/masslab-bringup-test`); fix any drift between the doc and reality
- [x] T092 [US4] Author `README.md` at repo root with the bring-up summary and a link to `specs/001-phase0-foundation/quickstart.md`

**Checkpoint**: A teammate can bring up the project in one sitting from `quickstart.md` alone.

---

## Phase 7: Polish & Cross-Cutting

- [x] T093 [P] Add JSDoc-style typedefs for the program generator's input/output and for each DAO's row shape in `services/dataAccess/types.js`
- [x] T094 [P] Expand `CLAUDE.md` (per the constitution v1.1.1 follow-up TODO) with: folder layout, key-handling rules (publishable vs secret), RLS conventions, lint rules, and test-scaffolding conventions
- [x] T095 Run `quickstart.md` end-to-end and validate every Success Criterion (SC-001 → SC-010); record results in a brief `specs/001-phase0-foundation/validation.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies; can start immediately.
- **Foundational (Phase 2)**: depends on Setup. **Blocks all user stories.**
- **US1 (Phase 3)**: depends on Foundational. MVP target. Internal sub-order: TDD test (T027) → impl (T028); migrations (T029–T041) before seed (T048–T051); DAOs (T053–T060) before controllers (T061–T068) before routes (T069–T076) before route registration (T077); frontend scaffold (T078–T082) can proceed in parallel with backend tiers and only depends on the API existing for its smoke test.
- **US2 (Phase 4)**: depends on US1 (uses the DAOs and migrations).
- **US3 (Phase 5)**: depends on Foundational only (auth middleware lives there); independent of US1/US2 in principle, but its tests reuse seeded data so it's listed after US1.
- **US4 (Phase 6)**: depends on all prior phases (verifies the whole chain).
- **Polish (Phase 7)**: depends on all prior user stories shipping.

### Within Each User Story

- Strict tests-first ONLY for the program generator (T027 before T028). Other tests are written alongside or right after their target.
- Migrations before seed.
- DAOs before controllers before routes.
- Backend ready before the frontend smoke test runs.

### Parallel Opportunities

| Group                      | Tasks                                    | Why parallel                                                                                 |
| -------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Setup                      | T002, T003, T004, T005, T006, T008, T009 | Different files; no deps.                                                                    |
| Foundational middlewares   | T016, T017, T018                         | Different middleware files.                                                                  |
| Foundational photo storage | T022, T023, T024                         | Different files; T022 is a test on the contract.                                             |
| US1 migrations             | T029–T041                                | Each in its own SQL file; lexical order is enforced by timestamps, authoring is independent. |
| US1 seed JSON              | T042–T047                                | Different JSON files.                                                                        |
| US1 DAOs                   | T053–T060                                | Different files; no inter-DAO calls.                                                         |
| US1 controllers            | T061–T068                                | Different files; each depends on its corresponding DAO only.                                 |
| US1 routes                 | T069–T076                                | Different files; depend only on the corresponding controller.                                |
| US1 frontend               | T078, T079, T080, T083                   | Different files.                                                                             |
| US2 verification           | T086, T087                               | Different test files.                                                                        |
| US3 verification           | T088, T089                               | Different test files.                                                                        |
| Polish                     | T093, T094                               | Different files.                                                                             |

---

## Parallel Example: US1 migrations + seed JSON

```bash
# These can be authored simultaneously in a single dev session:
Task: "Author migration 20260428000002_init_exercises.sql"
Task: "Author migration 20260428000003_init_weekly_plan.sql"
Task: "Author migration 20260428000004_init_training_phases.sql"
Task: "Author seed/exercises.seed.json"
Task: "Author seed/foods.seed.json"
Task: "Author seed/supplements.seed.json"
```

`supabase migration up` later applies them in deterministic timestamp order; the JSON files are consumed by `seed/runSeed.js` and `supabase/seed.sql`.

---

## Implementation Strategy

### MVP First (US1 only)

1. Phase 1: Setup.
2. Phase 2: Foundational (CRITICAL — blocks every story).
3. Phase 3: US1 — first launch ready to use.
4. **STOP and validate**: open the browser, see the seeded athlete name, hit each endpoint, run `tests/contract/api.v1.test.js`.
5. Demoable.

### Incremental Delivery

1. Setup + Foundational → infrastructure ready (no demo yet).
2. - US1 → MVP demo: seeded program visible.
3. - US2 → tenant isolation verified (still only one athlete in the demo).
4. - US3 → mode switch verified (flip the flag, restart, observe 401).
5. - US4 → bring-up doc verified end-to-end.
6. - Polish → docs, types, validation report.

### Parallel Team Strategy

After Phase 2 completes, three contributors can split:

- A: US1 backend (migrations + seed + DAOs + controllers + routes).
- B: US1 frontend scaffold (T078–T083) and the program generator TDD pair (T027/T028).
- C: US2 + US3 verification tests as soon as A's DAOs and routes land.

---

## Notes

- `[P]` tasks touch different files and have no incomplete dependencies. If a file appears in two task IDs, those tasks are sequential.
- `[Story]` labels enable per-story traceability against `spec.md` user stories and `data-model.md` tables.
- Constitution v1.1.1 governs every task; in particular: no `@supabase/supabase-js` import outside `services/dataAccess/*`, no `password_hash` column anywhere, no legacy `anon`/`service_role` key references in code or `.env.example`.
- Commit cadence: one commit per logical group (e.g. all US1 migrations together is OK; bundle a DAO with its controller and route only when they're trivial wrappers).
- Stop at any checkpoint to demo or hand off — every checkpoint corresponds to a working slice.
