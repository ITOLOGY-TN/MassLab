---

description: "Phase 2 — Settings & Data Management implementation tasks"
---

# Tasks: Phase 2 — Settings & Data Management

**Input**: Design documents from `/specs/003-phase2-settings-data/`
**Prerequisites**: `plan.md` ✅, `spec.md` ✅, `research.md` ✅, `data-model.md` ✅, `contracts/openapi.yaml` ✅, `quickstart.md` ✅

**Tests**: TDD test tasks are **required by Constitution Principle V** for the engine extension (`services/engine/macros.js`), the new pure modules under `services/dataManagement/` and `services/scheduleValidator.js`, and any function that produces a number stored on the athlete profile or surfaced as a recommendation. Contract tests cover every `/api/v1/*` path in `contracts/openapi.yaml`. Frontend smoke tests cover each Settings sub-view.

**Organization**: Tasks are grouped by user story (US1…US7) so each story is independently implementable, testable, and demoable. Setup and Foundational phases are required prerequisites; Polish wraps cross-cutting work after the desired stories ship.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks).
- **[Story]**: User story label (US1…US7), required for Phase 3+ tasks; absent in Setup, Foundational, and Polish.
- Every task names the **exact file path** so an LLM (or a teammate) can pick it up cold.

## Path Conventions

