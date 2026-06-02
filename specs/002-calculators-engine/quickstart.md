# MassLab Phase 1 — Quickstart

**Audience**: An operator (the project's developer self) bringing Phase 1 online on top of an already-running Phase 0.
**Time to running engine**: ≤ 3 minutes from `git pull` to a green test run.
**Stack**: Node.js 20+, Supabase (cloud project; local CLI stack as offline fallback per Phase 0 quickstart Path B), React + Vite + Tailwind CSS, Constitution v1.1.1.

This guide assumes Phase 0 is already running (cloud or local) — the API serves `GET /api/v1/athlete/me` and the seed has populated the athlete + 14 catalogue tables.

## Bring-up sequence

```bash
# 1. Pull and install (no new runtime deps; one new frontend dep — react-router-dom)
git pull origin 002-calculators-engine
npm install

# 2. Apply the 7 Phase 1 migrations to the linked Supabase database
#    Cloud (default):
supabase db push
#    Or local stack:
supabase db reset

# 3. Re-run the seed so the seeded athlete picks up the new `activity_level`
#    column default and so an initial active program row is written.
npm run seed

# 4. Boot the API + Vite frontend
npm start
```

Open `http://localhost:5173`:

- `/` — the existing scaffold home (now links to the two new pages).
- `/calculators` — the Calculators page; pick a calculator, fill the form, see the result.
- `/nutrition` — the read-only Nutrition view; shows the active program's daily targets.

## Verifying the engine

```bash
# A. Run only the unit tests (engine purity)
npx vitest run tests/unit

# B. Run the integration suite (program regenerate, flag lifecycle, audit log)
npx vitest run tests/integration

# C. Run the contract suite (every path in contracts/openapi.yaml against the live app)
npm run test:contract

# D. End-to-end smoke against the running API
curl -s http://localhost:3000/api/v1/program | jq '.data.payload.nutrition'
curl -s http://localhost:3000/api/v1/nutrition/targets | jq
curl -s -X POST http://localhost:3000/api/v1/calculators/bmr \
  -H 'content-type: application/json' \
  -d '{"weight_kg":58,"height_cm":173,"age":29,"biological_sex":"male"}' | jq
curl -s -X POST http://localhost:3000/api/v1/program/regenerate | jq '.data.is_active'
```

After step D's last call, `GET /api/v1/program/history` returns at least two rows: the previously-active program (now `is_active = false, superseded_at = <now>`) and the freshly-active one.

## What changed since Phase 0

| Area           | Phase 0              | Phase 1                                                                                                                                           |
| -------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations     | 14                   | +7 (`20260507000001`–`20260507000007`)                                                                                                            |
| Domain tables  | 14                   | +5 typed (`generated_programs`, `progression_flags`, `one_rep_max_records`, `body_composition_results`, plus the `calculation_results` audit log) |
| Profile fields | weekly_session_count | + `activity_level` (default `moderately_active`)                                                                                                  |
| `app_config`   | base config          | + `engine_overrides` JSONB (defaults to `{}`)                                                                                                     |
| Endpoints      | 9 read endpoints     | + 14 (program / nutrition targets / calculators / 1RM records / progression flags / body composition)                                             |
| Frontend pages | 1 (scaffold)         | + 2 (`/calculators`, `/nutrition`) plus 5 calculator sub-pages                                                                                    |

## Useful scripts (Phase 1)

| Script                  | What it does                                                              |
| ----------------------- | ------------------------------------------------------------------------- |
| `npm start`             | Boot API + Vite together.                                                 |
| `npm run seed`          | Re-run the seed including the initial active program write. Idempotent.   |
| `npm test`              | Full Vitest suite (unit + integration + contract).                        |
| `npm run test:contract` | Just the OpenAPI contract suite.                                          |
| `supabase db push`      | **Cloud.** Apply pending migrations.                                      |
| `supabase db reset`     | **Local stack only.** Re-apply all migrations from scratch (destructive). |

## Verifying the principles

- **Principle I (multi-tenant ready)** — Open Supabase Studio (cloud dashboard or `supabase status` URL for local). The five new tables are present with `athlete_id` non-null on every row and two RLS policies attached. `generated_programs` and `progression_flags` show their partial-unique indexes (`is_active` constraint).
- **Principle II (layered architecture)** — `grep -RIn "@supabase/supabase-js" services/engine/ services/programGenerator.js services/progressionEngine.js controllers/ routes/ middleware/` returns zero hits. Only `services/dataAccess/*` imports the client.
- **Principle III (configuration over hardcoding)** — `cat services/engine/constants.js` lists every default; `app_config.engine_overrides` is empty for the seeded athlete; the engine resolver merges them at every call.
- **Principle IV (versioned API contract)** — `grep -RIn 'router' app.js routes/ | grep -v 'api/v1'` should be empty; every Phase 1 path is mounted under `/api/v1/`.
- **Principle V (test-first for domain logic)** — every calculator in `services/engine/` has a corresponding `tests/unit/engine.<name>.test.js` whose first commit predates the implementation file; the rule engine has the same pairing.
- **Principle VI (athlete-first UX)** — the Calculators forms use the shared design tokens from `frontend/src/styles/tokens.css`; no ad-hoc CSS files.

## Common stumbles

- **`supabase db push` says "no migrations to apply"**: the migration files exist but aren't named lexically after Phase 0. Confirm filenames start with `20260507…`.
- **`/api/v1/program` returns 404**: no active program row exists yet. Run `npm run seed` (writes one) or `POST /api/v1/program/regenerate`.
- **Engine constants don't pick up an override**: the override JSONB lives at `app_config.engine_overrides`, not at the row root. The engine reads `appConfig.engine_overrides ?? {}` and merges into the defaults.
- **Test failures on `services/engine/*` after a default change**: that's the system working — `engine_version` should be bumped in the same commit as the constant change. The unit tests will re-pass with the new expected values.
- **Frontend route shows blank**: the `react-router-dom` import in `App.jsx` is missing or the `BrowserRouter` is not the outermost wrapper in `main.jsx`.
