# MassLab Phase 0 — Quickstart

**Audience**: An operator (the project's developer self) bringing the application online on a clean machine.
**Time to running app**: ≤5 minutes (per SC-001).
**Stack**: Node.js 20.x · Supabase (local CLI stack) · React + Vite + Tailwind CSS · Constitution v1.1.1.

## Prerequisites

Install once on a clean machine:

| Tool | Why | How |
|---|---|---|
| Node.js 20.x LTS | runs the API and Vite | https://nodejs.org/ |
| Docker Desktop (or Colima/OrbStack) | hosts the local Supabase services | https://www.docker.com/ |
| Supabase CLI | runs the local Supabase stack and applies migrations | `brew install supabase/tap/supabase` (macOS) / see https://supabase.com/docs/guides/cli |

Verify:

```bash
node -v        # v20.x.x
docker --version
supabase --version
```

## Bring-up sequence

```bash
# 1. Clone and install workspace dependencies (root + frontend)
git clone <repo-url> masslab && cd masslab
npm install

# 2. Boot the local Supabase stack (Postgres + Auth + Storage + Studio)
supabase start
# The CLI prints the API URL, the publishable key (sb_publishable_…),
# and the secret key (sb_secret_…). Copy them into the next step.

# 3. Configure environment
cp .env.example .env
# Edit .env and fill in:
#   SUPABASE_URL=<API URL from step 2>
#   SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
#   SUPABASE_SECRET_KEY=sb_secret_…
# Leave SINGLE_USER_MODE=true, PORT=3000, CORS_ORIGIN=http://localhost:5173.

# 4. Apply migrations and load reference seed
supabase migration up   # applies supabase/migrations/*.sql
                        # Supabase also runs supabase/seed.sql automatically
                        # on `supabase db reset`; for the first run, run:
npm run seed            # athlete-scoped seed (calls program generator)

# 5. Start the API and the frontend together
npm start               # boots Express on :3000 and Vite on :5173 concurrently
```

Open http://localhost:5173. The scaffold page should display the seeded athlete's `display_name` fetched from `GET /api/v1/athlete/me`.

## What `npm start` runs

```text
concurrently
  ├─ "node server.js"         → Express on PORT (default 3000), serving /api/v1/*
  └─ "npm --prefix frontend run dev"   → Vite on 5173 with /api/v1 proxied to Express
```

## Useful scripts

| Script | What it does |
|---|---|
| `npm start` | Boot API + Vite together (default workflow). |
| `npm run dev` | Alias of `npm start`. |
| `npm run seed` | Re-run the athlete-scoped seed (idempotent; safe on a populated DB). |
| `npm run db:reset` | `supabase db reset` then re-run `npm run seed`. **Destructive** — wipes the local Supabase DB. |
| `npm test` | Run all Vitest suites (unit, integration, contract, frontend smoke). |
| `npm run test:contract` | Just the OpenAPI contract suite (`tests/contract/api.v1.test.js`). |

## Verifying the principles

After bring-up, you can spot-check each non-negotiable principle:

- **Principle I (multi-tenant ready)** — open Supabase Studio (`supabase status` prints the URL), pick any domain table, confirm `athlete_id` is non-null on every row. `\d+ <table>` should show RLS enabled and two policies attached.
- **Principle III (config over hardcoding)** — `grep -RIn "sb_publishable_\|sb_secret_\|@supabase" frontend/src` should return zero hits to the secret key. Searching the whole repo for athlete identity (`grep -RIn "Ahmed\|173\|58 kg" --include="*.js"`) should return zero hits in source — only seed JSON.
- **Mode switch** — flip `SINGLE_USER_MODE=false` in `.env`, restart, hit `GET /api/v1/athlete/me` without an `Authorization` header → expect `401`. Restore `SINGLE_USER_MODE=true`, restart → request succeeds.
- **Request id** — every response carries `X-Request-Id`. The same id appears in the structured log line for that request.

## Common stumbles

- **`supabase start` fails with "port 54322 in use"**: another local Postgres is listening. Either stop it or run `supabase start --workdir .` after editing `supabase/config.toml` to remap ports.
- **`npm run seed` complains about missing keys**: you forgot to fill `SUPABASE_SECRET_KEY` in `.env`. The config schema fails fast (FR-010, SC-008) and names the missing key.
- **Frontend renders blank**: open the browser console; if you see CORS errors, confirm `CORS_ORIGIN=http://localhost:5173` is set in `.env` and that you opened `:5173` (not `:3000`).
- **"legacy key not allowed" on startup**: you pasted an `anon` or `service_role` key into `.env`. Those are deprecated; use the `sb_publishable_…` and `sb_secret_…` keys printed by `supabase start`.
