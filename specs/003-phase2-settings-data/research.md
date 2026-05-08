# Phase 2 — Research & Decision Log

**Feature**: 003-phase2-settings-data
**Date**: 2026-05-08

This document resolves the open design questions Phase 2 raised that were not already nailed down by the spec's Clarifications session. Five decisions are recorded (D-1…D-5). For each, I list what was chosen, why, and the alternatives that were considered and rejected.

---

## D-1. Materialise the spec's "athlete preferences" entity as the existing `app_config` table, not a new table

**Decision**: Use the Phase 0 `app_config` table as the storage location for the spec's "Athlete preferences" entity. Add the missing column (`notification_acks JSONB NOT NULL DEFAULT '{}'::jsonb`) on top of the existing `theme`, `units`, `rest_timer_sound`, and `engine_overrides` columns. **Drop** the now-obsolete `daily_kcal_override` column (see D-3). Do not create a new `athlete_preferences` table.

**Rationale**: The Phase 0 `app_config` already implements the clarification's two-stores-by-purpose pattern: `theme/units/rest_timer_sound` are UI-side scalar columns and `engine_overrides` is the calculator-input JSONB sibling. Introducing a parallel `athlete_preferences` table would duplicate the same per-athlete-1:1 pattern that `app_config` already encodes (PK = `athlete_id`), and would force a migration to move the existing `theme/units/rest_timer_sound` columns out — for no functional benefit. The clarification's intent (UI prefs and engine overrides do not co-mingle) is already satisfied because they live in different *columns* of the same row.

**Alternatives considered**:
- *Create a new `athlete_preferences` table and migrate the three existing columns into it*: rejected. Pure rename; ships a destructive migration with no behavioural change; doubles the per-athlete row count for zero benefit.
- *Move the new `notification_acks` into `engine_overrides`*: rejected. Acknowledgement state is UI-side metadata, not a calculator input. Keeping it out of `engine_overrides` preserves the engine's invariant that the JSONB content is consumed by `resolveConstants` and only by `resolveConstants`.

**Spec impact**: Spec FR-019 wording remains correct in spirit — the entity is per-athlete, scoped by `athlete_id`, with its own RLS, persisted independently of the engine override store. The data-model.md describes the entity as backed by `app_config`. This is the only spec-to-implementation translation note for Phase 2.

---

## D-2. Per-athlete `muscle_groups` catalogue with a numeric FK on `weekly_plan_slots`

**Decision**: Implement the spec clarification's "per-athlete editable catalogue" (Clarification Q1) as a new `muscle_groups` table keyed `(athlete_id, slug)` with a soft-archive flag. Replace the existing free-text `weekly_plan_slots.muscle_group` column with a `muscle_group_id BIGINT NOT NULL` FK. Migrate in three forward-only steps: (1) add nullable FK, (2) backfill via SQL by inserting one catalogue row per distinct `(athlete_id, muscle_group)` and updating slot rows, (3) make the FK NOT NULL and drop the text column.

**Rationale**: Renames must propagate without rewriting historical rows; merges must be a first-class operation; soft-archive must preserve historical session attribution. A FK to a stable id row delivers all three. Storing free text would silently fragment "Chest+Triceps" vs "Chest + Triceps" in the Phase 5 load-tracking aggregations and the Phase 11 statistics radar.

**Alternatives considered**:
- *Single global catalogue*: rejected by the spec clarification — athletes must be able to add and rename.
- *Free text + a normalisation function*: rejected — fragile and impossible to enforce a merge.
- *Single migration that adds the FK, backfills, and drops the column in one file*: rejected. The Constitution requires forward-only replayable migrations; splitting into three keeps each step idempotent and the backfill migration becomes a clean no-op on a fresh database.

**Spec impact**: FR-006 / FR-006a / FR-006b / FR-006c are honoured exactly. The `muscle_groups` row id is the immutable reference; renames update the row, not the slot.

---

## D-3. Custom nutrition targets live in `engine_overrides.nutrition.*` (JSONB), not in scalar columns

**Decision**: Store the four custom-nutrition overrides as JSONB keys under `app_config.engine_overrides.nutrition`: `daily_kcal`, `daily_protein_g`, `daily_carbs_g`, `daily_fat_g`. Drop the existing `app_config.daily_kcal_override` scalar column (it was never wired into the engine resolver in Phase 1, so the drop has no production callers). The Phase 1 `resolveConstants(override)` helper consumes the JSONB and the engine's macro pure function (`services/engine/macros.js`) is extended for the calorie-only auto-derive path (FR-017a) and per-macro precedence (FR-017b).

**Rationale**: The Q2 clarification was explicit — custom nutrition targets are calculator-affecting overrides and stay in `engine_overrides` so the engine resolver remains the single source of truth. Keeping a parallel scalar column path would create two writeable surfaces for the same value (the column and the JSONB key), which inevitably drifts. The audit-row invariant from Q5 / FR-003a also demands that every override save passes through the engine's audit writer — a path that already exists for JSONB-shaped overrides.

**Alternatives considered**:
- *Keep `daily_kcal_override` as a column and add three sibling columns (`daily_protein_g_override`, `daily_carbs_g_override`, `daily_fat_g_override`)*: rejected. Two stores for the same concept; doubles the audit-write logic; the resolver would have to merge two sources.
- *New table `athlete_nutrition_targets` with one row per override*: rejected — overkill for four values that are written together and read together.

