# Phase 0 — Validation Report

**Date**: 2026-05-07
**Branch**: `001-phase0-foundation`
**Constitution**: v1.1.1
**Stack verified**: Node 22.17 (engines `>=20`), Supabase CLI v2.99.0-beta.2, Docker 28.3.0, Vite 5.4, React 18.3.

This report walks every Success Criterion (SC-001 → SC-010) and the FR-level gates that the bring-up exercises.

## Bring-up sequence executed

```bash
brew install supabase/tap/supabase-beta
npm install
supabase start
cp .env.example .env  # filled with the keys printed by `supabase start`
supabase db reset     # applies all 14 migrations
npm run seed          # idempotent — confirmed by re-running
npm start             # API :3000 + Vite :5173 in parallel
```

## Success Criteria

| ID     | Criterion (paraphrased)                                                         | Result | Evidence                                                                                                                                                                                                          |
| ------ | ------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC-001 | Clone → running app in ≤ 5 minutes                                              | PASS   | Bring-up sequence above completes well under 5 minutes once Supabase + Docker are pre-installed. The Supabase stack is the longest step (~30 s on warm Docker).                                                   |
| SC-002 | Every domain row carries `athlete_id`                                           | PASS   | All 13 domain migrations (T029–T041) declare `athlete_id uuid not null references public.athletes(id) on delete cascade`. `data-model.md` §1–§14 enumerates every column; the migrations match.                   |
| SC-003 | Two athletes are isolated in API responses                                      | PASS   | `tests/integration/tenant.scoping.test.js` inserts a second athlete and asserts every `/api/v1/*` endpoint returns only its own rows.                                                                             |
| SC-004 | RLS denies cross-tenant SELECT at the DB layer                                  | PASS   | `tests/integration/rls.policies.test.js` hits each domain table through a publishable-key client (anonymous) and asserts zero rows / policy denial.                                                               |
| SC-005 | Seed is idempotent (no duplicates on re-run)                                    | PASS   | `tests/integration/seed.idempotent.test.js`: row counts for `exercises`, `foods`, `supplements`, `training_phases`, `quotes`, `weekly_plan_*`, `nutrition_template_meals` are equal across two `runSeed()` calls. |
| SC-006 | Mode switch changes auth without source edits                                   | PASS   | `tests/integration/auth.modeSwitch.test.js`: builds two apps (single-user vs multi-user), asserts 200 vs 401 with no source diff. Same `buildApp` factory and same DAOs are reused.                               |
| SC-007 | No athlete identity hard-coded in source                                        | PASS   | `grep -RIn "Ahmed\|173\|58 kg" --include="*.js" services/ controllers/ routes/ middleware/ config/` returns zero hits. Profile lives in `seed/athlete.seed.js` (operator-editable seed).                          |
| SC-008 | Missing required env key fails fast with a named error                          | PASS   | `tests/unit/config.schema.test.js` asserts each missing key throws `ConfigError` with `err.missingKey === <key>`. Same path is exercised by `loadConfig()` at boot.                                               |
| SC-009 | Every endpoint lives under `/api/v1/`                                           | PASS   | `tests/contract/api.v1.test.js` enumerates `openapi.yaml` paths and asserts each one is reachable under `/api/v1/`. `app.js` mounts the v1 router only.                                                           |
| SC-010 | Every response carries `X-Request-Id`; redacted secrets in startup log (FR-014) | PASS   | `tests/integration/http.requestId.test.js` covers client-supplied + server-generated + 401 paths. The captured startup log shows `"SUPABASE_SECRET_KEY":"[REDACTED]"`.                                            |

## Captured live evidence

- **Startup log (`server.js`)**: `{"config":{"SINGLE_USER_MODE":true,"PORT":3000,"SUPABASE_URL":"http://127.0.0.1:54321","SUPABASE_SECRET_KEY":"[REDACTED]","SUPABASE_PUBLISHABLE_KEY":"sb_publishable_…","CORS_ORIGIN":"http://localhost:5173"},"single_user_mode":true,"seeded":false}` — secret key is censored, publishable key is visible (FR-014).
- **Per-request log**: `{"method":"GET","path":"/api/v1/athlete/me","status":200,"duration_ms":6.77,"request_id":"e9ba0056-…","athlete_id":"5d0ee5cb-…"}` (FR-019).
- **Vite → Express proxy**: `curl http://localhost:5173/api/v1/athlete/me` returns the seeded athlete payload (FR-006 / quickstart §5).
- **Idempotent seed**: re-running `npm run seed` logs `seed_athlete_upserted` and `seed_complete`; row counts unchanged.

## Test summary

```
tests/unit/config.schema.test.js           12 ✓
tests/unit/photoStorage.local.test.js       3 ✓
tests/unit/programGenerator.test.js         7 ✓ (TDD spec — written before impl)
tests/integration/seed.idempotent.test.js   1 ✓
tests/integration/tenant.scoping.test.js    7 ✓
tests/integration/rls.policies.test.js      8 ✓
tests/integration/auth.modeSwitch.test.js   2 ✓
tests/integration/http.requestId.test.js    3 ✓
tests/contract/api.v1.test.js              10 ✓
tests/frontend/scaffold.test.jsx            1 ✓ (jsdom)
─────────────────────────────────────────────
                                       Total 54 ✓
```

## Constitution check (post-implementation)

- **I. Multi-tenant-ready** — every migration ships RLS in the same file; `auth.js` resolves `req.athleteId` once per request; the data-access layer filters by it.
- **II. Layered architecture** — `grep -RIn "@supabase/supabase-js" controllers/ routes/ middleware/ services/programGenerator.js services/photoStorage/` returns zero hits. Only `services/dataAccess/supabaseClient.js` and the DAOs import it.
- **III. Configuration over hardcoding** — `.env.example` lists exactly the six required keys; `config/schema.js` rejects the legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` keys with `ConfigError.forbiddenKey` set.
- **IV. Versioned API** — every route is mounted under `/api/v1/`. `openapi.yaml` is the single source of truth; the contract suite enforces parity.
- **V. Test-first for domain logic** — `programGenerator.test.js` was authored before `programGenerator.js` (Principle V). All seven cases pass; the function is pure (no `process.env`, no `Date.now()`).
- **VI. Athlete-first UX** — Phase 0 ships scaffold-only; tokens and Tailwind utilities are wired so Phase 2+ inherits the baseline.

## Known follow-ups (out of scope for Phase 0)

- The static `supabase/seed.sql` file is intentionally empty: every catalogue carries `athlete_id`, so the seed must run after the athlete row exists. The Node-side `seed/runSeed.js` owns the full seed pipeline.
- The Supabase CLI emits `Warning: A new version of Supabase CLI is available`. Upgrade is non-blocking.
- Tenant scoping test (`tests/integration/tenant.scoping.test.js`) inserts a second athlete via the secret-key client (RLS-bypassing). The cross-tenant SELECT denial is verified separately by `rls.policies.test.js` against the publishable-key client.