Phase 2 follows the Phase 0/1 web-app layout: backend at repository root (`routes/`, `controllers/`, `services/`, `services/dataAccess/`, `services/engine/`, `services/dataManagement/`, `middleware/`, `config/`, `supabase/migrations/`, `seed/`), frontend under `frontend/src/`, tests under `tests/{unit,integration,contract,frontend}/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Install new dependencies and wire the config knobs Phase 2 introduces. Nothing in this phase touches a story-specific code path.

- [X] T001 Install `multer@^1.4` at the repo root (`npm install multer`) — only used by `routes/dataManagement.routes.js` for the import upload; configured to memory storage in T013.
- [X] T002 Install `@dnd-kit/core@^6` and `@dnd-kit/sortable@^8` in the frontend workspace (`npm --prefix frontend install @dnd-kit/core @dnd-kit/sortable`). Used by both the schedule reorder (US2) and the exercise reorder (US3).
- [X] T003 [P] Extend `config/schema.js` with the four new keys: `BACKUP_SCHEMA_VERSION` (int, default `1`), `IMPORT_MAX_BYTES` (int, default `26214400`), `CSV_SEPARATOR` (string, default `","`), `RESET_CONFIRM_TOKEN` (string, default `"RESET-MASSLAB"`). Add each to the existing zod schema; none of them are secrets so they are not added to the `SECRET_KEYS` redactor list.
- [X] T004 [P] Update `.env.example` with the four new keys (without real values) so local devs see them on first checkout. No code change needed beyond the file.

**Checkpoint**: dependencies installed, config keys readable via `loadConfig()`. Foundational phase can begin.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Cross-story scaffolding that every user story depends on — the Settings router shell, shared frontend components used by multiple stories (ConfirmDialog, SortableList), the kg ↔ lbs unit helper, and the new shared API helpers. **No** story-specific migration runs here; each migration belongs to its consuming story.

**⚠️ CRITICAL**: No user story implementation may begin until this phase is complete.

- [X] T005 Add the `/settings`, `/settings/profile`, `/settings/schedule`, `/settings/exercises`, `/settings/preferences`, `/settings/data` routes to `frontend/src/App.jsx`. Each route renders a placeholder component for now; the real sub-views land in their respective story phases.
- [X] T006 [P] Create `frontend/src/pages/settings/SettingsLayout.jsx` — the shared layout for all five sub-routes (sidebar nav + outlet). Apply Frontend Design skill output; Tailwind utilities only; tokens from `frontend/src/styles/tokens.css`. Hit targets sized for one-handed use per Constitution VI.
- [X] T007 [P] Extend `frontend/src/lib/api.js` with `apiPatch`, `apiPut`, `apiDelete`, and `apiUpload` (multipart) helpers. Match the shape of the existing `apiPost`. No new dependency.
- [X] T008 [P] Create `frontend/src/lib/units.js` — pure helpers: `kgToLbs(kg)`, `lbsToKg(lbs)`, `formatWeight(value, unit)`. Round-trip drift bounded to ±0.05 kg per Phase 2 SC-006. Unit tests live in T053.
- [X] T009 [P] Create `frontend/src/components/ConfirmDialog.jsx` — typed-token destructive confirmation dialog. Reused by US6 (import replace) and US7 (reset). Token is read from a prop; the prop value comes from a runtime-config endpoint or is hardcoded to `RESET-MASSLAB` in dev (server-side check is the source of truth — FE check is UX only).
- [X] T010 [P] Create `frontend/src/components/SortableList.jsx` — `@dnd-kit/sortable` wrapper exposing a render-prop API (`<SortableList items={...} onReorder={(orderedIds) => ...} />`). Drag handles ≥ 44 px. Reused by US2 (schedule slots, weekly_plan_exercises) and US3 (exercise manager re-attach order).

**Checkpoint**: shared scaffolding ready. User stories may now proceed in parallel.

---

## Phase 3: User Story 1 — Edit athlete profile and have the program react (Priority: P1) 🎯 MVP

**Goal**: The athlete can save profile changes from `/settings/profile`; calculator-input changes trigger an engine recompute through the existing `services/programGenerator.js` pipeline and append exactly one row to `calculation_results`.

**Independent Test**: From `/settings/profile`, change `current_weight_kg` from 58 → 59 and save. Confirm: (a) the new value persists across reload; (b) BMR / TDEE / macro targets visible at `/nutrition` reflect the change; (c) `select reason from calculation_results order by id desc limit 1;` returns `'profile_save'` carrying the active engine version.

### Tests for User Story 1 (TDD — Constitution V) ⚠️

> Write these tests FIRST, ensure they FAIL before implementation.

- [X] T011 [P] [US1] Contract test for `GET /api/v1/me` and `PATCH /api/v1/me` in `tests/contract/api.v1.test.js` — assert response envelopes match `contracts/openapi.yaml` (AthleteProfile, AthleteProfilePatch, recompute summary).
- [X] T012 [P] [US1] Integration test in `tests/integration/settings.profile.audit.test.js` — `PATCH /api/v1/me { current_weight_kg: 59 }` produces exactly one new row in `calculation_results` carrying the engine version, and the row's `resolved_constants` matches `resolveConstants(athleteOverride)` post-save.
- [X] T013 [P] [US1] Integration test in `tests/integration/settings.profile.validation.test.js` — invalid bodies (age 200, weight −1, target_weight 200kg above current, start_date 5 years out) all return 400 `VALIDATION_FAILED` and persist nothing.

### Implementation for User Story 1

- [X] T014 [P] [US1] Extend `services/dataAccess/athletes.dao.js` with `updateProfile(athleteId, patch)` — returns the updated row. Single Supabase `update().eq('id', athleteId).select().single()`. Validation lives upstream.
- [X] T015 [P] [US1] Extend `controllers/athlete.controller.js` with the broadened `PATCH /me` handler. Steps in order: (a) zod-validate body against the AthleteProfilePatch schema (declared inline in the controller using zod); (b) call `athletes.dao.updateProfile`; (c) if any *calculator-input* field changed (height/weight/age/sex/morphotype/activity_level/sessions_per_week), call `programGenerator.regenerateForAthlete(athleteId, { reason: 'profile_save' })` which writes one audit row; (d) return `{ profile, recompute: { calculation_audit_id, engine_version } }`.
- [X] T016 [US1] Wire `PATCH /me` in `routes/athlete.routes.js` to the new controller method. Confirm the existing `GET /me` is unchanged.
- [X] T017 [US1] Confirm `services/programGenerator.js` already exposes a regeneration entry that writes through `services/engine/auditWriter.js`. If it doesn't accept a `reason` tag, extend the signature minimally (additive, no breaking change to Phase 1 callers).
- [X] T018 [US1] Build `frontend/src/pages/settings/ProfileSettings.jsx` — controlled form bound to `GET /api/v1/me`, dirty-state guard, on-blur per-field validation matching the backend rules in `data-model.md`. Save button calls `apiPatch('/me', body)` and shows the recompute summary on success.
- [X] T019 [P] [US1] Frontend smoke test in `tests/frontend/settings.profile.test.jsx` — renders the form, submits a valid change, asserts the recompute summary appears, asserts the unsaved-changes guard fires when navigating away mid-edit.

**Checkpoint**: US1 fully functional. Profile edits flow through the engine and produce an audit row. **MVP is shippable here.**

---

## Phase 4: User Story 2 — Configure weekly schedule (Priority: P1)

**Goal**: The athlete can edit the weekly schedule from `/settings/schedule`. Day count, day-to-muscle-group mapping, and exercise order within each day are all editable. The new `muscle_groups` per-athlete catalogue replaces the free-text column.

**Independent Test**: Switch from 5 days to 4 days, drop one calendar day, reassign one muscle group, save. Confirm: (a) `GET /me/schedule` reflects the new shape; (b) the dashboard's today's-session card and the streak counter use the new mapping on the next render; (c) historical sessions logged before the change retain their original `muscle_group_id`.

### Migrations (run in order; foundational for US2 only)

- [X] T020 [US2] Author `supabase/migrations/20260508000001_init_muscle_groups.sql` — creates the `muscle_groups` table per `data-model.md`, including the `unique (athlete_id, slug)` constraint, the two CHECK constraints (name length, hex color), the two indexes, and the `_select_own` + `_modify_own` RLS policies.
- [X] T021 [US2] Author `supabase/migrations/20260508000002_extend_weekly_plan_slots_muscle_group_fk.sql` — adds nullable `muscle_group_id BIGINT` FK on `weekly_plan_slots` plus the index.
- [X] T022 [US2] Author `supabase/migrations/20260508000003_backfill_weekly_plan_slots_muscle_group_id.sql` — pure SQL data migration per `data-model.md` (insert distinct catalogue rows per `(athlete_id, muscle_group)`, then update each slot). Idempotent and a no-op on a fresh DB.
- [X] T023 [US2] Author `supabase/migrations/20260508000004_finalize_weekly_plan_slots_muscle_group_fk.sql` — `alter ... set not null` on `muscle_group_id` and `drop column muscle_group`.
- [X] T024 [US2] Extend `seed/runSeed.js` to insert the seeded muscle-group catalogue on first run (Chest+Triceps, Back+Biceps, Legs-Quads, Shoulders+Traps, Legs-Hams+Glutes) with the Phase 0 palette colors. Idempotent (`on conflict do nothing` on `(athlete_id, slug)`).

### Tests for User Story 2 (TDD)

- [X] T025 [P] [US2] Unit tests in `tests/unit/scheduleValidator.test.js` covering FR-008: zero active days rejects, duplicate `muscle_group_id` in same week rejects, name length > 40 rejects, day_of_week out of [1,7] rejects, valid inputs pass through. Tests fail until T030 lands.
- [X] T026 [P] [US2] Contract tests in `tests/contract/api.v1.test.js` for the new paths: `GET/PUT /me/schedule`, `POST /me/schedule/slots/:id/exercises/reorder`, `GET/POST/PATCH/DELETE /muscle-groups`, `POST /muscle-groups/:id/merge`.
- [X] T027 [P] [US2] Integration test `tests/integration/settings.schedule.replace.test.js` — full PUT replaces atomically (failure mid-write leaves prior schedule intact), `unique (athlete_id, day_of_week)` enforced, in-progress-session conflict returns 409 unless `?force=1`.
- [X] T028 [P] [US2] Integration test `tests/integration/settings.muscleGroups.lifecycle.test.js` — create → rename (slot rows unchanged) → merge into another (slot rows repointed, source archived) → soft-archive when referenced → hard-delete when not referenced.
- [X] T029 [P] [US2] Integration test `tests/integration/settings.muscleGroups.rls.test.js` — using a per-test JWT against the publishable-key client per the existing pattern in Phase 0's `rls.policies.test.js`, confirm cross-athlete reads/writes are blocked.

### Implementation for User Story 2

- [X] T030 [P] [US2] Create `services/scheduleValidator.js` — pure module exporting `validateSchedule(payload)` returning `{ ok: true } | { ok: false, errors: [...] }`. No I/O. Used by both backend and frontend (the frontend imports from a shared spot — Phase 2 keeps the duplication minimal by re-exporting from `frontend/src/lib/`; alternative: dynamic import. Pick the lighter path during implementation.).
- [X] T031 [P] [US2] Create `services/dataAccess/muscleGroups.dao.js` — methods: `listForAthlete(athleteId, { includeArchived })`, `create`, `patch`, `softArchive`, `hardDelete`, `merge(sourceId, targetId, athleteId)` (single Supabase RPC or transaction repointing slot references then archiving the source).
- [X] T032 [US2] Create `controllers/muscleGroups.controller.js` — orchestrates the DAO; enforces ownership scope from `req.athleteId`; rejects merges when source and target are the same.
- [X] T033 [US2] Create `routes/muscleGroups.routes.js` — mount the five paths from the OpenAPI under `/api/v1/muscle-groups/*`. Register in `app.js`.
- [X] T034 [US2] Extend `services/dataAccess/weeklyPlan.dao.js` with `replaceSchedule(athleteId, payload)` — runs inside a single Supabase transaction (or staged buffer + swap if necessary): clear existing slots + exercises for the athlete, insert the new payload, return the resolved schedule. Validate via `scheduleValidator.validateSchedule` before any write.
- [X] T035 [US2] Extend `controllers/weeklyPlan.controller.js` with the `getSchedule` and `replaceSchedule` handlers. The replace handler checks for an in-progress session on a deactivated day and returns 409 unless `req.query.force === '1'`.
- [X] T036 [US2] Extend `routes/weeklyPlan.routes.js` to expose `GET /me/schedule`, `PUT /me/schedule`, and `POST /me/schedule/slots/:slotId/exercises/reorder`.
- [X] T037 [US2] Add the reorder DAO method to `weeklyPlan.dao.js` — `reorderSlotExercises(slotId, athleteId, orderedExerciseIds)` updating `position` in one transaction.
- [X] T038 [US2] Build `frontend/src/pages/settings/ScheduleSettings.jsx` — drag-and-drop day cards using `SortableList`, muscle-group picker pulling from `/muscle-groups`, inline catalogue editor (rename / merge / archive). Save button calls `apiPut('/me/schedule', body)`; conflict 409 surfaces a confirmation dialog.
- [X] T039 [P] [US2] Frontend smoke test `tests/frontend/settings.schedule.test.jsx` — renders the screen, dispatches a reorder, hits Save, asserts the optimistic UI matches the GET response after success.

**Checkpoint**: US2 fully functional. Schedule edits propagate through the system without rewriting historical session attribution.

---

## Phase 5: User Story 3 — Manage exercise library and reorder weekly plan (Priority: P2)

**Goal**: Athletes can add, edit, soft-delete exercises from `/settings/exercises` and reorder exercises within any active training day.

**Independent Test**: Add a new exercise, attach it to an active day, reorder it to position 1, edit its instructions, then delete it. Confirm: (a) the day-detail screen reflects every change; (b) deleting an exercise referenced by historical sessions soft-deletes (`is_active=false`); (c) deleting an unreferenced exercise hard-deletes.

### Migration

- [ ] T040 [US3] Author `supabase/migrations/20260508000005_extend_exercises_is_active.sql` — adds `is_active boolean not null default true` and the partial index per `data-model.md`.

### Tests for User Story 3 (TDD)

- [ ] T041 [P] [US3] Contract tests in `tests/contract/api.v1.test.js` for `GET /exercises?include_archived=`, `POST /exercises`, `PATCH /exercises/:id`, `DELETE /exercises/:id`.
- [ ] T042 [P] [US3] Integration test `tests/integration/settings.exercises.softDelete.test.js` — delete with historical session refs → row remains with `is_active=false`; delete without refs → row removed; archived rows hidden by default `GET`, returned with `?include_archived=1`.

### Implementation for User Story 3

- [ ] T043 [P] [US3] Extend `services/dataAccess/exercises.dao.js` with `create`, `patch`, `softDelete`, `hardDeleteIfUnreferenced` and update `list` to filter `is_active=true` by default.
- [ ] T044 [US3] Extend `controllers/exercises.controller.js` with handlers for the four new operations. The DELETE handler decides between soft and hard based on a `countReferences` DAO call.
- [ ] T045 [US3] Extend `routes/exercises.routes.js` with the four paths.
- [ ] T046 [US3] Build `frontend/src/pages/settings/ExerciseManager.jsx` — table view of active exercises, "Show archived" toggle, create modal, edit modal, delete confirmation that surfaces "this will be soft-deleted because N historical sessions reference it" when `references > 0`.
- [ ] T047 [P] [US3] Frontend smoke test `tests/frontend/settings.exercises.test.jsx` — create / edit / delete happy path.

**Checkpoint**: US3 fully functional. Exercise library is editable; history is preserved.

---

## Phase 6: User Story 4 — App preferences + custom nutrition targets (Priority: P2)

**Goal**: From `/settings/preferences`, the athlete toggles theme / units / sounds and sets per-macro nutrition overrides. Custom calorie target re-runs macros (FR-017a); per-macro overrides take precedence (FR-017b). Every override save/clear writes one audit row (FR-003a).

**Independent Test**: Toggle dark/light, switch kg→lbs (round-trip a logged weight, no >0.1 kg drift), set custom calorie target to 3500 (macros auto-derive), set explicit protein override (it pins, others stay auto-derived), clear all overrides (engine values return). Each override save produces exactly one new `calculation_results` row.

### Migrations

- [ ] T048 [US4] Author `supabase/migrations/20260508000006_extend_app_config_notification_acks.sql` — adds `notification_acks jsonb not null default '{}'::jsonb`.
- [ ] T049 [US4] Author `supabase/migrations/20260508000007_drop_app_config_daily_kcal_override.sql` — drops the column per Decision D-3.

### Tests for User Story 4 (TDD — Constitution V)

> Engine-extension tests are RED-then-GREEN per Principle V; write before implementation.

- [ ] T050 [P] [US4] Extend `tests/unit/engine.macros.test.js` with the calorie-only override path (FR-017a): given a calorie override, macros recompute on the new total using existing rules; given an explicit per-macro override (FR-017b), that macro pins while siblings auto-derive; clearing returns engine values.
- [ ] T051 [P] [US4] Contract tests in `tests/contract/api.v1.test.js` for `GET/PATCH /me/preferences`, `GET/PUT/DELETE /me/nutrition-targets`.
- [ ] T052 [P] [US4] Integration test `tests/integration/settings.preferences.persist.test.js` — round-trip theme / units / sound; deep-merge of `notification_acks` (PATCH with one key updates only that key; null clears it).
- [ ] T053 [P] [US4] Integration test `tests/integration/settings.nutritionTargets.audit.test.js` — every PUT and DELETE produces exactly one `calculation_results` row carrying `reason ∈ {override_set, override_cleared}` and the engine version. Idempotent re-saves still emit a row each (FR-003a).
- [ ] T054 [P] [US4] Unit tests for `frontend/src/lib/units.js` in `tests/unit/lib.units.test.js` — round-trip kg ↔ lbs ↔ kg drift ≤ 0.05 kg across the plausible range (30–250 kg).

### Implementation for User Story 4

- [ ] T055 [P] [US4] Extend `services/engine/macros.js` to accept an optional `override` argument carrying any subset of `{ daily_kcal, daily_protein_g, daily_carbs_g, daily_fat_g }`. Apply the FR-017a/b rules. Pure function; no I/O.
- [ ] T056 [P] [US4] Extend `services/engine/constants.js` to document the JSONB shape under `engine_overrides.nutrition.*` (comment block + a frozen example payload), so downstream readers see the contract.
- [ ] T057 [P] [US4] Extend `services/dataAccess/appConfig.dao.js` with `getPreferences(athleteId)`, `setPreferences(athleteId, patch)` (deep-merge `notification_acks`), `setNutritionOverride(athleteId, partial)`, `clearAllNutritionOverrides(athleteId)`. Each override mutation returns the post-write `engine_overrides` JSONB so the controller can call the audit writer with the resolved snapshot.
- [ ] T058 [US4] Create `controllers/preferences.controller.js` — GET returns `Preferences`; PATCH validates body via zod, writes via DAO, returns the new state.
- [ ] T059 [US4] Create `controllers/nutritionTargets.controller.js` — GET resolves and returns effective targets with `source` map; PUT writes the partial override, calls `services/engine/auditWriter.js` with `reason: 'override_set'` and the resolved snapshot, returns `{ targets, calculation_audit_id, reason }`; DELETE clears all four and writes one audit row with `reason: 'override_cleared'`.
- [ ] T060 [US4] Create `routes/preferences.routes.js` and `routes/nutritionTargets.routes.js`; register in `app.js`.
- [ ] T061 [US4] Extend `controllers/nutrition.controller.js` (or create a small helper module) so the existing Phase 1 nutrition surface reads through the resolver and surfaces a "custom" badge when any override is in force. Touch `frontend/src/pages/NutritionHome.jsx` to display the badge.
- [ ] T062 [US4] Build `frontend/src/pages/settings/PreferencesSettings.jsx` — theme/units/sound controls (auto-save on change), custom-nutrition section with four numeric fields each independently clearable, a "Recommendation changed" non-blocking notice when the engine value would have shifted (drives `notification_acks.nutrition_recommendation_changed`).
- [ ] T063 [P] [US4] Frontend smoke test `tests/frontend/settings.preferences.test.jsx` — toggle theme persists across reload (mock GET), unit switch updates a displayed weight, custom calorie save triggers a re-fetch of the effective targets.

**Checkpoint**: US4 fully functional. Preferences and overrides ride the engine pipeline correctly.

---

## Phase 7: User Story 5 — Export athlete data (Priority: P3)

**Goal**: From `/settings/data`, the athlete downloads a full JSON backup or a sessions-only CSV. JSON envelope passes structural validation against the v1 schema and includes engine version + timestamp + athlete id.

**Independent Test**: Trigger JSON export, confirm `_export.schema_version === 1`, every entity collection present (some empty arrays acceptable), no secrets in the payload. Trigger CSV export with zero sessions → header-only file. With ≥30 days of data, full JSON export click-to-file ≤ 5 s (SC-008).

### Tests for User Story 5 (TDD)

- [ ] T064 [P] [US5] Unit tests in `tests/unit/dataManagement.exporter.test.js` — envelope shape, every athlete-owned collection present, no cross-athlete rows leak, no secret-tagged keys appear, idempotent for the same input.
- [ ] T065 [P] [US5] Unit tests in `tests/unit/dataManagement.csvSerializer.test.js` — header row always emitted; quoting per RFC 4180 (commas, quotes, newlines); UTF-8, `\n` line endings; empty-history case yields header-only.
- [ ] T066 [P] [US5] Unit tests in `tests/unit/dataManagement.backupSchema.test.js` — zod schema accepts a known-good envelope and rejects shapes missing `_export.schema_version`, `_export.athlete_id`, or any required collection.
- [ ] T067 [P] [US5] Contract tests in `tests/contract/api.v1.test.js` for `POST /data/export/json` and `GET /data/export/sessions.csv`.
- [ ] T068 [P] [US5] Integration test `tests/integration/data.export.fullJson.test.js` — exports a seeded athlete, asserts the envelope, asserts the timing budget on a 30-day fixture (SC-008).
- [ ] T069 [P] [US5] Integration test `tests/integration/data.export.csv.test.js` — header-only and populated cases.

### Implementation for User Story 5

- [ ] T070 [P] [US5] Create `services/dataManagement/backupSchema.js` — zod schema for the v1 envelope per `contracts/openapi.yaml#/components/schemas/BackupEnvelope`. Exports `BACKUP_SCHEMA_V1` and a `validateEnvelope(input)` helper.
- [ ] T071 [P] [US5] Create `services/dataAccess/exporters.dao.js` — read-only aggregator. Single method `readAllForAthlete(athleteId)` that fans out to every per-entity DAO and returns the assembled record set keyed by collection. Confined to data-access layer per Constitution II.
- [ ] T072 [P] [US5] Create `services/dataManagement/exporter.js` — pure function `buildEnvelope(records, { engineVersion, athleteId, exportedAt })` that returns the v1 envelope. No I/O. No Supabase imports.
- [ ] T073 [P] [US5] Create `services/dataManagement/csvSerializer.js` — pure function `serializeSessionsCsv(sessions, { separator })` returning a UTF-8 string. RFC 4180 quoting.
- [ ] T074 [US5] Create `controllers/dataManagement.controller.js` — `exportJson` handler orchestrates `exporters.dao.readAllForAthlete` → `exporter.buildEnvelope` → return; `exportCsv` handler reads sessions through the existing DAO → `csvSerializer.serializeSessionsCsv` → return with `Content-Type: text/csv`.
- [ ] T075 [US5] Create `routes/dataManagement.routes.js` — register `POST /data/export/json` and `GET /data/export/sessions.csv`. Mount in `app.js`.
- [ ] T076 [US5] Add the Export panel to `frontend/src/pages/settings/DataSettings.jsx` — two buttons that fetch via the new helpers and trigger a `Blob` download with a sensible filename (`masslab-backup-<date>.json` / `masslab-sessions-<date>.csv`).

**Checkpoint**: US5 fully functional. Backups can be produced.

---

## Phase 8: User Story 6 — Restore from JSON backup (Priority: P3)

**Goal**: The athlete uploads a previously exported JSON backup. Validation rejects size > limit, ownership mismatch, and newer-than-current schema. Older backups are forward-migrated through the registered chain. Successful imports atomically replace state; failures leave state intact.

**Independent Test**: Export → modify a single profile field → import the export → confirm the field reverts. Forced mid-write failure leaves the pre-import state byte-identical (verifiable by row-set hash).

### Tests for User Story 6 (TDD)

- [ ] T077 [P] [US6] Unit tests in `tests/unit/dataManagement.importer.test.js` — schema-newer rejects, missing-migrator rejects, ownership-mismatch rejects, oversize rejects, equal-version straight-through, older-version walks the chain. Each case asserts no DAO writes were issued (using a fake DAO).
- [ ] T078 [P] [US6] Contract test in `tests/contract/api.v1.test.js` for `POST /data/import` covering the response schemas and every documented error code.
- [ ] T079 [P] [US6] Integration test `tests/integration/data.import.roundTrip.test.js` — full export → mutate profile → import → field reverts byte-identical.
- [ ] T080 [P] [US6] Integration test `tests/integration/data.import.versionMismatch.test.js` — newer-than-current → 400 `IMPORT_VERSION_TOO_NEW`; older-with-missing-migrator → 400 `IMPORT_MISSING_MIGRATOR`; older-with-migrator (synthetic v0→v1 migrator added in this test only) → 200 with `schema_version_original=0, schema_version_applied=1`.
- [ ] T081 [P] [US6] Integration test `tests/integration/data.import.atomicRollback.test.js` — using a deliberately corrupted record in the middle of one collection, assert the import returns 500, and the athlete's row-set hash is identical pre/post (per SC-010).

### Implementation for User Story 6

- [ ] T082 [P] [US6] Create `services/dataManagement/backupMigrators/README.md` — documents the convention: one file per `vN-to-vN+1` migrator, pure function `(oldEnvelope) => newEnvelope`, registered in a manifest.
- [ ] T083 [P] [US6] Create `services/dataManagement/backupMigrators/index.js` — manifest mapping `(from, to) → migratorFn`. Empty for Phase 2 (current schema is v1; no older versions exist yet) but exposes `migrateChain(envelope, { from, to })` that walks the chain and throws `MissingMigratorError` when a step is absent.
- [ ] T084 [P] [US6] Create `services/dataAccess/importers.dao.js` — single method `replaceAllForAthlete(athleteId, records)` that wraps DELETE+INSERT for every athlete-scoped collection in one transaction. Returns a count map. Confined to data-access per Constitution II.
- [ ] T085 [US6] Create `services/dataManagement/importer.js` — pure orchestrator `importBackup(buffer, { athleteId, sourceFilename, importMaxBytes, currentSchemaVersion, importersDao, migrators, schema })`. Steps: size check → JSON parse → envelope structural validation (zod) → ownership check → version compare → migrate chain (if older) → re-validate after migration → call `importersDao.replaceAllForAthlete` → return `ImportResult`. Throws typed errors that map 1:1 to the OpenAPI error codes.
- [ ] T086 [US6] Extend `controllers/dataManagement.controller.js` with the `importJson` handler — `multer.single('file')` middleware in memory mode bounded by `IMPORT_MAX_BYTES`, then call the orchestrator, then map typed errors to HTTP responses.
- [ ] T087 [US6] Register `POST /data/import` in `routes/dataManagement.routes.js` with the multer middleware attached.
- [ ] T088 [US6] Add the Import panel to `frontend/src/pages/settings/DataSettings.jsx` — file picker, parse-and-preview step (just shows envelope summary: schema_version, exported_at, counts per collection), `ConfirmDialog` typed-token confirmation before triggering the upload, error mapping for every documented code.

**Checkpoint**: US6 fully functional. Backups can be restored safely.

---

## Phase 9: User Story 7 — Reset module data with safeguards (Priority: P3)

**Goal**: From `/settings/data`, the athlete resets a single module or performs a full reset. Both flows require a typed-token second confirmation; full reset offers an export-first option.

**Independent Test**: Reset sessions only — sessions table empty, every other module untouched. Full reset — only the profile row remains; preferences and `engine_overrides` reset to defaults.

### Tests for User Story 7 (TDD)

- [ ] T089 [P] [US7] Unit tests in `tests/unit/dataManagement.resetter.test.js` — per-module scope (sessions deletes only sessions, etc.), full reset preserves the profile row and resets preferences + engine_overrides to documented defaults, idempotent on a no-op (already empty) state.
- [ ] T090 [P] [US7] Contract test in `tests/contract/api.v1.test.js` for `POST /data/reset` covering valid and `RESET_TOKEN_MISMATCH` responses.
- [ ] T091 [P] [US7] Integration test `tests/integration/data.reset.scopes.test.js` — eight scenarios, one per `module` enum value plus the `all` case; assert the deleted-counts map matches reality and unaffected modules are untouched.

### Implementation for User Story 7

- [ ] T092 [P] [US7] Create `services/dataAccess/reset.dao.js` — methods: `deleteSessions(athleteId)`, `deleteBodyMeasurements(athleteId)`, ... one per module, plus `deleteAllExceptProfile(athleteId)` and `resetPreferencesAndOverrides(athleteId)`. Each returns a `{ count }` summary.
- [ ] T093 [P] [US7] Create `services/dataManagement/resetter.js` — pure orchestrator `resetModule(athleteId, { module, exportFirst, exporter, importerOptional }, deps)` returning `ResetResult`. The `exportFirst` path calls the exporter, persists the file (or returns it inline; backend returns a one-time URL), then proceeds; if export fails the destructive step is blocked.
- [ ] T094 [US7] Extend `controllers/dataManagement.controller.js` with the `reset` handler — server-side check `req.body.confirm_token === config.RESET_CONFIRM_TOKEN`, otherwise 400 `RESET_TOKEN_MISMATCH`; then call the orchestrator.
- [ ] T095 [US7] Register `POST /data/reset` in `routes/dataManagement.routes.js`.
- [ ] T096 [US7] Add the Reset panel to `frontend/src/pages/settings/DataSettings.jsx` — module picker, "Export first" checkbox for the full-reset case, two confirmation steps (initial confirm + typed-token via `ConfirmDialog`).
- [ ] T097 [P] [US7] Frontend smoke test `tests/frontend/settings.data.test.jsx` — confirms the typed-token gate (closing dialog cancels; wrong token blocks the network call), asserts the Export panel and Import panel from US5/US6 still render alongside.

**Checkpoint**: US7 fully functional. Reset is safe and complete. **All seven user stories now usable independently.**

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Cross-story polish that only makes sense once all the surfaces ship.

- [ ] T098 [P] Run the full quickstart walkthrough in `specs/003-phase2-settings-data/quickstart.md` end-to-end against the dev stack and capture any drift between docs and reality. Update the docs only — no code change here.
- [ ] T099 [P] Run `npm run lint && npm run format` and resolve any new findings introduced by Phase 2 files.
- [ ] T100 [P] Audit Phase 2 source for `console.log` (Constitution Operational Standards) and replace with the existing pino logger pattern if any slipped in.
- [ ] T101 [P] Cross-check that no file under `services/dataManagement/` or `services/engine/` imports `@supabase/supabase-js` (Constitution II).
- [ ] T102 [P] Cross-check that every new domain table (the single addition `muscle_groups`) ships RLS in the same migration (Constitution I + Operational Standards).
- [ ] T103 [P] Capture a Phase-2 compliance entry in the team's running compliance log (the constitution requires one per implementation phase milestone).
- [ ] T104 Verify all 12 Success Criteria from `spec.md` (SC-001 … SC-012) by mapping each to the integration test that exercises it; add a one-line cross-reference table at the end of `tests/integration/README.md` (or create the file if absent).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)** has no dependencies; runs first.
- **Foundational (Phase 2)** depends on Setup; **blocks every user story**.
- **User Stories (Phases 3–9)** all depend on Foundational. They are largely independent of each other and may be developed in parallel by separate developers, with these caveats:
  - US1 has no dependencies on other stories (truly independent — and is the MVP).
  - US2 has no dependencies on other stories but ships the `muscle_groups` schema; nothing else in Phase 2 reads from that table, so its absence does not block US3/4/5/6/7.
  - US3 has no story dependencies; the `is_active` column is owned by US3.
  - US4 has no story dependencies; the engine extension is additive to Phase 1's macros module.
  - US5 has no dependencies on other Phase-2 stories beyond Foundational.
  - US6 depends on US5 (the export pipeline is the prerequisite to test the round-trip and to power "Export first" in US7). US6 can be started on the day US5 lands T072 + T071.
  - US7 depends on US5 only for the "Export first" path. The reset orchestrator itself is otherwise self-contained.
- **Polish (Phase 10)** depends on every story whose surface it touches; if shipping a partial Phase 2 (e.g., MVP-only), only the Polish tasks relevant to the shipped stories apply.

### Within Each User Story

- TDD tests come first (Constitution V) and must be RED before implementation tasks land.
- DAO before controller before route.
- Backend before frontend.
- Each frontend smoke test ships after the page it covers.
- Story complete = all its `[USn]` tasks ticked + integration tests green + smoke test green.

### Parallel Opportunities (selected)

- **Setup**: T003 and T004 in parallel.
- **Foundational**: T006, T007, T008, T009, T010 all in parallel after T005 lands the router shell.
- **US1**: T011 + T012 + T013 (tests) in parallel; T014 in parallel with T015; T019 in parallel with the controller/route work.
- **US2**: migrations T020–T024 sequential; tests T025–T029 in parallel after T020 applies; implementation T030 + T031 in parallel; T034–T037 sequential; T038 in parallel with the API tests it depends on.
- **US3**: tests T041 + T042 in parallel; implementation T043 in parallel with the route/controller pair.
- **US4**: tests T050–T054 all in parallel; implementation T055 + T056 + T057 in parallel; controllers T058 + T059 in parallel.
- **US5**: tests T064–T069 in parallel; implementation T070 + T071 + T072 + T073 in parallel.
- **US6**: tests T077–T081 in parallel; implementation T082 + T083 + T084 in parallel.
- **US7**: tests T089–T091 in parallel; implementation T092 + T093 in parallel.
- **Polish**: T098–T103 in parallel.

---

## Parallel Example: User Story 4

```bash
# Tests (write first, must be RED before implementation):
Task: "Extend tests/unit/engine.macros.test.js with calorie-only and per-macro override cases"
Task: "Add contract tests in tests/contract/api.v1.test.js for /me/preferences and /me/nutrition-targets"
Task: "Author tests/integration/settings.preferences.persist.test.js"
Task: "Author tests/integration/settings.nutritionTargets.audit.test.js"
Task: "Author tests/unit/lib.units.test.js"

# Implementation parallelizable up to controller wiring:
Task: "Extend services/engine/macros.js with override path"
Task: "Document engine_overrides.nutrition.* shape in services/engine/constants.js"
Task: "Extend services/dataAccess/appConfig.dao.js with preferences + override methods"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup (T001–T004).
2. Phase 2 Foundational (T005–T010).
3. Phase 3 US1 (T011–T019).
4. **Stop and validate** against the US1 Independent Test from `spec.md`.
5. Demo / merge.

### Incremental delivery (recommended for Phase 2)

1. Setup + Foundational → Foundation ready.
2. US1 → MVP ships.
3. US2 → Schedule editable; full Phase 0 promise (dynamic weekly schedule) finally lands end-to-end.
4. US3 → Library editable; closes the daily-friction gap.
5. US4 → Preferences + custom nutrition; the most common ongoing-use feature.
6. US5 → Export ships; backups now possible (P3 but high trust value).
7. US6 → Import ships (depends on US5); round-trip safe.
8. US7 → Reset ships behind US5 (export-first path).
9. Polish → close out compliance + docs.

### Parallel team strategy

After Foundational lands:
- Developer A: US1 → US4 (one developer can chain MVP into nutrition/prefs).
- Developer B: US2 → US3 (schedule + exercises share UX patterns and the SortableList).
- Developer C: US5 → US6 → US7 (data-management chain has the strongest internal dependency).

---

## Notes

- `[P]` markers reflect file-level isolation. Two tasks marked `[P]` for the same `[USn]` may still depend on a shared mock or fixture; that coupling is called out in each test task's description where relevant.
- `[Story]` labels map every user-story task to a single story for traceability against `spec.md`.
- TDD discipline: every engine, validator, and orchestrator pure module ships RED tests before its implementation. The Constitution treats this as non-negotiable.
- Commit after each task or coherent group; the Spec Kit auto-commit hook is enabled.
- Stop at any **Checkpoint** to validate the story independently — that is the exit criterion for the story to be considered shippable.
- Avoid: vague file-less tasks (every task here names a file), accidental same-file conflicts (each `[P]` group has been audited for path overlap), and cross-story implementation dependencies that would break independent shipping.
