<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- specs/006-training-program-library/plan.md
<!-- SPECKIT END -->

## Folder Layout (Phase 0)

```
routes/                  /api/v1/* HTTP shells (no business logic)
controllers/             one per route file; orchestrate, never query the DB directly
services/                pure business logic (program generator, calculators)
services/dataAccess/     ONLY directory allowed to import @supabase/supabase-js
services/photoStorage/   put/get/delete/url adapter — filesystem default
middleware/              requestId → requestLogger → auth → errorHandler
config/                  zod schema · dotenv adapter · loadConfig()
supabase/migrations/     forward-only timestamped SQL; each ships its RLS
seed/                    athlete + JSON catalogues + idempotent runSeed.js
frontend/                React + Vite + Tailwind workspace member
tests/{unit,integration,contract,frontend}/
```

## Key Handling Rules

- `SUPABASE_SECRET_KEY` (`sb_secret_…`) **server-only**. Imported solely by `services/dataAccess/supabaseClient.js`.
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) is the only key that may cross to the frontend (used by future Supabase Auth flows).
- Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **forbidden**; the config schema rejects them at boot with a named error.
- Secret-tagged keys (`SECRET_KEYS` in `config/schema.js`) are added to the pino redactor, so the startup log line never prints raw secrets.

## RLS Conventions

- Every domain table ships RLS in the same migration. Pattern (`research.md` §5):

  ```sql
  alter table <t> enable row level security;
  create policy <t>_select_own on <t>
    for select using (athlete_id in (select id from athletes where auth_user_id = auth.uid()));
  create policy <t>_modify_own on <t>
    for all
    using (athlete_id in (select id from athletes where auth_user_id = auth.uid()))
    with check (athlete_id in (select id from athletes where auth_user_id = auth.uid()));
  ```

- The application uses the secret-key client which bypasses RLS by design — the auth middleware is the **primary** tenant guard. RLS is defense-in-depth and exercised by `tests/integration/rls.policies.test.js` using a per-test JWT against the publishable-key client.

## Lint Rules

- ESLint at repo root (backend); frontend extends Vite's defaults.
- Prettier (`.prettierrc`) is the single formatter — width 100, single quotes, trailing commas.
- A future custom lint rule should forbid `import '@supabase/supabase-js'` outside `services/dataAccess/` and `frontend/src/lib/`.

## Test Scaffolding

- `tests/unit/` — pure Node, no network. Includes the program-generator TDD spec.
- `tests/integration/` — boots `buildApp({ config, supabase })` against the local Supabase stack (skipped automatically when `.env` is missing or Supabase is unreachable).
- `tests/contract/` — drives every path in `specs/001-phase0-foundation/contracts/openapi.yaml` via Supertest.
- `tests/frontend/` — jsdom + React Testing Library, runs through `frontend/vitest.config.js` so Vite plugins resolve correctly.

## Constitution

`./.specify/memory/constitution.md` v1.1.1. Non-negotiables: tenant-ready data model, layered architecture (no Supabase imports outside the data-access layer), config over hardcoding, versioned API (`/api/v1/`), test-first for domain logic, athlete-first UX.

## Phase 1 — Calculators Engine (added 2026-05-08)

- **Engine boundary**: every pure calculator lives under `services/engine/`. No `@supabase/supabase-js` imports in this directory or in `services/programGenerator.js` / `services/progressionEngine.js`.
- **Engine version pinning**: `services/engine/constants.js` exports `ENGINE_VERSION` (semver) and a frozen `DEFAULTS` map. Every persisted calculation row snapshots `engine_version` + `resolved_constants` so replays survive default changes. Bump rules: PATCH = rounding fix, MINOR = new calculator/optional input, MAJOR = behavioural change to an existing calculator.
- **Per-athlete overrides**: stored on `app_config.engine_overrides` (JSONB, defaults `{}`). The engine reads via `resolveConstants(override)` — defaults ⊕ override, deep-frozen.
- **Audit log**: `services/engine/auditWriter.js` is the single helper that appends a row to `calculation_results`. Called from every persisted-write path (program regenerate, 1RM record, body composition + measurement save, progression eval). NOT called from `/api/v1/calculators/*` ad-hoc endpoints (FR-029).
- **Soft-archive shapes**: `generated_programs` and `progression_flags` use `is_active` + `superseded_at`. Partial-unique indexes enforce "at most one active per scope" at the DB level.
- **Frontend routing**: `react-router-dom@^6` is wired in `frontend/src/App.jsx`. `/`, `/nutrition`, `/calculators`, and `/calculators/<slug>` are the Phase 1 routes. Phase 4's journal screen extends this.
- **Body measurement extension**: Phase 0's `body_measurements` table didn't include `neck_cm` / `hip_cm`. Phase 1 added migration `20260507000008_extend_body_measurements_neck_hip.sql` to support the U.S. Navy multi-measurement body-fat formula.

## Phase 3 — Training Program & Exercise Library (added 2026-06-02)

- **Read presenter boundary**: composed view models live under `services/trainingProgram/` (`weekView.js`, `dayView.js`, `exerciseView.js`, `mediaClassifier.js`) — pure, no `@supabase/supabase-js`. Controllers read DAOs and hand plain data to these presenters.
- **Read-only session history**: `services/dataAccess/sessions.dao.js` is the first reader of `session_journal_entries` + `session_sets` (Phase 4 owns the write path). Phase 3 never writes sessions (FR-026).
- **History-derived numbers** (test-first, `services/engine/`): `exerciseHistory.js` (`heaviestCompletedSet`, `feedSet`, `lastWeightUsed`, `recentSessions`), `loadRecommendation.js`. "Last weight" = heaviest **completed** set of the most recent session; the same feed set drives the 1RM estimate (`oneRepMax().primary_estimate_kg`) so the day row and detail page agree (SC-003). Load rec reuses the `add_load` flag's snapshotted `delta_kg`.
- **Progression indicator**: read from active `progression_flags` (`scope_ref = String(exercise_id)`); `add_load`→ready_to_increase, `regression`→regressing, else stable.
- **`/program/*` endpoints** are mounted as a SECOND router at `/api/v1/program` (after the program-generator router); paths are disjoint so unmatched requests fall through. `GET /program/week|day/:dayOfWeek|exercises/:id`.
- **Alternatives**: one new table `exercise_alternatives` (migration `20260602000001`), one-directional, `CHECK` no-self + unique no-dup, FK `ON DELETE CASCADE`, RLS in-file. DAO maps `23505`→409 CONFLICT.
- **Exercise media**: reuses `exercises.media_image_url` / `media_video_url`. Uploads go through the `photoStorage` adapter (root `PHOTO_STORAGE_ROOT`), served unauthenticated at `/static/*` so `<img>`/`<video>` can load them. YouTube videos are stored as URLs and normalized to `YOUTUBE_EMBED_HOST` by `mediaClassifier.normalizeYoutubeUrl` (shared by read + write paths). Size/type bounded by `EXERCISE_MEDIA_MAX_BYTES` / `EXERCISE_MEDIA_IMAGE_TYPES` / `EXERCISE_MEDIA_VIDEO_TYPES`.
- **Frontend**: `/program`, `/program/day/:dayOfWeek`, `/program/exercises/:id` in `App.jsx`. Live Supabase-backed contract/integration tests for the alternatives surface **probe for the `exercise_alternatives` table and skip until the migration is applied**.
