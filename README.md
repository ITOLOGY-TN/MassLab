# MassLab

A single-athlete training, nutrition, and recovery companion built on Node.js + Express + Supabase + React/Vite/Tailwind.

Phase 0 ships the foundation: schema, seed, middleware seams, versioned API, and a frontend scaffold that fetches the seeded athlete. Subsequent phases add the journal, calculators, and athlete-facing screens.

## Quick start (cloud Supabase — default)

Prerequisites: Node.js 20.x LTS, the Supabase CLI (`brew install supabase/tap/supabase-beta` on macOS), and a Supabase project.

```bash
git clone <repo-url> masslab && cd masslab
npm install
supabase login                                        # one-time, opens browser
supabase link --project-ref <your-project-ref>        # one-time per checkout
supabase db push                                      # applies the 14 migrations
cp .env.example .env                                  # fill SUPABASE_URL + sb_publishable_/sb_secret_ keys
npm run seed                                          # creates the athlete + program (idempotent)
npm start                                             # Express on :3000 + Vite on :5173
```

Open `http://localhost:5173` — the scaffold page renders the seeded athlete's name from `GET /api/v1/athlete/me`.

**Offline / sandbox path** (Docker required): use `supabase start` instead of `link`/`push` and run `supabase db reset` to apply migrations. Both paths share the same code; only `.env` and the migration command differ. See [`specs/001-phase0-foundation/quickstart.md`](specs/001-phase0-foundation/quickstart.md) for both walkthroughs and common stumbles.

## Layout

```
routes/                # /api/v1/* — thin HTTP shells
controllers/           # request orchestration
services/              # pure business logic
services/dataAccess/   # ONLY layer that imports @supabase/supabase-js
middleware/            # requestId · auth · requestLogger · errorHandler
config/                # adapter-backed env loader (no hardcoded values)
supabase/migrations/   # forward-only SQL migrations + RLS policies
seed/                  # athlete profile, JSON catalogues, runSeed.js
frontend/              # React + Vite + Tailwind scaffold (workspace member)
tests/                 # unit · integration · contract · frontend
```

## Constitution

`./.specify/memory/constitution.md` v1.1.1 governs the project. Highlights:

- Every domain table carries `athlete_id` and ships RLS in the same migration.
- Supabase client calls are confined to `services/dataAccess/*`.
- Configuration is loaded through an adapter; secrets are tagged and redacted.
- All endpoints live under `/api/v1/`.
- Domain logic is test-first.

## Scripts

| Script                  | Purpose                                             |
| ----------------------- | --------------------------------------------------- |
| `npm start`             | API + Vite dev server in parallel.                  |
| `npm run seed`          | Idempotent athlete + program seed.                  |
| `npm run db:reset`      | `supabase db reset` then re-seed. **Destructive.**  |
| `npm test`              | All unit / integration / contract tests via Vitest. |
| `npm run test:contract` | Just the OpenAPI contract suite.                    |
| `npm run lint`          | ESLint over the backend (frontend has its own).     |
| `npm run format`        | Prettier across the workspace.                      |
