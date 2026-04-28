<!--
SYNC IMPACT REPORT
==================
Version change: (template, unfilled) → 1.0.0
Bump rationale: Initial ratification. The previous file contained only Spec Kit
template placeholders (`[PROJECT_NAME]`, `[PRINCIPLE_*]`, etc.); this commit replaces
them with the first concrete governance for MassLab. By convention, the first
non-template constitution is 1.0.0 rather than 0.x.

Modified principles: none (initial fill — all six principles are new).
Newly defined principles:
- I.   Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)
- II.  Layered Architecture & Separation of Concerns
- III. Configuration over Hardcoding (NON-NEGOTIABLE)
- IV.  Versioned API Contract
- V.   Test-First for Domain Logic (NON-NEGOTIABLE)
- VI.  Athlete-First UX

Added sections:
- Operational Standards
- Development Workflow & Quality Gates
- Governance (amendment procedure, semver policy, compliance review, runtime
  guidance pointer)

Removed sections: none.

Templates / docs reviewed:
- ✅ .specify/templates/plan-template.md — its "Constitution Check" gate reads
  "[Gates determined based on constitution file]"; principles below are concrete
  enough for /speckit-plan to derive per-feature gates without editing the template.
- ✅ .specify/templates/spec-template.md — generic scaffold; no edit required. Specs
  MUST still address Multi-Tenant-Ready Data Model (athlete_id scoping) and
  Athlete-First UX where applicable.
- ✅ .specify/templates/tasks-template.md — generic scaffold; no edit required. Per-
  feature tasks SHOULD include athlete_id scoping and service-layer test scaffolding
  whenever they touch persistence or domain math.
- ⚠ CLAUDE.md (project root) — currently a stub pointing to PLAN.md. Recommended
  follow-up: expand to mirror Operational Standards and Development Workflow gates.

Follow-up TODOs:
- TODO(CLAUDE.md): Expand runtime guidance file with folder layout, naming, lint
  rules, and test scaffolding conventions derived from these principles.
-->

# MassLab Constitution

## Core Principles

### I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)

Every domain table MUST carry an `athlete_id` foreign key from day one, even while
the app runs in single-user mode. Domain rows are never global; every read and write
MUST be scoped by `athlete_id`. An authentication middleware MUST sit in the request
pipeline at all times, gated by the `SINGLE_USER_MODE` environment flag — when
`true`, it transparently injects the seeded athlete's ID; when `false`, it enforces
real authentication without requiring changes anywhere else in the codebase.

**Rationale**: This is the single most important architectural decision for the
future SaaS. Adding a tenant column later requires a backfill migration on every
table plus a sweep through every query — both bug-prone and irreversible once data
exists. Wiring it now costs nothing and removes the largest barrier to going online.

### II. Layered Architecture & Separation of Concerns

Code MUST be organized as `routes → controllers → services → models`:

- **Routes** contain HTTP concerns only: method, path, parameter parsing, response
  envelope. No business logic. No database calls.
- **Controllers** orchestrate request/response and delegate to services.
- **Services** hold all business logic. Calculator functions
  (`/services/calculators.js`) and the program generator
  (`/services/programGenerator.js`) MUST be pure and stateless: explicit inputs,
  explicit outputs, no I/O, no globals, no time-based or random side effects.
- **Models** encapsulate persistence. SQL or ORM calls MUST NOT appear outside
  models.

**Rationale**: Pure service functions are unit-testable in isolation, reusable by a
future mobile or third-party client, and swappable when the storage backend changes.
Routes-as-thin-shells let the same domain logic later serve REST, GraphQL, or a CLI
without rewrites.

### III. Configuration over Hardcoding (NON-NEGOTIABLE)

All environment-dependent values MUST come from `.env` or seed files: database
driver and path, port, feature flags (including `SINGLE_USER_MODE`), and any
deployment-specific paths or credentials. No athlete profile data, secrets, or
absolute paths may appear in application source. The current athlete's profile
lives in the database seed only and is injected through the program generator —
never read from a constant in code.

**Rationale**: Migrating local SQLite to hosted PostgreSQL must be a configuration
change, not a code change. Hardcoded values silently couple the app to one
deployment and one user, exactly the trap this project is built to avoid.

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
- Program generator
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
default-styled UI is rejected at review. Journal flows (set logging, rest timer,
exercise navigation) MUST be operable one-handed: large hit targets, ±2.5 kg and ±1
rep quick buttons, no fine-precision keyboard inputs during a set. Auto-save MUST
fire at least every 30 seconds during an active session so that a closed tab or
crashed browser never costs a workout's data.

**Rationale**: This is a tool used mid-workout, with sweaty hands and limited
attention. Aesthetic polish and ergonomic input design are not decoration — they
determine whether the app gets opened a second time.

## Operational Standards

- **Structured logging**: Services MUST emit structured logs at boundaries (request
  entry, external call, error path). Bare `console.log` MUST NOT appear in committed
  code outside development scaffolding.
- **Persistence integrity**: JSON export and JSON import MUST round-trip losslessly
  on the same schema version. Selective and full reset MUST require double
  confirmation in the UI.
- **Performance**: Journal set-logging interactions MUST respond in under 100 ms on
  the target hardware (modern laptop or mobile browser). Background calculations
  (overload flags, body composition) MUST NOT block the UI thread.
- **Offline-first today, online-ready tomorrow**: The app MUST run with no network
  access. Any code that assumes connectivity (analytics, error reporting, future
  auth providers) MUST be feature-flagged and default off.
- **Localization seam**: User-facing copy is currently French, but strings MUST flow
  through a single source (strings module or i18n catalog) so a second locale can
  be added without sweeping the codebase.
- **Schema migrations**: Every change to the database schema MUST ship as a
  versioned migration script — never an ad-hoc edit to the seed file. Migrations
  MUST be forward-only and replayable from an empty database.

## Development Workflow & Quality Gates

- **Spec-driven**: Every feature MUST follow the Spec Kit flow:
  `/speckit-specify` → `/speckit-clarify` (when needed) → `/speckit-plan` →
  `/speckit-tasks` → `/speckit-implement`. Implementation without an approved spec
  is rejected at review.
- **Constitution Check gate**: `/speckit-plan` MUST verify the plan does not violate
  any principle. Violations require a Complexity Tracking entry justifying why a
  simpler, principle-compliant alternative was rejected.
- **Branching**: Each feature lives on its own numbered branch (e.g.
  `001-foundation`, `002-calculators`). The `before_specify` hook enforces feature
  branch creation.
- **Commits**: The Spec Kit auto-commit hooks SHOULD remain enabled so each phase
  (spec, plan, tasks, implement) is reviewable in isolation.
- **Code review**: PRs that touch services, schema, or the auth middleware MUST be
  reviewed against Principles I (athlete_id scoping) and III (configuration) before
  merge. Reviewers MUST reject hardcoded athlete data on sight.
- **Frontend review**: PRs that touch the UI MUST cite which Frontend Design skill
  decisions were applied; "looks fine, ship it" is not an acceptable review.

## Governance

This constitution supersedes all other development practices, ad-hoc conventions,
and prior informal agreements. When the constitution conflicts with a habit, the
constitution wins.

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

**Version**: 1.0.0 | **Ratified**: 2026-04-27 | **Last Amended**: 2026-04-27
