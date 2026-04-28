# Feature Specification: Phase 0 — Foundation and Architecture

**Feature Branch**: `001-phase0-foundation`
**Created**: 2026-04-27
**Status**: Draft
**Input**: User description: "read PLAN.md and create specification for Phase 0: Foundation And Architecture page only"

## Clarifications

### Session 2026-04-28

- Q: How do the identity columns on the `athletes` table change under the Supabase stack adopted in PLAN.md v2 and constitution v1.1.x? → A: Supabase Auth manages credentials in `auth.users`; the application's `athletes` table replaces the previously-clarified `password_hash` column with a nullable `auth_user_id UUID UNIQUE REFERENCES auth.users(id)`. Behavior is unchanged from the operator's perspective — standard email/password login activates when single-user mode is disabled — but credential storage is delegated to Supabase, which is the platform-correct location and removes any need for the application to hash, store, or rotate passwords directly.

### Session 2026-04-27

- Q: Which identity columns must exist on the `athletes` table from the first migration? → A: Email (unique, non-null) + password_hash (nullable) + display_name (optional). Standard email/password login activates when single-user mode is disabled. *(Superseded by the 2026-04-28 clarification above: `password_hash` is replaced by `auth_user_id` under Supabase Auth.)*
- Q: How should secret-vs-config separation be handled in Phase 0? → A: `.env` gitignored + `.env.example` committed; configuration schema marks every key as secret or non-secret (used for log redaction); loader sits behind an adapter interface so the default `.env` reader can later be swapped for an external secret manager without touching call sites.
- Q: How much observability machinery must Phase 0 ship? → A: Structured per-request log entries (method, path, status, duration, request_id, athlete_id when authenticated) plus a correlation-ID middleware that sits before authentication so rejected requests still carry a `request_id`. `/health` and `/ready` endpoints and a pluggable logger transport adapter are deferred to a later phase.
- Q: How much of the localization seam must be wired in Phase 0? → A: DB schema only — translatable seed tables (quotes, exercises, foods, supplements, training phases) carry a `locale` column from the first migration, populated `fr-FR` for the seeded content. A code-level i18n catalog (e.g. `t(key, locale)`) is deferred to the phase where UI strings actually ship.
- Q: What persistence shape do sensitive-data tables and photo storage take in Phase 0? → A: Photos go through a `photo_storage` adapter interface (default writes to local filesystem under `/data/photos/<athlete_id>/`; never stored as DB blobs); body weight and measurement columns stored as plaintext numeric values to preserve aggregate query performance; column-level encryption-at-rest deferred until going-online preparation.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — First Launch Is Ready to Use (Priority: P1)

When the athlete launches the application for the first time, their full muscle-building program is already in place: profile, exercise library, weekly training plan, training phases, daily nutrition plan, supplement stack, food database, and motivational quotes. The athlete does not perform any setup, import, or configuration before they can log a session.

**Why this priority**: Without this, the rest of the program (sessions, nutrition, supplements, dashboard) has nothing to read from and cannot be demonstrated. Foundation must deliver a usable seeded environment before any other feature has value.

**Independent Test**: Bring the application online from a fresh state, navigate to its local URL, and verify that the seeded athlete profile, the exercise library (at least 18 exercises), the weekly plan (5 active training days), the training phases (3 phases), the nutrition template (5 meals), the supplement list (5 items), the food database (at least 50 foods), and the rotating quote (at least 30 quotes) are all visible and readable without any user action other than navigating.

**Acceptance Scenarios**:

1. **Given** a freshly cloned project with no prior data, **When** the operator brings the application online and opens the local URL, **Then** the athlete profile page shows the seeded athlete's identity and physical metrics.
2. **Given** the application is online for the first time, **When** the operator opens the exercise library, **Then** at least 18 exercises with instructions and targeted muscles are visible.
3. **Given** the application is online for the first time, **When** the operator opens the weekly plan, **Then** 5 active training days are listed, each assigned to a muscle group, with at least one exercise per day.
4. **Given** the application is online for the first time, **When** the operator opens the nutrition view, **Then** 5 meal slots are populated with the daily program template and macro targets.

---

### User Story 2 — Tenant-Isolated Data From Day One (Priority: P1)

Every domain record created by the seeded athlete (sessions, sets, weights, measurements, nutrition entries, supplement check-ins, recovery logs, configuration, quotes shown) is tied to that athlete's identifier in storage. A second profile added later — or another tenant added when the platform goes online — would not see, modify, or accidentally inherit any of the first athlete's records.

**Why this priority**: This is the single architectural decision that determines whether the platform can become multi-user without a painful migration. Establishing it on day one is materially easier and safer than retrofitting it after data accumulates.

