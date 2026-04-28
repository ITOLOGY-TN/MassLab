# Phase 0 Research — Stack Decisions

**Feature**: 001-phase0-foundation
**Date**: 2026-04-27

This document records the technology decisions taken to fulfil the spec, with the alternatives evaluated and the reasoning for each pick. Once locked here, these choices are reflected in `package.json`, the source-tree layout, and the Constitution Check gate of this plan.

## SQLite client library

- **Decision**: `better-sqlite3` (Node binding, synchronous API).
- **Rationale**: The app is single-process and single-tenant in Phase 0, and event-loop concurrency is not the bottleneck — every meaningful operation is sub-millisecond on local SQLite. `better-sqlite3` gives us synchronous prepared statements (zero callback hell, tighter migration code, simpler tests), explicit transaction wrappers for the idempotent seed (FR-011), and the best benchmarked single-process throughput on Node. WAL mode is enabled by default.
- **Alternatives considered**:
  - `sqlite3` (older callback-based binding) — slower; async API adds ceremony with no payoff for a single-process app.
  - `node:sqlite` (Node 22.5+ experimental) — too new, behind an experimental flag, not on Node 20 LTS.
  - Drizzle / Prisma — more abstraction than this phase needs; complicates the migration story (we want plain SQL files reviewable in PRs). Reconsider in a later phase.

## HTTP framework and version

- **Decision**: Express 4.x.
- **Rationale**: PLAN.md mandates Express. Pin to 4.x because Express 5 is still settling middleware compatibility and many ecosystem packages still target 4. Upgrade to 5 is a future PR.
- **Alternatives considered**:
  - Fastify — faster, schema-first, but PLAN.md says Express. Out of scope to change.
  - Express 5 — usable but unnecessary risk for Phase 0.

## Structured logger

- **Decision**: `pino`.
- **Rationale**: Lowest overhead in the Node ecosystem; JSON-by-default; supports redaction via the `redact` option (used to honour FR-014's secret-tag redaction); supports child loggers (used to bind `request_id` per request without re-emitting it on every log call); production-friendly when shipping to stdout for a future log collector.
- **Alternatives considered**:
  - `winston` — more configurable but materially slower and noisier in JSON mode.
  - Hand-rolled logger — fails the "structured at boundaries" rule too easily; needs reinventing redaction.

## Configuration loader and schema validator

- **Decision**: `dotenv` for the local adapter; `zod` for schema validation. Secret/non-secret tag carried by a small registry alongside the zod schema. Values are read from `process.env` once at startup, validated, frozen, and exposed via the adapter interface (`Loader#load(): Config`).
- **Rationale**: `dotenv` is the de-facto standard local loader. `zod` lets us define the config schema once, fail-fast on missing/invalid values (FR-010), and tag secrets for log redaction (FR-014). The adapter interface means swapping `.env` for a hosted secret manager later is replacing one file (FR-006).
- **Alternatives considered**:
  - `convict` — older, similar capability, smaller community in 2026.
  - `joi` — schema validation only; zod's API is cleaner and has better composability.

## Password hashing

- **Decision**: `bcrypt` (npm `bcrypt`, native binding), cost factor 12, configurable via env.
- **Rationale**: Battle-tested and widely audited. The seam itself is not exercised by a UI in Phase 0 (single-user mode bypasses auth), but the `password_hash` storage shape is locked now (FR-016).
- **Alternatives considered**:
  - `argon2` — stronger but heavier native dep; revisit when going online if regulators specifically require it.
  - `scrypt` (node built-in) — possible, but bcrypt's verify story is more familiar to most reviewers.

## Migration runner

- **Decision**: Custom thin runner — read `migrations/*.sql` in lexical order, execute each inside a transaction, record applied filenames in a `_migrations` table.
- **Rationale**: Forward-only by spec; no rollback complexity; stays under 100 lines and we own every line. Avoids a heavyweight dep for what is essentially a `for` loop and a `CREATE TABLE _migrations IF NOT EXISTS`.
- **Alternatives considered**:
  - `umzug` — flexible, but most of its surface targets ORM-coupled migrations.
  - `node-pg-migrate` — Postgres-only.
  - `knex` migrations — pulls in a query builder we do not otherwise use.

## Test runner

- **Decision**: `vitest` (with `supertest` for HTTP).
- **Rationale**: ESM-native, fast watch mode, Jest-compatible API, no Babel/TS pipeline. Supertest is the conventional HTTP integration helper for Express apps.
- **Alternatives considered**:
  - `jest` — slower ESM story, heavier config.
  - `node:test` — improving, but coverage and watch ergonomics still lag Vitest in early 2026.

## Request ID generator

- **Decision**: `crypto.randomUUID()` from Node core.
- **Rationale**: No dep needed. UUID v4 is sufficient for correlation; the constitution does not require sortable IDs. Generated once per request in the `requestId` middleware (FR-018).
- **Alternatives considered**:
  - `uuid` package — extra dep with no upside on Node 20+.
  - `nanoid` — slightly shorter strings; readability win is small, dep cost is real.

## Photo storage adapter

- **Decision**: Local-filesystem adapter writing to `./data/photos/<athlete_id>/<uuid>.<ext>`; the `athlete_photos` table stores the relative path. Adapter interface: `put(athleteId, buffer, ext) → ref`, `get(ref) → ReadableStream`, `delete(ref)`.
- **Rationale**: Photos are not in PLAN.md's first-launch acceptance flow, but the schema and adapter must exist now (FR-021). The interface mirrors S3 semantics so swapping later is a config change.
- **Alternatives considered**:
  - DB blobs — rejected; documented in spec.
  - Object-storage SDK from day one — overkill for a local-only Phase 0.

## Project layout (`src/` wrapper or not)

- **Decision**: No `src/` wrapper. Top-level directories per PLAN.md.
- **Rationale**: PLAN.md explicitly names paths starting at the repo root. Adding `src/` would silently diverge from the architecture contract.
- **Alternatives considered**:
  - `src/` wrapper — common in Node 2026, but breaks PLAN.md's directory contract.

## Idempotent seeding strategy

- **Decision**: Single transactional seed function `runSeed(db)` that:
  1. Begins a transaction.
  2. For each seeded entity, checks for existing rows by a stable natural key (e.g. `email` on athletes, `(athlete_id, locale, name)` on exercises) and inserts only if absent.
  3. Commits.
- **Rationale**: Honours FR-011 (idempotent across launches) and the "partial seed failure" edge case (atomic). Stable natural keys avoid duplicates without needing to track "has seeded" state out-of-band.
- **Alternatives considered**:
  - "Seeded" sentinel row in `_migrations` — feasible but couples seeding to the migration runner; cleaner to keep them separate concerns.
  - Truncate-and-reload — destructive; rejected.
