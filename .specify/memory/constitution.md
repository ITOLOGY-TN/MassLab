<!--
SYNC IMPACT REPORT
==================
Version change: 1.1.0 → 1.1.1
Bump rationale: PATCH. Terminology fix only. Supabase deprecated the legacy
`anon` and `service_role` API keys; the migration deadline was 2025-11-01
and new Supabase projects no longer expose those keys. The constitution's
named env keys and the "Supabase key handling" operational standard are
updated to use the current terms — publishable key (replaces anon) and
secret key (replaces service_role) — and the matching env vars
(`SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). The boundary itself
is unchanged: the secret key stays server-side, the publishable key is the
only key that may cross to the frontend. No principle was added, removed,
or redefined, so this is a non-semantic refinement.

Modified principles:
- III. Configuration over Hardcoding — env-var names updated
  (`SUPABASE_SERVICE_ROLE_KEY` → `SUPABASE_SECRET_KEY`,
   `SUPABASE_ANON_KEY` → `SUPABASE_PUBLISHABLE_KEY`).

Modified operational standards:
- "Supabase key handling" — wording updated to "secret key" / "publishable
  key"; rule unchanged.

Newly defined principles: none.
Added sections / entries: none.
Removed sections: none.

Templates / docs reviewed:
- ✅ PLAN.md — Phase 0 env list updated to the new key names.
- ✅ .specify/templates/{plan,spec,tasks}-template.md — generic scaffolds;
  no edit required.
- ⚠ specs/001-phase0-foundation/plan.md — still stale under v1.1.x.
  References better-sqlite3, `./data/masslab.db`, and a `/models/` directory.
  Will be regenerated via /speckit-plan against the corrected PLAN.md and
  this v1.1.1 constitution.
- ⚠ CLAUDE.md (project root) — still a stub. Follow-up to expand with
  Operational Standards (key handling under the new naming, RLS,
  migrations) remains open.

Follow-up TODOs:
- TODO(plan/phase0): Re-run /speckit-plan for 001-phase0-foundation so the
  plan, contracts, and data model reflect Supabase PostgreSQL, Supabase
  Auth, the new key naming, and React + Vite + Tailwind.
- TODO(CLAUDE.md): Expand runtime guidance file with folder layout, naming,
  lint rules, RLS conventions, key-handling rules (publishable vs secret),
  and test scaffolding conventions derived from these principles.
-->

# MassLab Constitution

## Core Principles

### I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)

Every domain table MUST carry an `athlete_id` foreign key from day one, even while
the app runs in single-user mode. Domain rows are never global; every read and write
MUST be scoped by `athlete_id`. An authentication middleware MUST sit in the request
pipeline at all times, gated by the `SINGLE_USER_MODE` environment flag — when
`true`, it transparently injects the seeded athlete's ID; when `false`, it delegates
to Supabase Auth and trusts no caller-supplied tenant identifier. Once
`SINGLE_USER_MODE=false` is in use, Supabase Row-Level Security (RLS) policies MUST
also enforce `athlete_id` scoping at the database layer so that a misbehaving service
or leaked key cannot read or write across tenants.

**Rationale**: This is the single most important architectural decision for the
future SaaS. Adding a tenant column later requires a backfill migration on every
table plus a sweep through every query — both bug-prone and irreversible once data
exists. Wiring it now costs nothing and removes the largest barrier to going online;
RLS turns the database itself into a defense-in-depth layer for that boundary.

### II. Layered Architecture & Separation of Concerns

Code MUST be organized as `routes → controllers → services → data-access`:

- **Routes** contain HTTP concerns only: method, path, parameter parsing, response
  envelope. No business logic. No database calls.
- **Controllers** orchestrate request/response and delegate to services.
- **Services** hold all business logic. Calculator functions
  (`/services/calculators.js`), the program generator
  (`/services/programGenerator.js`), the nutrition generator
  (`/services/nutritionGenerator.js`), and the progression engine
  (`/services/progressionEngine.js`) MUST be pure and stateless: explicit inputs,
  explicit outputs, no I/O, no globals, no time-based or random side effects.
- **Data-access** modules (repositories, or persistence-only modules colocated with
  the services that own them) encapsulate all calls to the Supabase client. Direct
  Supabase client calls MUST NOT appear in routes, controllers, or pure service
  functions. The frontend MUST NOT use the Supabase service-role key for any reason.

**Rationale**: Pure service functions are unit-testable in isolation, reusable by a
future mobile or third-party client, and swappable when the storage backend changes.
Routes-as-thin-shells let the same domain logic later serve REST, GraphQL, or a CLI
without rewrites. Confining Supabase calls behind a data-access boundary preserves
the option to introduce caching, batching, or a different persistence backend
without rewriting business logic.

### III. Configuration over Hardcoding (NON-NEGOTIABLE)

All environment-dependent values MUST come from `.env` or seed files. The required
keys for Phase 0 are: `SINGLE_USER_MODE`, `PORT`, `SUPABASE_URL`,
`SUPABASE_SECRET_KEY` (server-only; the modern replacement for the legacy
service-role key, prefixed `sb_secret_…`), `SUPABASE_PUBLISHABLE_KEY` (the
modern replacement for the legacy anon key, prefixed `sb_publishable_…`), and
`CORS_ORIGIN`.
No athlete profile data, secrets, Supabase URLs, keys, bucket names, or absolute
paths may appear in application source. The current athlete's profile lives in the
Supabase seed only and is injected through the program generator — never read from
a constant in code. A committed `.env.example` MUST list every key the app reads,
without real values.

**Rationale**: Switching between local development, staging, and production Supabase
projects must be a configuration change, not a code change. Hardcoded values
silently couple the app to one deployment and one user, exactly the trap this
project is built to avoid. Hardcoded keys also leak into git history and are far
harder to revoke than to rotate.

### IV. Versioned API Contract

All HTTP endpoints MUST live under `/api/v1/`. Breaking changes — removed fields,
renamed routes, altered semantics, changed status codes — ship under a new version
prefix; existing clients continue calling the old version until the team retires it
through an explicit deprecation window. Response bodies MUST be JSON and stable for
a given version. Field additions are non-breaking and allowed within a version.

**Rationale**: A future mobile app or third-party integration cannot tolerate silent
contract changes. Versioning isolates client churn from server evolution and lets
the SaaS evolve without coordinating every release with every consumer.

### V. Test-First for Domain Logic (NON-NEGOTIABLE)

The following modules MUST have unit tests written before implementation, asserted
to fail first (red), then made to pass (green), then refactored:

- Calculators: BMR, TDEE, macronutrient split, all 1RM formulas, body composition
  estimator
- Program generator, nutrition generator
- Progressive overload rule engine (double progression, stagnation, deload, monthly
  trend)
- Any function that produces a number stored in the athlete profile or surfaced as
  a recommendation

UI rendering, layout, and styling are exempt from strict TDD but MUST receive at
least a smoke test (renders without error, primary interaction succeeds) before
merge.

**Rationale**: A wrong calorie target or 1RM estimate silently sabotages months of
training. Domain math is the asset of this product; everything else is presentation.
Tests are the only durable defense against silent regressions in formulas that few
humans re-verify by hand.

### VI. Athlete-First UX

Every screen MUST answer a real question the athlete has before, during, or after a
session. Frontend work MUST go through the Frontend Design skill — generic,
default-styled UI is rejected at review. The frontend stack is React + Vite +
Tailwind CSS; styling MUST flow through Tailwind utilities and a small set of
shared design tokens, not ad-hoc CSS files per component. Journal flows (set
logging, rest timer, exercise navigation) MUST be operable one-handed: large hit
targets, ±2.5 kg and ±1 rep quick buttons, no fine-precision keyboard inputs during
a set. Auto-save MUST fire at least every 30 seconds during an active session so
that a closed tab or crashed browser never costs a workout's data.

**Rationale**: This is a tool used mid-workout, with sweaty hands and limited
attention. Aesthetic polish and ergonomic input design are not decoration — they
determine whether the app gets opened a second time. A single, opinionated styling
system (Tailwind + tokens) is what keeps the bar high without forcing every PR to
re-litigate spacing and color decisions.

## Operational Standards

- **Structured logging**: Services MUST emit structured logs at boundaries (request
  entry, external Supabase call, error path). Bare `console.log` MUST NOT appear in
  committed code outside development scaffolding.
- **Supabase Row-Level Security**: Once `SINGLE_USER_MODE=false` is supported, every
  domain table MUST have an RLS policy that restricts row access to the
  authenticated athlete's `auth.uid()`. RLS policies ship in the same migration as
  the table they protect; a table without an RLS policy MUST NOT reach a multi-user
  environment.
- **Supabase key handling**: The `SUPABASE_SECRET_KEY` (prefixed `sb_secret_…`,
  the modern replacement for the legacy service-role key) MUST stay server-side —
  it is loaded only by the Node/Express process and never exposed to the browser,
  the build output, or the git history. Only `SUPABASE_PUBLISHABLE_KEY` (prefixed
  `sb_publishable_…`, the modern replacement for the legacy anon key) may cross to
  the frontend, and only via runtime config injection, never baked into a public
  bundle. The legacy `service_role` and `anon` keys MUST NOT be used: Supabase
  deprecated them and new projects no longer expose them.
- **Persistence integrity**: JSON export and JSON import MUST round-trip losslessly
  on the same schema version. Selective and full reset MUST require double
  confirmation in the UI.
- **Performance**: Journal set-logging interactions MUST respond in under 100 ms on
  the target hardware (modern laptop or mobile browser). Background calculations
  (overload flags, body composition) MUST NOT block the UI thread.
- **Local-first today, online-ready tomorrow**: The app runs locally during Phase
  0–11 development against a Supabase project (local Supabase CLI stack or a
  dev-only hosted project). Any code that assumes always-on connectivity beyond
  Supabase (analytics, error reporting, third-party AI providers) MUST be
  feature-flagged and default off.
- **Localization seam**: User-facing copy is currently French, but strings MUST flow
  through a single source (strings module or i18n catalog) so a second locale can
  be added without sweeping the codebase.
- **Schema migrations**: Every change to the database schema MUST ship as a
  versioned Supabase migration (e.g. `supabase/migrations/<timestamp>_<name>.sql`)
  — never an ad-hoc edit to the seed file or the Supabase Studio UI without a
  matching committed migration. Migrations MUST be forward-only and replayable from
  an empty Supabase project.
- **Frontend toolchain**: The frontend is a React + Vite + Tailwind CSS app served
  from `/frontend`. Tailwind config and design tokens are the single source of
  truth for spacing, color, and typography. Component-scoped CSS files are
  permitted only when Tailwind cannot express the rule (e.g. complex keyframe
  animations).

## Development Workflow & Quality Gates

- **Spec-driven**: Every feature MUST follow the Spec Kit flow:
  `/speckit-specify` → `/speckit-clarify` (when needed) → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Implementation without an approved spec
  is rejected at review.
- **Constitution Check gate**: `/speckit-plan` MUST verify the plan does not violate
  any principle. Violations require a Complexity Tracking entry justifying why a
  simpler, principle-compliant alternative was rejected.
- **Branching**: Each feature lives on its own numbered branch (e.g.
  `001-phase0-foundation`, `002-calculators`). The `before_specify` hook enforces
  feature branch creation.
- **Commits**: The Spec Kit auto-commit hooks SHOULD remain enabled so each phase
  (spec, plan, tasks, implement) is reviewable in isolation.
- **Code review**: PRs that touch services, the Supabase schema, RLS policies, or
  the auth middleware MUST be reviewed against Principles I (athlete_id scoping +
  RLS) and III (configuration, key handling) before merge. Reviewers MUST reject
  hardcoded athlete data, hardcoded Supabase URLs/keys, and any service-role key
  reaching frontend code on sight.
- **Frontend review**: PRs that touch the UI MUST cite which Frontend Design skill
  decisions were applied and confirm Tailwind tokens were used; "looks fine, ship
  it" is not an acceptable review.

## Governance

This constitution supersedes all other development practices, ad-hoc conventions,
and prior informal agreements. When the constitution conflicts with a habit, the
constitution wins.

**AI boundary**: Phases 0–11 deliver a fully working product without any AI
generation. Calculators, the program generator, the nutrition generator, and the
progression engine are deterministic by design. Adding AI is a Phase 12 concern at
the earliest. When AI is added, it MUST go through `/services/aiCoach.js` (or, if
heavier ML is genuinely required, a separate Python FastAPI microservice) and MUST
NOT bypass calculators, the program generator, or athlete-scoped persistence.

**Amendment procedure**: Amendments are proposed by running
`/speckit-constitution`, reviewed in the resulting commit, and merged into `main`.
The Sync Impact Report at the top of this file documents every change. Templates
and runtime guidance affected by an amendment MUST be updated in the same commit
or explicitly flagged as pending in the report.

**Versioning policy** (semantic versioning):

- **MAJOR**: A principle is removed, redefined incompatibly, or governance rules
  change in a way that invalidates existing specs or plans.
- **MINOR**: A new principle or section is added, or an existing principle is
  materially expanded.
- **PATCH**: Clarifications, wording, typo fixes, non-semantic refinements.

**Compliance review**: At minimum once per implementation phase milestone (per
PLAN.md), the team MUST audit the codebase against each principle and record
findings. Persistent violations either trigger a code fix or, if justified, an
amendment that ratifies the new reality.

**Runtime guidance**: Day-to-day implementation guidance lives in `CLAUDE.md` at
the project root. When `CLAUDE.md` and the constitution disagree, the constitution
wins and `CLAUDE.md` MUST be updated.

**Version**: 1.1.1 | **Ratified**: 2026-04-27 | **Last Amended**: 2026-04-28