**Independent Test**: Inspect the persisted data store after the seed completes; every domain table that holds athlete-scoped data carries a non-null tenant identifier referring to the seeded athlete. Insert a hypothetical second athlete and re-run a representative read query — the original athlete's records remain invisible to the second profile without a code change.

**Acceptance Scenarios**:

1. **Given** the application has finished seeding, **When** the operator inspects the data store schema, **Then** every domain table that holds athlete-scoped data has a tenant-identifier column that is non-nullable.
2. **Given** the seed has run, **When** any record from a domain table is read, **Then** it carries the seeded athlete's tenant identifier.
3. **Given** a hypothetical second athlete is added directly to the data store, **When** the application reads domain records on behalf of that second athlete, **Then** none of the seeded athlete's records are returned.

---

### User Story 3 — Multi-User Mode Activates Without Code Changes (Priority: P2)

The operator can switch the application from "single-user, no login" to "multi-user, login required" by changing one configuration value, without editing source code and without rebuilding. The authentication slot is always present in the request pipeline; the configuration value only flips it between transparent (auto-resolves to the seeded athlete) and enforcing (requires authenticated requests).

**Why this priority**: This is the deliverable that proves the architecture is online-ready. It is not the login UI itself — that ships later — but the seam that makes adding the login UI a feature change rather than a refactor.

**Independent Test**: With the single-user flag enabled, every request succeeds without credentials and resolves to the seeded athlete. With the flag disabled and the application restarted, the same requests are rejected as unauthenticated. No application source files are modified between the two states; only the configuration value changes.

**Acceptance Scenarios**:

1. **Given** the single-user-mode flag is enabled, **When** any request reaches the application, **Then** it succeeds and is associated with the seeded athlete.
2. **Given** the single-user-mode flag is disabled and the application is restarted, **When** an unauthenticated request reaches the application, **Then** it is rejected with an authentication-required response.
3. **Given** the operator wishes to switch modes, **When** they change only the configuration file value and restart the application, **Then** the switch takes effect with no source-code edits.

---

### User Story 4 — One-Command Startup on a Fresh Machine (Priority: P3)

