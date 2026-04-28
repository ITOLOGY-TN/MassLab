# MassLab Phase 0 — Quickstart

**Audience**: An operator (the project's developer self) bringing the application online on a clean machine.
**Time to running app**: ≤5 minutes (per SC-001).

## Prerequisites

- Node.js 20.x LTS or newer (`node --version` should print `v20.x.x` or `v22.x.x`).
- npm 10+ (ships with Node 20).
- Git.

## Steps

```bash
# 1. Clone
git clone <repo-url> masslab
cd masslab

# 2. Install dependencies
npm install

# 3. Set up configuration
cp .env.example .env
# Defaults in .env.example are safe for local use; edit only if you need a different
# port or DB path.

# 4. Start the app
npm start
```

That's it. On first launch the application will:

1. Load and validate `.env` via the configuration adapter (zod schema). Missing or invalid values fail fast with a clear error.
2. Open `./data/masslab.db` (creating it if absent).
3. Apply any pending migrations from `./migrations/*.sql` in lexical order, each in its own transaction.
4. Run the seed (idempotent — safe on every re-launch).
5. Bind the configured port (default `3000`) and serve `/api/v1/*`.

Open <http://localhost:3000/api/v1/athlete> — you should see the seeded athlete profile.

## What the seeded environment includes

- 1 athlete (per PLAN.md: 29 yrs, 173 cm, 58 kg, ectomorph, intermediate, 5 sessions/week, +6 to +8 kg goal over 5 months)
- 18+ exercises with instructions (`fr-FR`)
- 5-day weekly plan (Mon / Tue / Wed / Fri / Sat) with muscle-group assignments
- 3 training phases with parameters
- 5-meal daily nutrition template with macro targets
- 5 supplements with dosage and timing
- 50 common foods with macros (`fr-FR`)
- 30 motivational quotes (`fr-FR`)

## Switching between single-user and multi-user mode

In `.env`:

```ini
SINGLE_USER_MODE=true   # default; auto-resolves every request to the seeded athlete
SINGLE_USER_MODE=false  # auth middleware enforces credentials; no login UI in Phase 0
```

Restart the application after changing the value. Source-code changes are *not* required (per FR-005 and SC-003).

## Configuration keys

See `.env.example` for the complete list and defaults. Every key is validated at startup; any missing required key produces an error like:

```
[masslab] FATAL: configuration value "DB_PATH" is required but missing.
         Set it in .env or as an environment variable.
```

## Troubleshooting

- **Port already in use**: change `PORT` in `.env` and restart.
- **Permission denied on `./data/`**: the application creates this directory on first run; ensure the working directory is writable.
- **Re-seed during development**: the seeder is idempotent. To wipe and re-seed, delete `./data/masslab.db` and start the app again.

## Verifying Phase 0 acceptance

```bash
npm test
```

Expected coverage:

- `tests/unit/programGenerator.test.js` — pure-function tests for the program generator (Constitution Principle V).
- `tests/integration/seed.idempotent.test.js` — verifies SC-005 (re-launch does not duplicate seed rows).
- `tests/integration/tenant.scoping.test.js` — verifies US2 (a hypothetical second athlete cannot see the first's records).
- `tests/integration/auth.modeSwitch.test.js` — verifies US3 (mode flip is config-only).
- `tests/integration/http.requestId.test.js` — verifies SC-010 (every request log line carries `request_id`, including unauthenticated ones).
- `tests/contract/api.v1.test.js` — exercises every endpoint listed in `specs/001-phase0-foundation/contracts/openapi.yaml`.
