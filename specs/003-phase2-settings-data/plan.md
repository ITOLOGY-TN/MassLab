# Implementation Plan: Phase 2 — Settings & Data Management

**Branch**: `003-phase2-settings-data` | **Date**: 2026-05-08 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-phase2-settings-data/spec.md`

## Summary

Phase 2 turns MassLab into a self-serviceable app. On top of the Phase 0 foundation and the Phase 1 calculator engine, we add a single Settings surface that owns: athlete profile editing (re-using the Phase 1 engine + audit writer for any save that changes a calculator input), weekly training schedule (with a per-athlete `muscle_groups` catalogue replacing the free-text column on `weekly_plan_slots`), exercise CRUD + per-day reorder (with soft-delete when referenced by historical sessions), app preferences (theme, units, rest-timer sounds, notification acknowledgements), custom nutrition target overrides written into the existing `app_config.engine_overrides` JSONB so the calculator engine remains the single source of truth, and a Data Management surface (full JSON export, sessions-only CSV export, JSON import with forward-migration of older schema versions, selective and full reset behind double confirmation). The frontend gains one Settings page mounted at `/settings` with sub-routes for Profile, Schedule, Exercises, Preferences, and Data; UI work goes through the Frontend Design skill on top of the Phase 1 Tailwind tokens. Backend ships ~22 new or extended `/api/v1/` endpoints, 5 forward-only migrations, and a new `services/dataManagement/` boundary that is the only place that knows how to serialize, validate, migrate, and restore the athlete's portable data.

## Technical Context

**Language/Version**: Node.js 20+ (project runs on 22.17 in dev), JavaScript ES2022 ESM. React 18.3 for the frontend.

**Primary Dependencies** (all already installed in Phase 0/1 unless noted):
- Backend: `express`, `@supabase/supabase-js`, `pino`, `pino-http`, `dotenv`, `zod`, `uuid`, `cors`. **New runtime dependency**: `multer@^1.4` for the JSON-import upload endpoint (multipart-parsing only; bounded by a hard size limit declared in config). No other runtime additions — the export, the CSV serializer, and the forward-migrator chain are pure JavaScript.
- Frontend: `react`, `react-dom`, `vite`, `tailwindcss`, `react-router-dom@^6` (already added in Phase 1). **New dev dependency**: `@dnd-kit/core@^6` + `@dnd-kit/sortable@^8` for the weekly-plan and exercise-list reorder UX (drag handles must remain large enough for the Frontend Design skill's hit-target standard). No runtime backend impact.
- Tooling: `vitest` for unit + integration + contract suites, `@testing-library/react@^15` for the Settings smoke tests, `supertest` for contract.

**Storage**: Supabase PostgreSQL (cloud project, ref `anfrllxbetxpjkwqtkba`; local CLI stack remains as offline fallback). Phase 2 ships 5 new forward-only migrations: 1 new table (`muscle_groups`), 3 column additions on existing tables (`weekly_plan_slots.muscle_group_id`, `exercises.is_active`, `app_config.notification_acks`), 1 schema reshape that drops the now-obsolete `weekly_plan_slots.muscle_group` text column after backfill, and 1 column drop on `app_config.daily_kcal_override` (replaced by `engine_overrides.nutrition.*` JSONB keys per the clarification).

**Testing**: Vitest. Per Constitution Principle V, every pure function added in Phase 2 ships with unit tests written first (red → green → refactor). Specifically: backup envelope serializer / deserializer, CSV serializer, forward-migrator chain orchestrator, schedule-validation pure function, custom-nutrition override-merge pure function (the part that decides whether protein/carbs/fat auto-derive from a calorie-only override per FR-017a/b — this lives inside the engine boundary). Integration tests cover the persistence flows (profile save → audit row, schedule replace → soft-archive of stale state, exercise soft-delete preservation, override save → audit row per FR-003a, full export → full import round-trip, full reset → only profile remains, atomic-rollback on a deliberately corrupted import). Contract tests drive every new path in `contracts/openapi.yaml`. Frontend smoke tests cover each Settings sub-view.

**Target Platform**: Same as Phase 0/1 — local dev on macOS/Linux, future deploy to a hosted Node container behind a Vite-built static bundle. No new platform requirements.

**Project Type**: Web application — same layout as Phase 0/1 (`/routes`, `/controllers`, `/services`, `/middleware`, `/config`, `/frontend`). Phase 2 introduces one new top-level service sub-directory: `services/dataManagement/` (export, import, reset, csv, backup-migrators). All Supabase imports continue to be confined to `services/dataAccess/` per Constitution Principle II.

**Performance Goals** (from Success Criteria):
- SC-001: profile save → every dependent target visible on the next opened screen ≤ 2 s.
- SC-008: full JSON export of an athlete with ≥ 30 days of logged data ≤ 5 s click-to-file.
- New implicit: schedule replace round-trip (PUT → GET) ≤ 500 ms; exercise reorder save ≤ 300 ms.

**Constraints**:
- Determinism inside the engine remains absolute. The custom-nutrition override path (FR-017a/b) writes into `engine_overrides` and reads back through the existing `resolveConstants` helper; no new time-dependent code is added under `services/engine/`.
- Engine-version pinning continues. Every override save / clear emits exactly one audit row per FR-003a, and the row carries the engine version + the resolved-constants snapshot *after* applying the change (Constitution III + Phase 1 invariant).
- All new domain rows continue to carry `athlete_id` and ship RLS in the same migration (Constitution I).
- No `@supabase/supabase-js` import outside `services/dataAccess/*` (Constitution II).
- No backend code under `services/engine/` or `services/programGenerator.js` may import from `services/dataManagement/` — the dependency direction is one-way: `dataManagement → dataAccess + engine`.
- The legacy `daily_kcal_override` column on `app_config` is removed in this phase; the spec's contract says nutrition targets live in `engine_overrides`, and keeping a parallel column path would create two sources of truth (rejected in research, see Decision D-3).
- Imports must complete atomically. The implementation MUST run all writes inside a single transaction or, if Supabase's client cannot wrap multi-statement transactions cleanly, MUST stage to a temporary athlete-scoped buffer table and swap on success — see Decision D-4 in research.

**Scale/Scope**: 1 athlete in Phase 2, 1 new table (`muscle_groups`) + 4 column additions / drops, ~22 new HTTP endpoints, ~3,200 LOC backend (services + DAOs + controllers + routes + migrations + backup-migrators), ~1,800 LOC frontend (Settings page + 5 sub-views + drag-and-drop list + form primitives reuse), ~2,000 LOC tests.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Reviewed against `.specify/memory/constitution.md` v1.1.1:

- **I. Multi-Tenant-Ready Data Model (NON-NEGOTIABLE)** — **PASS**.
  - The new `muscle_groups` table carries `athlete_id NOT NULL` from migration day one and ships its `muscle_groups_select_own` + `muscle_groups_modify_own` policies in the same SQL file, indirected through `athletes.auth_user_id = auth.uid()` per the Phase 0 pattern.
  - Schema reshape: `weekly_plan_slots` gains a NOT NULL `muscle_group_id` FK after backfill. The existing RLS on `weekly_plan_slots` is preserved.
  - Column additions to `exercises` (`is_active`) and `app_config` (`notification_acks`) inherit the existing RLS on those tables — no policy change is needed because the predicates are unchanged.
  - The auth middleware from Phase 0 continues to gate every new request; every Settings endpoint is mounted under `/api/v1/` so the same `req.athleteId` resolution applies and every DAO call is parameterised by `req.athleteId` — no path under `services/dataManagement/` accepts an athlete-id from the request body.

- **II. Layered Architecture & Separation of Concerns** — **PASS**.
  - Routes stay thin shells (method + path + body parse + response envelope), controllers orchestrate, services hold logic, DAOs are the only Supabase-import boundary.
  - The new `services/dataManagement/` directory contains pure orchestrators (`exporter.js`, `importer.js`, `resetter.js`, `csvSerializer.js`) and a `backupMigrators/` sub-directory of pure one-step migrators. None of these files imports `@supabase/supabase-js`; they take DAO modules as injected dependencies (or are called by controllers that do the DAO orchestration).
  - The override-merge logic added to support FR-017a/b lives under `services/engine/` (specifically `services/engine/macros.js` is extended to accept a calorie-only override) — keeping all calculator-input math inside the engine. `services/dataManagement/` never re-implements macro rules.
  - Frontend never imports the secret-key client; it reaches every new endpoint exclusively through `/api/v1/`.

- **III. Configuration over Hardcoding (NON-NEGOTIABLE)** — **PASS**.
  - Backup envelope schema version, import size limit, CSV separator, and reset-confirmation token are added to `config/schema.js` with documented defaults; nothing is hardcoded in service modules.
  - `engine_overrides.nutrition.*` JSONB keys are documented in `services/engine/constants.js` as the canonical override path; the resolver applies them through the existing `resolveConstants` helper.
  - No new `.env` keys are introduced — the Phase 0 six-key set remains sufficient.
  - No athlete data lives in source.

- **IV. Versioned API Contract** — **PASS**. All new endpoints live under `/api/v1/` (see `contracts/openapi.yaml`). Response envelopes use the existing `{ data: ... }` shape and the canonical error envelope from Phase 0; new fields are additive within v1. Deletes return 204 with no body. The export envelope itself carries an internal `_export.schema_version` (the *backup* schema version, distinct from the API version) so the import path can detect old files — the API URL stays `/api/v1/data/export/json` regardless of backup-schema bumps.

- **V. Test-First for Domain Logic (NON-NEGOTIABLE)** — **PASS**. Phase 2's domain logic is tested before implementation. Specifically:
  - `services/engine/macros.js` — extended unit tests for the calorie-only override path (FR-017a) and per-macro override precedence (FR-017b).
  - `services/dataManagement/exporter.js` — unit tests assert the envelope shape, the inclusion of every athlete-owned collection, and the absence of cross-athlete or secret keys.
  - `services/dataManagement/csvSerializer.js` — unit tests cover the empty-history case (header-only file), special-character escaping, and round-trip determinism.
  - `services/dataManagement/importer.js` — unit tests cover schema-version validation (older-than-current → migrator chain, newer-than-current → reject, equal → straight-through), athlete-id ownership, and atomic rollback on a synthetic mid-write failure.
  - `services/dataManagement/backupMigrators/` — every committed migrator has a unit test with a representative old-schema input and the expected current-schema output.
  - `services/dataManagement/resetter.js` — unit tests cover each module's reset scope (sessions → only sessions; full → only profile remains; preferences → defaults restored; engine_overrides cleared).
  - `services/scheduleValidator.js` (new pure module) — unit tests cover the rule set in FR-008 (zero active days, duplicate muscle-group on same week, label length, day-of-week 1–7 range).
  - UI rendering of Settings sub-views is exempt from strict TDD per Principle V but ships smoke tests that assert each sub-view renders, the primary save action succeeds, and the unsaved-changes guard fires (Frontend Design skill output).

- **VI. Athlete-First UX** — **PASS**. Phase 2 ships one new surface:
  - `/settings` page with five sub-routes (`/settings/profile`, `/settings/schedule`, `/settings/exercises`, `/settings/preferences`, `/settings/data`). The Frontend Design skill is used for the visual treatment; Tailwind utilities only; tokens from `frontend/src/styles/tokens.css`.
  - Reorder UX uses `@dnd-kit/sortable` with drag handles sized for one-handed operation per the journal-flow standard (the same handles will be reused in Phase 4).
  - Destructive actions (reset, full import) are double-confirmed with a typed-token dialog per FR-029; the dialog component is built once in `frontend/src/components/ConfirmDialog.jsx` and reused across both the reset and the import-replace flows.
  - The Settings surface auto-saves on blur for low-risk fields (theme, sound, single-field profile edits) and uses an explicit Save button for multi-field forms (full schedule replace, full profile form). This is consistent with the Phase 4 journal auto-save discipline.

**Post-design re-check (after Phase 1 artifacts of this plan)**: still **PASS** —
- `data-model.md` enumerates the new `muscle_groups` table + the column changes on `weekly_plan_slots`, `exercises`, and `app_config`; every domain table carries `athlete_id` and ships RLS in the same migration.
- `contracts/openapi.yaml` keeps every new path under `/api/v1/` with the `{ data }` envelope; the error envelope from Phase 0 is reused unchanged.
- The proposed source layout keeps Supabase imports inside `services/dataAccess/*`; engine input math lives inside `services/engine/`; orchestration and serialization live in the new `services/dataManagement/` boundary; no `models/` directory is introduced.
- Performance budgets are within reach against the cloud Supabase project — the export path is at most ~12 indexed reads under 500 ms (Phase 1 measured ~50–170 ms per indexed select); the import path is one transaction batched per entity collection, comfortably under any reasonable budget.

No principle violations; no Complexity Tracking entries required.

## Project Structure

### Documentation (this feature)

```text
specs/003-phase2-settings-data/
├── plan.md              # This file (/speckit-plan output)
├── spec.md              # Feature specification (clarified 2026-05-08)
├── research.md          # Phase 0 of plan — decisions and rationale (5 D-numbered records)
├── data-model.md        # Phase 1 of plan — 1 new table + 4 column changes + JSONB shape
├── quickstart.md        # Phase 1 of plan — operator's guide to Settings + data flows
├── contracts/
│   └── openapi.yaml     # Phase 1 of plan — new /api/v1/* endpoints
├── checklists/
│   └── requirements.md  # From /speckit-specify (already passing)
└── tasks.md             # Created later by /speckit-tasks (NOT this command)
```

### Source Code (repository root)

Phase 2 extends the Phase 0/1 layout. **Bold** = new in Phase 2; everything else already exists.

```text
masslab/
├── routes/
│   ├── athlete.routes.js                # extended: PATCH /me broadens body, returns audit summary
│   ├── exercises.routes.js              # extended: POST/PATCH/DELETE; GET supports ?include_archived
│   ├── weeklyPlan.routes.js             # extended: PUT /me/schedule; reorder per slot
│   ├── trainingPhases.routes.js         # unchanged
│   ├── nutrition.routes.js              # extended: GET /me/nutrition-targets/effective
│   ├── supplements.routes.js            # unchanged
│   ├── foods.routes.js                  # unchanged
│   ├── quotes.routes.js                 # unchanged
│   ├── program.routes.js                # unchanged (Phase 1)
│   ├── calculators.routes.js            # unchanged (Phase 1)
│   ├── oneRepMaxRecords.routes.js       # unchanged (Phase 1)
│   ├── progressionFlags.routes.js       # unchanged (Phase 1)
│   ├── muscleGroups.routes.js           # NEW: GET, POST, PATCH, POST /:id/merge, DELETE
│   ├── preferences.routes.js            # NEW: GET /me/preferences, PATCH /me/preferences
│   ├── nutritionTargets.routes.js       # NEW: PUT /me/nutrition-targets, DELETE /me/nutrition-targets
│   └── dataManagement.routes.js         # NEW: POST /data/export/json, GET /data/export/sessions.csv,
│                                        #      POST /data/import, POST /data/reset
├── controllers/
│   ├── athlete.controller.js            # extended
│   ├── exercises.controller.js          # extended
│   ├── weeklyPlan.controller.js         # extended
│   ├── nutrition.controller.js          # extended
│   ├── ...                              # other controllers unchanged
│   ├── muscleGroups.controller.js       # NEW
│   ├── preferences.controller.js        # NEW
│   ├── nutritionTargets.controller.js   # NEW
│   └── dataManagement.controller.js     # NEW
├── services/
│   ├── programGenerator.js              # unchanged (still consumed by athlete controller via engine)
│   ├── progressionEngine.js             # unchanged
│   ├── scheduleValidator.js             # NEW: pure validation of a proposed weekly schedule
│   ├── engine/
│   │   ├── constants.js                 # extended: documents engine_overrides.nutrition.* keys
│   │   ├── macros.js                    # extended: calorie-only override path (FR-017a/b)
│   │   ├── resolveConstants.js          # unchanged (already deep-merges defaults ⊕ override)
│   │   └── ...                          # other engine files unchanged
│   ├── dataManagement/                  # NEW directory: orchestrators, all pure (no Supabase import)
│   │   ├── exporter.js                  # NEW: assemble backup envelope from injected DAO reads
│   │   ├── importer.js                  # NEW: validate, migrate, restore atomically
│   │   ├── resetter.js                  # NEW: per-module + full reset orchestration
│   │   ├── csvSerializer.js             # NEW: sessions-only CSV with header row
│   │   ├── backupSchema.js              # NEW: zod schema for the v1 backup envelope
│   │   └── backupMigrators/
│   │       └── README.md                # NEW: convention doc; first migrator added on next bump
│   ├── dataAccess/
│   │   ├── athletes.dao.js              # extended: full-profile update method
│   │   ├── exercises.dao.js             # extended: soft-delete, list with archived
│   │   ├── weeklyPlan.dao.js            # extended: replaceSchedule(athleteId, payload) atomic
│   │   ├── appConfig.dao.js             # extended: getPreferences, setPreferences, setNotificationAck
│   │   ├── muscleGroups.dao.js          # NEW: CRUD + merge + soft-archive
│   │   ├── exporters.dao.js             # NEW: read-only aggregator that fans out to the per-entity
│   │   │                                #      DAOs and returns the full athlete-scoped record set
│   │   ├── importers.dao.js             # NEW: write-side counterpart; one transactional swap
│   │   ├── reset.dao.js                 # NEW: per-module DELETE WHERE athlete_id = ?
│   │   └── ...                          # other DAOs unchanged
│   ├── photoStorage/                    # unchanged
│   └── logger.js                        # unchanged
├── middleware/                          # unchanged
├── config/
│   ├── schema.js                        # extended: BACKUP_SCHEMA_VERSION (default 1),
│   │                                    #   IMPORT_MAX_BYTES (default 25 * 1024 * 1024),
│   │                                    #   CSV_SEPARATOR (default ","),
│   │                                    #   RESET_CONFIRM_TOKEN (default "RESET-MASSLAB")
│   ├── dotenvAdapter.js                 # unchanged
│   └── index.js                         # unchanged
├── supabase/
│   ├── config.toml
│   ├── migrations/
│   │   ├── 20260428000001 … 20260507000008  (Phase 0 + Phase 1)
│   │   ├── 20260508000001_init_muscle_groups.sql                     # NEW
│   │   ├── 20260508000002_extend_weekly_plan_slots_muscle_group_fk.sql   # NEW (add nullable fk)
│   │   ├── 20260508000003_backfill_weekly_plan_slots_muscle_group_id.sql # NEW (data migration)
│   │   ├── 20260508000004_finalize_weekly_plan_slots_muscle_group_fk.sql # NEW (NOT NULL + drop text)
│   │   ├── 20260508000005_extend_exercises_is_active.sql             # NEW
│   │   ├── 20260508000006_extend_app_config_notification_acks.sql    # NEW
│   │   └── 20260508000007_drop_app_config_daily_kcal_override.sql    # NEW
│   └── seed.sql                         # unchanged (still empty)
├── seed/
│   ├── athlete.seed.js                  # extended: seeds initial muscle_groups + active flag on exercises
│   ├── ...                              # other seeds unchanged
│   └── runSeed.js                       # extended: writes initial muscle_groups catalogue + sets is_active=true
├── frontend/
│   ├── src/
│   │   ├── lib/
│   │   │   ├── api.js                   # extended: apiPatch, apiPut, apiDelete, apiUpload helpers
│   │   │   └── units.js                 # NEW: kg ↔ lbs conversion + display helper
│   │   ├── pages/
│   │   │   ├── ScaffoldHome.jsx         # unchanged
│   │   │   ├── NutritionHome.jsx        # extended: shows "custom" badge when an override is in force
│   │   │   ├── calculators/             # unchanged
│   │   │   └── settings/                # NEW: one component per Settings sub-view
│   │   │       ├── SettingsLayout.jsx
│   │   │       ├── ProfileSettings.jsx
│   │   │       ├── ScheduleSettings.jsx
│   │   │       ├── ExerciseManager.jsx
│   │   │       ├── PreferencesSettings.jsx
│   │   │       └── DataSettings.jsx
│   │   ├── components/
│   │   │   ├── NumberField.jsx          # unchanged
│   │   │   ├── SelectField.jsx          # unchanged
│   │   │   ├── ResultCard.jsx           # unchanged
│   │   │   ├── SortableList.jsx         # NEW: shared dnd-kit wrapper with large hit targets
│   │   │   └── ConfirmDialog.jsx        # NEW: typed-token destructive confirmation
│   │   ├── styles/tokens.css            # extended: Settings-specific token additions if needed
│   │   ├── App.jsx                      # extended: Router adds /settings/* routes
│   │   └── main.jsx                     # unchanged
│   ├── tailwind.config.js               # unchanged
│   ├── vite.config.js                   # unchanged
│   ├── vitest.config.js                 # unchanged
│   └── package.json                     # adds @dnd-kit/core + @dnd-kit/sortable
└── tests/
    ├── unit/
    │   ├── engine.macros.test.js                          # extended: calorie-only override, per-macro override
    │   ├── scheduleValidator.test.js                      # NEW (TDD red)
    │   ├── dataManagement.exporter.test.js                # NEW (TDD red)
    │   ├── dataManagement.csvSerializer.test.js           # NEW (TDD red)
    │   ├── dataManagement.importer.test.js                # NEW (TDD red)
    │   ├── dataManagement.resetter.test.js                # NEW (TDD red)
    │   └── dataManagement.backupSchema.test.js            # NEW
    ├── integration/
    │   ├── settings.profile.audit.test.js                 # NEW: profile save → exactly one audit row
    │   ├── settings.schedule.replace.test.js              # NEW: PUT /me/schedule atomic, RLS preserved
    │   ├── settings.muscleGroups.lifecycle.test.js        # NEW: create, rename, merge, soft-archive
    │   ├── settings.exercises.softDelete.test.js          # NEW: delete with refs → soft, no refs → hard
    │   ├── settings.preferences.persist.test.js           # NEW: theme/units/sound round-trip
    │   ├── settings.nutritionTargets.audit.test.js        # NEW: override save → exactly one audit row
    │   ├── data.export.fullJson.test.js                   # NEW: envelope shape + 30-day perf gate
    │   ├── data.export.csv.test.js                        # NEW: header-only and populated cases
    │   ├── data.import.roundTrip.test.js                  # NEW: export → modify → import → revert
    │   ├── data.import.versionMismatch.test.js            # NEW: older with migrator, older without, newer
    │   ├── data.import.atomicRollback.test.js             # NEW: forced mid-write failure leaves state
    │   └── data.reset.scopes.test.js                      # NEW: per-module + full reset
    ├── contract/
    │   └── api.v1.test.js                                 # extended: covers every new endpoint
    └── frontend/
        ├── settings.profile.test.jsx                      # NEW
        ├── settings.schedule.test.jsx                     # NEW
        ├── settings.exercises.test.jsx                    # NEW
        ├── settings.preferences.test.jsx                  # NEW
        └── settings.data.test.jsx                         # NEW
```

**Structure Decision**: Phase 2 grows the existing layout rather than introducing new top-level directories. Three intentional additions:

1. `services/dataManagement/` is a new sub-directory because Phase 2 introduces five distinct orchestration files (exporter, importer, resetter, csvSerializer, backupSchema) plus a `backupMigrators/` chain that is expected to grow with each future schema bump. Bundling them under one boundary makes the dependency direction visually obvious in code review (`dataManagement → dataAccess + engine`, never the reverse).
2. `frontend/src/pages/settings/` is a sub-directory because the Settings surface is one logical page with five sub-views routed by `react-router-dom`, mirroring Phase 1's `frontend/src/pages/calculators/` layout.
3. The `backfill` migration (`20260508000003`) is a pure-SQL data migration — no application code path runs it. It inserts a catalogue row per `(athlete_id, distinct muscle_group)` from the existing `weekly_plan_slots`, then updates each slot's `muscle_group_id`. The split into add-fk → backfill → finalize keeps each migration small and forward-only per Constitution Operational Standards.

Migrations are timestamped `20260508000001`–`20260508000007` so they sort lexically after every Phase 1 file (`20260507…`). The split into 7 files (rather than 1) keeps each step replayable from an empty Supabase project; the backfill migration is a no-op on a fresh project because there are no rows to migrate.

## Complexity Tracking

> Constitution Check is clean; this section is intentionally empty.