A new operator (initially the athlete's developer self, later a teammate or a deployment automation) can bring the application online on a clean machine through a documented short sequence of commands, with no manual file edits beyond providing or accepting the default configuration.

**Why this priority**: Fast, reproducible startup is what keeps Phase 0 worth shipping; if the foundation requires hours of bespoke setup, the whole program slips. It ranks below the data-model and config principles because it can be polished iteratively, but it must work by end of phase.

**Independent Test**: On a clean machine with only the runtime prerequisites installed, the operator follows the documented startup commands and reaches the running application at its local URL within minutes, without manual intervention beyond the documented steps.

**Acceptance Scenarios**:

1. **Given** a fresh checkout on a clean machine, **When** the operator runs the documented install and start commands, **Then** the application becomes reachable at its configured local URL with no further intervention.
2. **Given** the documented startup sequence, **When** an operator follows it for the first time, **Then** they encounter no undocumented manual file edits, schema initialisations, or seed steps.

---

### Edge Cases

- **Existing data on launch**: When the application starts and the data store already contains seeded records, it MUST preserve them and MUST NOT re-seed or duplicate any record.
- **Missing required configuration**: When a required configuration value is absent or invalid, the application MUST refuse to start and MUST emit a clear, actionable error identifying the missing/invalid value. It MUST NOT start in a partially-configured state.
- **Partial seed failure**: When seeding fails midway, the data store MUST end in a consistent state — either fully seeded or fully empty — so that re-launching is safe and idempotent.
- **Single-user-mode flag absent**: When the single-user-mode flag is not set explicitly, the application MUST default to enabled (single-user) and MUST log a visible startup warning recommending the flag be set explicitly before going online.
- **Configuration value points at a non-writable location**: When the configured data-store location cannot be created or written, the application MUST refuse to start with an error that names the failing path.
- **Operator changes the configured port**: When the configured port is changed, the application MUST bind to the new port on the next start with no further changes required.
- **Mode flag flipped at runtime**: A runtime toggle is out of scope; mode change requires an application restart. This MUST be stated in the startup error/warning if a flip is attempted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST initialise its persistent data store on first launch and populate it with the seed defined for the program (athlete profile, exercises, weekly plan, training phases, nutrition template, supplements, food database, motivational quotes).
- **FR-002**: System MUST attach a tenant identifier (`athlete_id`) to every domain record from the very first migration; no domain table may be created without it.
- **FR-003**: System MUST scope every read and write of athlete-owned data by the requesting tenant identifier.
- **FR-004**: System MUST expose all HTTP endpoints under a versioned base path so that breaking client contracts can ship under a new version without disturbing existing consumers.
- **FR-005**: System MUST place an authentication middleware in the request pipeline that is always loaded. When the single-user-mode configuration flag is enabled, the middleware MUST transparently resolve every request to the seeded athlete; when disabled, the middleware MUST require authenticated requests and reject those that are not.
- **FR-006**: System MUST read all environment-dependent values — at minimum: data-store location, network port, single-user-mode flag — through a configuration loader at startup. The loader MUST sit behind an adapter interface so the default `.env` reader can later be replaced by an external secret source (e.g. a hosted secret manager) without changing call sites. Each configuration key MUST be tagged in the configuration schema as either `secret` or non-secret. No environment-dependent value may appear as a hard-coded constant in source.
- **FR-007**: System MUST keep all business logic in dedicated controller and service layers. Route handlers may only translate HTTP input and shape HTTP output; they MUST NOT issue data-store calls directly.
- **FR-008**: System MUST expose a program-generation service that, given an athlete profile, returns a complete program (training plan, daily calorie and macro targets, supplement recommendations, recovery guidelines), and MUST use it to build the seeded athlete's program.
- **FR-009**: System MUST be startable via a documented short command sequence (install + start) on a fresh checkout of the project.
- **FR-010**: System MUST refuse to start with a clear, actionable error when any required configuration value is missing or invalid.
- **FR-011**: System MUST be idempotent across launches: existing seeded data is preserved on subsequent starts and never duplicated.
- **FR-012**: Seed content MUST include at minimum: 18 exercises with instructions and targeted muscles, a 5-day weekly plan with muscle-group assignments, 3 training phases with parameters, a 5-meal daily nutrition template, 5 supplements with dosage and timing, 50 common foods with macros, and 30 motivational quotes.
- **FR-013**: System MUST keep all athlete-specific values (identity, body metrics, goals) in seed and configuration files only. No athlete-specific value may appear as a hard-coded constant in application source.
- **FR-014**: System MUST log a structured entry on startup summarising: configuration values loaded (with every key tagged `secret` in the configuration schema redacted), single-user-mode state, data-store location, and whether seeding occurred.
- **FR-015**: System MUST default the single-user-mode flag to enabled when it is unset, and MUST emit a visible startup warning when this default is in effect.
- **FR-016**: The `athletes` table MUST include a non-null unique `email` column and a nullable `auth_user_id UUID UNIQUE REFERENCES auth.users(id)` column from its first migration. When single-user mode is disabled, the authentication middleware MUST validate the Supabase-issued bearer token on each request, extract the authenticated user identifier, and resolve it to an athlete via `auth_user_id`. The application MUST NOT store password hashes itself; Supabase Auth owns credential storage and verification.
- **FR-017**: The repository MUST gitignore the live `.env` file from the very first commit and MUST commit a `.env.example` file containing every required configuration key with placeholder (non-secret) values, so a new operator can copy it to `.env` and start the application after editing only the values specific to their environment.
- **FR-018**: A request-correlation middleware MUST attach a unique `request_id` to every incoming HTTP request and MUST sit before the authentication middleware so the `request_id` is present even on requests that are rejected as unauthenticated. The `request_id` MUST be available to every log line emitted during that request's lifetime.
- **FR-019**: System MUST emit one structured log entry per HTTP request containing at minimum: method, path, response status, duration in milliseconds, `request_id`, and `athlete_id` when the request was successfully authenticated (omitted otherwise). `/health` and `/ready` probe endpoints and a pluggable logger transport adapter are explicitly out of scope for this phase.
- **FR-020**: Every translatable seed table — at minimum quotes, exercises, foods, supplements, and training phases — MUST include a non-null `locale` column from its first migration. All seeded rows MUST be tagged `fr-FR`. A future second locale MUST be addable by inserting additional rows, never by altering the schema. A code-level i18n catalog for UI strings is out of scope for this phase.
- **FR-021**: Photo storage MUST go through a `photo_storage` adapter interface. The default adapter MUST persist image files to the local filesystem under `/data/photos/<athlete_id>/`, MUST NOT store image binaries inside the application database, and MUST expose only stable opaque references (relative paths or storage keys) to controllers and services. Replacing the default adapter with an external object-storage adapter MUST be achievable through configuration alone, with no changes to controllers or services.
- **FR-022**: Body weight and body measurement columns MUST be stored as plaintext numeric values in Phase 0 so that aggregate trend queries (deltas, charts, projections) require no per-row decryption. Column-level encryption-at-rest is explicitly out of scope for this phase but MUST be in place before any production multi-user rollout.

### Key Entities *(include if feature involves data)*

- **Athlete Profile**: The person being tracked. Holds email (unique, non-null), auth_user_id (nullable UUID, FK to `auth.users(id)`; populated only when the athlete signs up via Supabase Auth, null while the seeded single-user mode is in use), display_name (optional), age, biological sex, height, starting weight, target weight, morphotype, goal, weekly session count, available equipment, known injuries, program start date. Owns every other domain record via the tenant identifier. Credential storage and password hashing are delegated to Supabase Auth and live outside the application's tables.
- **Exercise**: A movement in the library. Holds name, targeted muscles, instructions, technique points, optional media references. Reusable across athletes.
- **Weekly Plan Slot**: An assignment of a training day to a muscle group and a list of exercises for a given athlete.
- **Training Phase**: A multi-week period with volume and intensity parameters used by the program generator and the session journal.
- **Nutrition Template / Meal**: The athlete's daily meal structure with macro targets per meal.
- **Supplement**: A substance with dosage, recommended timing, and per-athlete adherence record.
- **Food**: A line item in the food database with name and macros per 100 g, used to compose nutrition entries.
- **Quote**: A motivational quote shown rotationally on the dashboard. Carries a `locale` tag (e.g. `fr-FR`).
- **Body Measurement**: A periodic record attached to an athlete and a date holding body weight and optional girths (arm, chest, thighs, shoulders, waist). Stored as plaintext numeric columns in Phase 0; encryption-at-rest deferred.
- **Athlete Photo**: A photographic record of an athlete's body at a given date. Image binary lives outside the application database via the `photo_storage` adapter (default = local filesystem); only the storage reference, the date, and optional metadata (e.g. weight overlay) live in the database.
- **Application Configuration**: Environment-driven values (single-user-mode flag, network port, data-store location, feature flags, future authentication secrets) loaded at startup through an adapter-backed loader. Each key is tagged in the schema as `secret` or non-secret; the default adapter reads from a `.env` file, and alternative adapters (e.g. external secret manager) can be plugged in later without changes to call sites.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new operator on a clean machine reaches the running application at its local URL within 5 minutes of starting the documented install + start sequence.
- **SC-002**: 100% of domain tables that hold athlete-scoped data carry a non-nullable tenant identifier from the very first migration, verifiable by inspecting the schema.
- **SC-003**: Switching between single-user and multi-user modes is achieved by changing exactly one configuration value, restarting the application, and editing zero application source files.
- **SC-004**: On first launch, the seeded athlete sees their full program (profile, exercises, weekly plan, phases, nutrition template, supplements, foods, quote) without performing any setup action.
- **SC-005**: A second consecutive launch preserves all prior data and does not duplicate any seeded record (verifiable by row counts being unchanged for seeded tables).
- **SC-006**: Changing the configured data-store location to a different storage target is achievable through configuration alone, with no application source change.
- **SC-007**: Zero athlete-specific values (identity, body metrics, goals) appear in application source outside seed and configuration files, verifiable by full-text search of the source tree.
- **SC-008**: Starting the application with a missing required configuration value fails fast (within 5 seconds) with an error message that names the missing value and what to set it to.
- **SC-009**: 100% of HTTP endpoints are reachable under a single versioned base path; no endpoint is reachable outside that base path.
- **SC-010**: 100% of HTTP request log entries carry a non-empty `request_id`, including those for requests rejected as unauthenticated.

## Assumptions

- The seeded athlete is the profile described in PLAN.md (29 yrs, 173 cm, 58 kg, ectomorph, intermediate lifter, 5 sessions/week, +6 to +8 kg muscle goal over 5 months). Other athlete data is out of scope for this phase.
- The implementation stack and folder layout are those declared in PLAN.md v2 and constitution v1.1.x (Node.js + Express backend; Supabase PostgreSQL for storage; Supabase Auth for the future multi-user auth path; React + Vite + Tailwind CSS frontend; folder layout `/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`, with Supabase client calls living behind data-access modules per Principle II). Changes to that stack are out of scope for this spec and would be addressed by amending PLAN.md and the constitution.
- The operator runs the application locally during this phase; no external network, CDN, or third-party service is required to start or use it.
- A login screen is intentionally out of scope for this phase. The authentication seam exists; the UI on top of it ships in a later phase.
- Data import and export, selective reset, and full reset (defined in Phase 2 of PLAN.md) are out of scope here. Phase 0 only ensures data can be preserved across restarts.
- The user's request "Foundation And Architecture page only" is interpreted as "the Phase 0 work only, not other phases". An in-app "Architecture" page is not derived from PLAN.md and is treated as out of scope; if a literal architecture overview page is intended, it can be added by a follow-up specification.
- The runtime mode (single-user vs multi-user) changes only at startup; runtime toggling is explicitly out of scope.
- Compliance with the project constitution (multi-tenant-ready data model, layered architecture, configuration over hardcoding, versioned API, athlete-first UX, test-first for domain logic) governs any choice not pinned by this spec.