**Spec impact**: FR-017 / FR-017a / FR-017b describe the JSONB path. The data-model.md documents the JSONB shape exactly, including the absence of a key meaning "use engine default".

---

## D-4. Atomic JSON import: stage to in-memory buffer, then run a single transactional swap per athlete

**Decision**: The import pipeline is `validate envelope → forward-migrate (D-5) → assemble write-set in memory → open one Supabase transaction per athlete-scoped collection group → DELETE-then-INSERT inside the transaction → commit`. If any step fails, no commits happen and the athlete's pre-import state is intact. The Supabase JS client supports this via the `pg` connection abstracted behind a single DAO entry (`importers.dao.js`); the controller never sees individual collection writes.

**Rationale**: FR-024 (atomic restore) and FR-025 (failure leaves state unchanged) require all-or-nothing semantics. The cleanest implementation uses a real DB transaction. Buffer-then-swap is the safe pattern even when the transaction is logically nested: if a forward-migrator throws, no SQL has run yet; if a write fails, the transaction rolls back; if validation fails, no SQL has been issued. The athlete-scoped predicate on every DELETE/INSERT prevents cross-athlete contamination by construction.

**Alternatives considered**:
- *No transaction, sequential DELETE+INSERT, log failures*: rejected — violates FR-024.
- *Stage to a shadow schema and rename in*: rejected — operationally heavy, out of scope for single-user mode and a future-multi-user concern that can be revisited if SaaS-scale imports become a thing.
- *Background job with status polling*: rejected — adds a job runner just for an athlete-initiated, sub-5-second operation.

**Spec impact**: FR-023 / FR-024 / FR-025 / FR-026 are implementable as written. The operator-facing error messages enumerate the validation step that failed (size, schema-newer, ownership, missing migrator, structural, mid-write).

---

## D-5. Forward-migrator chain for older backups: one file per `vN-to-vN+1` step, registered in a manifest

**Decision**: Backups carry an `_export.schema_version` integer (starts at 1). The current app pins `BACKUP_SCHEMA_VERSION` in `config/schema.js`. On import:
- If `backup.version > current` → reject (FR-023a).
- If `backup.version === current` → straight-through to the validator + writer.
- If `backup.version < current` → walk a manifest of one-step migrators (`services/dataManagement/backupMigrators/v<from>-to-v<to>.js`) from `backup.version` to `current`. If a step is missing, reject with a "missing migrator vX → vX+1" message — never partially migrate.

Each migrator is a pure function `(oldEnvelope) => newEnvelope`. It is committed *in the same change-set as the SQL migration that bumps the schema*. Phase 2 ships at v1 with no migrators yet; the directory contains a `README.md` documenting the convention and an example skeleton.

**Rationale**: Q4 chose forward-migration over strict-reject. A chain of small one-step migrators is the canonical implementation: each step is independently testable, the chain is composable, and the discipline of writing the migrator at the moment the schema bumps prevents the chain from ever falling behind. Importantly, every successful import is recorded with both the original and the post-migration version (FR-026), so the audit story stays clean across upgrades.

**Alternatives considered**:
- *Direct N→current migrators*: rejected. Combinatorial blowup as the version count grows.
- *Best-effort import with field-skip*: rejected by Q4 — silent data loss is the worst failure mode for a backup tool.
- *External migration tool*: rejected — unnecessary surface area; the migrators are tiny pure JS functions.

**Spec impact**: FR-023a / FR-026 describe this exactly. The `backupMigrators/README.md` codifies the convention so any future schema bump knows the discipline.

---

## Cross-cutting notes (not numbered decisions)

- **Localization seam**: The existing single source for user-facing strings is honoured. New Settings copy lands in the same strings module so a future French ↔ English toggle does not require a sweep.
- **Performance budget for the export**: a single full export reads at most ~12 athlete-scoped tables, each backed by an indexed `(athlete_id, ...)` predicate. Phase 1 measured ~50–170 ms per such read against the cloud Supabase project. Even pessimistically, the full export is ≤ 2 s of pure DB time, leaving ample headroom for envelope assembly and JSON serialisation under SC-008's 5 s budget.
- **CSV escaping**: the sessions CSV is emitted via a pure helper that quotes fields containing the separator, double quotes, or newlines, and doubles internal quotes per RFC 4180. UTF-8, no BOM, line endings `\n`.
- **Reset confirmation token**: the token is sourced from `config.RESET_CONFIRM_TOKEN` (default `RESET-MASSLAB`), so deployments that want a project-name-flavoured token can override without code changes. The frontend reads the token via the existing public-config endpoint introduced in Phase 0; the backend always re-checks server-side regardless of what the frontend sent.
- **Multer footprint**: `multer` is configured to memory storage with the configured `IMPORT_MAX_BYTES` cap; no temporary files touch disk. The file buffer is handed straight to the importer.

---

## Open items intentionally deferred

None. Every Phase 2 design question raised by the spec has either been answered in the Clarifications session, by Phase 0 / Phase 1 decisions still in force, or by D-1 through D-5 above. Phase 3 onwards may revisit catalogue evolution (e.g., default training-day templates per goal), backup-schema bumps, and the Settings auto-save pattern as new modules ship.
