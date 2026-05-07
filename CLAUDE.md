<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- specs/001-phase0-foundation/plan.md
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
