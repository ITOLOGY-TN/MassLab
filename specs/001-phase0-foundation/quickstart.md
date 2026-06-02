# MassLab Phase 0 — Quickstart

**Audience**: An operator (the project's developer self) bringing the application online on a clean machine.
**Time to running app**: ≤5 minutes (per SC-001).
**Stack**: Node.js 20.x · Supabase (cloud project; local CLI stack as offline fallback) · React + Vite + Tailwind CSS · Constitution v1.1.1.

## Two bring-up paths

| Path                     | When to pick it                                                                    | Trade-off                                              |
| ------------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **A. Cloud** _(default)_ | Solo operator with a Supabase account; data should persist beyond a single laptop. | ~150 ms request latency vs ~5 ms local; needs network. |
| **B. Local CLI stack**   | Offline work; sandboxing destructive migrations away from real data.               | Requires Docker; data lives in a Docker volume.        |

The application code is identical for both — only `.env` and the migration command differ.

---

## Path A — Cloud Supabase (default)

### Prerequisites

| Tool               | Why                                      | How                                                                                          |
| ------------------ | ---------------------------------------- | -------------------------------------------------------------------------------------------- |
| Node.js 20.x LTS   | runs the API and Vite                    | https://nodejs.org/                                                                          |
| Supabase CLI       | links the project and applies migrations | `brew install supabase/tap/supabase-beta` (macOS) / see https://supabase.com/docs/guides/cli |
| A Supabase project | hosts the database + auth                | https://supabase.com/dashboard → New Project                                                 |

Verify:

```bash
node -v          # v20.x.x or newer
supabase --version
```

### Bring-up sequence

```bash
# 1. Clone and install workspace dependencies (root + frontend)
git clone <repo-url> masslab && cd masslab
npm install

# 2. Authenticate the Supabase CLI (opens a browser)
supabase login

# 3. Link the cloud project (run once per checkout)
supabase link --project-ref <your-project-ref>

# 4. Apply all 14 migrations to the cloud database
supabase db push

# 5. Configure environment
cp .env.example .env
# Edit .env and fill in (Project Settings → API in the dashboard):
#   SUPABASE_URL=https://<project-ref>.supabase.co
#   SUPABASE_PUBLISHABLE_KEY=sb_publishable_…
#   SUPABASE_SECRET_KEY=sb_secret_…
# Leave SINGLE_USER_MODE=true, PORT=3000, CORS_ORIGIN=http://localhost:5173.
# Note: legacy `anon`/`service_role` keys are rejected at boot (Constitution v1.1.1).

# 6. Seed the athlete + program (idempotent)
npm run seed

# 7. Start the API and the frontend together
npm start                # Express on :3000, Vite on :5173
```

Open http://localhost:5173. The scaffold page renders the seeded athlete's `display_name` fetched from `GET /api/v1/athlete/me`.

---

## Path B — Local CLI stack (offline fallback)

### Additional prerequisites

| Tool                                  | Why                               | How                     |
| ------------------------------------- | --------------------------------- | ----------------------- |
| Docker Desktop (or Colima / OrbStack) | hosts the local Supabase services | https://www.docker.com/ |

### Bring-up sequence

```bash
git clone <repo-url> masslab && cd masslab
npm install

supabase start
# The CLI prints the API URL, the publishable key (sb_publishable_…),
# and the secret key (sb_secret_…). Copy them into the next step.

cp .env.example .env
# Fill SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_SECRET_KEY
# from `supabase status`.

supabase db reset       # applies migrations + runs supabase/seed.sql
npm run seed            # athlete-scoped seed (calls the program generator)
npm start
```

`supabase stop` to shut down. Local data is preserved in a Docker volume (`docker volume ls --filter label=com.supabase.cli.project=MassLab`).

---

## What `npm start` runs

```text
concurrently
  ├─ "node server.js"                     → Express on PORT (default 3000), serving /api/v1/*
  └─ "npm --prefix frontend run dev"      → Vite on 5173 with /api/v1 proxied to Express
```

## Useful scripts

| Script                  | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `npm start`             | Boot API + Vite together (default workflow).                                           |
| `npm run dev`           | Alias of `npm start`.                                                                  |
| `npm run seed`          | Re-run the athlete-scoped seed (idempotent; safe on a populated DB).                   |
| `npm run db:reset`      | **Local stack only.** `supabase db reset` then re-run `npm run seed`. **Destructive.** |
| `supabase db push`      | **Cloud only.** Apply pending migrations to the linked cloud project.                  |
| `npm test`              | Run all Vitest suites (unit, integration, contract).                                   |
| `npm run test:contract` | Just the OpenAPI contract suite (`tests/contract/api.v1.test.js`).                     |

## Verifying the principles

After bring-up, you can spot-check each non-negotiable principle:

- **Principle I (multi-tenant ready)** — open Supabase Studio (cloud dashboard or `supabase status` URL for local), pick any domain table, confirm `athlete_id` is non-null on every row. `\d+ <table>` should show RLS enabled and two policies attached.
- **Principle III (config over hardcoding)** — `grep -RIn "sb_publishable_\|sb_secret_\|@supabase" frontend/src` should return zero hits to the secret key. Searching the whole repo for athlete identity (`grep -RIn "Ahmed\|173\|58 kg" --include="*.js"`) should return zero hits in source — only seed JSON.
- **Mode switch** — flip `SINGLE_USER_MODE=false` in `.env`, restart, hit `GET /api/v1/athlete/me` without an `Authorization` header → expect `401`. Restore `SINGLE_USER_MODE=true`, restart → request succeeds.
- **Request id** — every response carries `X-Request-Id`. The same id appears in the structured log line for that request.

## Switching between cloud and local

The two paths share the same code and migration files. To switch:

- **Cloud → local**: `supabase start`, swap `.env` to the local URL/keys printed by `supabase status`, run `supabase db reset`, then `npm run seed`.
- **Local → cloud**: `supabase stop`, swap `.env` to the cloud URL/keys, run `supabase link --project-ref <ref>` then `supabase db push`, then `npm run seed`.

Real data does **not** auto-sync between the two. In Phase 0 only seed exists, so the switch is free; once the journal screen ships (Phase 4) you'd `pg_dump` from the source and `psql` into the target.

## Common stumbles

- **`supabase db push` says "Access token not provided"**: run `supabase login` once, or export `SUPABASE_ACCESS_TOKEN` from a personal access token at https://supabase.com/dashboard/account/tokens.
- **`npm run seed` complains about missing keys**: you forgot to fill `SUPABASE_SECRET_KEY` in `.env`. The config schema fails fast (FR-010, SC-008) and names the missing key.
- **"legacy key not allowed" on startup**: you pasted an `anon` or `service_role` key into `.env`. Those are deprecated; use the `sb_publishable_…` and `sb_secret_…` keys printed by `supabase start` (local) or visible in Project Settings → API (cloud).
- **Frontend renders blank**: open the browser console; if you see CORS errors, confirm `CORS_ORIGIN=http://localhost:5173` is set in `.env` and that you opened `:5173` (not `:3000`).
- **`supabase start` fails with "port 54322 in use"**: another local Postgres is listening. Either stop it or remap ports in `supabase/config.toml`.
