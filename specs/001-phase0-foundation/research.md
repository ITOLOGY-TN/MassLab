# Phase 0 Research — Foundation and Architecture (Supabase stack)

**Feature**: 001-phase0-foundation
**Date**: 2026-04-28
**Constitution**: v1.1.1

This document captures the stack decisions taken for `001-phase0-foundation` after PLAN.md was rewritten and the constitution amended to v1.1.1. Every NEEDS CLARIFICATION from the Technical Context is resolved below.

## 1. Local Supabase development model

**Decision**: Use the **Supabase CLI** to run a local Supabase stack on the operator's machine (`supabase start`), which boots Postgres + GoTrue (auth) + Storage + Realtime + Studio in containers. The application reads `SUPABASE_URL` and the local keys printed by the CLI on first boot.

**Rationale**:
- Keeps Phase 0 fully offline. No third-party project, no cloud account, no quota surprises during local dev.
- Mirrors the production topology: same Postgres extensions, same Auth surface, same RLS semantics. Code that passes against the local stack passes against a hosted Supabase project.
- Migrations apply identically against local and remote (`supabase migration up` vs `supabase db push`).

**Alternatives considered**:
- Hosted dev Supabase project. Rejected for Phase 0 because it forces every contributor to have a Supabase account and creates a shared-state foot-gun (one operator's destructive migration breaks everyone else).
- Plain local Postgres without Supabase services. Rejected because we lose Supabase Auth (`auth.users`, `auth.uid()`) which the RLS policies depend on, and we'd have to mock the auth surface for tests.

## 2. Migration tooling

**Decision**: Use Supabase CLI migrations exclusively. Files live in `supabase/migrations/<timestamp>_<name>.sql` and are applied with `supabase migration up` (local) or `supabase db push` (remote). No ad-hoc SQL through Studio without a matching committed migration. Migrations are forward-only.

**Rationale**:
- Constitution v1.1.1 Operational Standards: "Every change to the database schema MUST ship as a versioned Supabase migration ... never an ad-hoc edit to the seed file or the Supabase Studio UI."
- Forward-only matches a deploy model where rollbacks happen by writing a new migration that undoes the previous change, not by reversing migrations in place.
- Each migration owns one aggregate (one core table + its RLS policies + any trigger), keeping diffs reviewable.

**Alternatives considered**:
- A custom JS migration runner. Rejected — duplicates Supabase CLI's behavior and requires maintaining ordering/transaction logic ourselves.
- Drizzle / Prisma migrations. Rejected — both are excellent ORMs but neither is needed for Phase 0 (the data-access modules wrap raw `supabase-js` queries) and adopting one now adds a second source of truth for schema.

## 3. Single-user middleware design

**Decision**: A single `auth` middleware sits in the request pipeline immediately after the request-id middleware. Behaviour branches on `SINGLE_USER_MODE`:
- When `true`: it sets `req.athleteId` to the seeded athlete's `id` (resolved once at boot from the seeded display name or via a config-injected ID) and calls `next()`.
- When `false`: it expects an `Authorization: Bearer <jwt>` header, validates the JWT with `@supabase/supabase-js`'s `auth.getUser(token)`, looks up `athletes.auth_user_id = user.id`, and sets `req.athleteId`. Missing or invalid token → `401`.

**Rationale**:
- Single switch flips behavior with zero source-code edits (Constitution Principle I, FR-005, US-3).
- JWT validation through the official Supabase client keeps key rotation and signing-key changes transparent — we do not parse JWTs ourselves.
- Looking up athletes by `auth_user_id` (not by email-on-each-request) keeps the request hot path one indexed query.

**Alternatives considered**:
- Two separate middleware files registered conditionally at boot. Rejected — splits the "auth seam" into two artifacts and makes the mode-switch test harder to write (it would have to verify wiring, not behavior).
- Decoding the JWT manually with `jsonwebtoken`. Rejected — Supabase's signing keys can rotate; using `auth.getUser` is the supported, rotation-safe path.

## 4. Supabase JS client initialization (server vs client)

**Decision**: Two distinct Supabase clients, instantiated in different layers:
- **Server-side** (`/services/dataAccess/supabaseClient.js`): created once with `SUPABASE_URL` + `SUPABASE_SECRET_KEY`. It is the only place in the backend that holds the secret key. RLS is bypassed for this client by Supabase design — that's why Principle I requires the application's own auth middleware as the primary tenant guard, with RLS as defense-in-depth for any direct DB access.
- **Frontend** (`/frontend/src/lib/supabaseClient.js`, NOT used in Phase 0 but scaffolded): created with `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY`. Phase 0 frontend reaches the API only via `/api/v1/`, so this file is wired but its only consumer is a future Supabase Auth login screen.

**Rationale**:
- Constitution v1.1.1 "Supabase key handling": secret key never reaches the browser; publishable key is the only key that crosses to the frontend.
- Two separate clients makes the boundary visually obvious in code review.

**Alternatives considered**:
- Single shared client module. Rejected — would couple frontend and backend bundles and make it dangerously easy to import the secret-key client into frontend code.

## 5. RLS policy pattern

**Decision**: Every domain table gets the following pair of policies in the same migration, gated on `auth.uid()`:

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "<table>_select_own" ON <table>
  FOR SELECT USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "<table>_modify_own" ON <table>
  FOR ALL USING (
    athlete_id IN (
      SELECT id FROM athletes WHERE auth_user_id = auth.uid()
    )
  ) WITH CHECK (
    athlete_id IN (
      SELECT id FROM athletes WHERE auth_user_id = auth.uid()
    )
  );
```

The lookup table `athletes` itself uses a tighter policy (`auth_user_id = auth.uid()`).

**Rationale**:
- Defence-in-depth for Principle I (FR-002, FR-003): if a future contributor accidentally bypasses the data-access layer and calls Supabase from another module, RLS still scopes the query.
- Phase 0 runs in single-user mode against the secret-key client, which bypasses RLS — so RLS does not affect the working app today, but the policies are exercised by `tests/integration/rls.policies.test.js` using a per-test JWT.

**Alternatives considered**:
- Single policy via `FOR ALL`. Rejected — separating SELECT from modify makes future read-only roles trivial.
- `USING ((SELECT auth.uid()) = athlete_id)` with `auth.uid()` directly equal to `athlete_id`. Rejected — it conflates the `athlete_id` (an internal `bigint` we control) with the Supabase Auth `uid` (a UUID Supabase controls). The indirection through `athletes.auth_user_id` keeps the two namespaces clean and lets one auth user map to many athletes later (e.g. coach + client) without a schema change.

## 6. Frontend build serving

**Decision**:
- **Dev**: `npm start` runs Express on `PORT` (default 3000) and Vite on its default `5173` concurrently (via `concurrently`). Vite proxies `/api/v1/*` to the Express server. The operator opens `http://localhost:5173`.
- **Phase 0 prod path is not exercised** (PLAN.md scopes Phase 0 to local). The plan documents the future shape: `npm run build` produces `frontend/dist/`; Express serves it as static under `/` with a SPA-fallback route, while still exposing `/api/v1/`.

**Rationale**:
- Vite's HMR is a step-function productivity gain over a hand-rolled dev pipeline.
- The proxy avoids CORS during dev without baking dev-only logic into the API; `CORS_ORIGIN` still gates real cross-origin in production.

**Alternatives considered**:
- Single-port dev (Express serves Vite via middleware). Rejected — couples the API process to frontend tooling; restarts the API every time Vite restarts.
- Separate package roots without npm workspaces. Rejected — forces `cd frontend && npm install` as a second operator step, breaking SC-001 ("≤ 5 minutes from clone to running").

## 7. Photo storage adapter

**Decision**: Keep the spec's clarified default — `filesystemAdapter` writes images under `./data/photos/<athlete_id>/<uuid>.<ext>` and returns a stable opaque key (`photos/<athlete_id>/<uuid>.<ext>`). The adapter interface is one file (`photoStorage/index.js`) with `put(key, bytes, mime)` / `get(key)` / `delete(key)` / `url(key)`. A future `supabaseStorageAdapter` can be added under the same interface; the swap is a config change.

**Rationale**:
- Honors clarification 2026-04-27 (point 5) without forcing a Supabase Storage dependency now.
- Keeps Phase 0's contract surface minimal — controllers and services only ever see opaque keys.

**Alternatives considered**:
- Default to Supabase Storage immediately. Rejected — would re-open a clarification that was already resolved, and the local adapter is a better fit for the offline-local Phase 0 workflow.
- Store images as base64 in a Postgres `bytea` column. Rejected by spec FR-021 ("MUST NOT store image binaries inside the application database").

## 8. Idempotent seed

**Decision**: Two-step seed:
1. **Static reference seed** (locale-tagged catalogues: exercises, foods, supplements, training phases, quotes) — loaded by `supabase/seed.sql` (Supabase's standard mechanism, runs after migrations). Uses `INSERT ... ON CONFLICT (locale, slug) DO NOTHING`.
2. **Athlete-scoped seed** (the current athlete profile, their weekly plan, their nutrition template) — loaded by `seed/runSeed.js`, which calls the data-access modules and uses `upsert` keyed on `(athlete_id, slug)` or equivalent stable natural keys. Wrapped in a single transaction.

The Node-side seed runs at boot when `--seed` is passed to `npm start` (or via `npm run seed`); both are idempotent.

**Rationale**:
- FR-011 (idempotent across launches), edge case "Existing data on launch", edge case "Partial seed failure" (transactional wrapper).
- Splitting reference vs athlete-scoped seed keeps the migration → seed pipeline canonical (Supabase loads `seed.sql` automatically) while still letting the program-generator output be an in-process Node operation rather than a static SQL file.

**Alternatives considered**:
- All-SQL seed. Rejected — the program generator is required to produce the seeded plan (FR-008), and it's a Node function. Re-implementing it in PL/pgSQL would violate Principle II (pure stateless service) and Principle V (testable in isolation).
- Drop-and-recreate seed. Rejected — destroys subsequent-launch data; violates FR-011 and SC-005.

## 9. Constitution alignment summary

All eight decisions above were checked against constitution v1.1.1 before being recorded:

| Principle | Decision touchpoints | Status |
|---|---|---|
| I. Multi-Tenant-Ready Data Model | §3 (auth), §5 (RLS), §8 (seed scopes athlete) | ✅ |
| II. Layered Architecture | §4 (client placement), §6 (API/UI separation), §7 (adapter) | ✅ |
| III. Configuration over Hardcoding | §1, §3, §4 (env keys, adapter, key separation) | ✅ |
| IV. Versioned API Contract | §6 (proxy targets `/api/v1`), out-of-band: contracts/openapi.yaml | ✅ |
| V. Test-First for Domain Logic | §8 (program generator stays Node-side, testable) | ✅ |
| VI. Athlete-First UX | §6 (Tailwind from day one in scaffold) | ✅ scaffold-only |
