# Phase 2 — Quickstart

**Feature**: 003-phase2-settings-data
**Date**: 2026-05-08

This is the operator's guide to the Phase 2 surface. It assumes the Phase 0 foundation and the Phase 1 calculator engine are already running (see `specs/001-phase0-foundation/quickstart.md` and `specs/002-calculators-engine/quickstart.md`). Everything below is local-dev oriented; the same shapes work against a hosted Supabase project.

## Prerequisites

- Node.js ≥ 20 (project runs on 22.17 in dev).
- A working `.env` from Phase 0 (`SINGLE_USER_MODE=true`, `PORT=3000`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `CORS_ORIGIN`).
- Phase 0 + Phase 1 migrations and seeds applied. To verify:

  ```bash
  npm run seed   # idempotent
  npm test       # full suite green on main
  ```

## What Phase 2 adds at runtime

Five sub-surfaces under one Settings page, plus a Data Management surface:

| Sub-surface | Frontend route          | Primary endpoints                                                                                                              |
| ----------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Profile     | `/settings/profile`     | `GET /api/v1/me`, `PATCH /api/v1/me`                                                                                           |
| Schedule    | `/settings/schedule`    | `GET/PUT /api/v1/me/schedule`, `POST .../slots/:id/exercises/reorder`, `*/api/v1/muscle-groups/*`                              |
| Exercises   | `/settings/exercises`   | `GET/POST/PATCH/DELETE /api/v1/exercises`                                                                                      |
| Preferences | `/settings/preferences` | `GET/PATCH /api/v1/me/preferences`, `GET/PUT/DELETE /api/v1/me/nutrition-targets`                                              |
| Data        | `/settings/data`        | `POST /api/v1/data/export/json`, `GET /api/v1/data/export/sessions.csv`, `POST /api/v1/data/import`, `POST /api/v1/data/reset` |

## First-time setup after pulling the branch

1. Install the new dependencies. The repo is an npm workspace, so the root install also hydrates `frontend/`:

   ```bash
   npm install                       # picks up multer + workspace deps (@dnd-kit/* in frontend)
   ```

2. Apply the Phase 2 migrations. They're forward-only and idempotent:

   ```bash
   supabase migration up             # against the local CLI stack
   # or, against the hosted dev project:
   supabase db push --linked
   ```

3. Re-run the seed so the `muscle_groups` catalogue and the `is_active` flags on existing exercises are populated:

   ```bash
   npm run seed
   ```

4. Start the stack:

   ```bash
   npm start                         # api on :3000, web on :5173
   ```

5. Open the Settings page in the browser:

   ```
   http://localhost:5173/settings
   ```

## Smoke-test walkthrough

Run these in order; each verifies one of the user stories from the spec.

### US1 — Profile change triggers engine recompute

```bash
curl -s -X PATCH http://localhost:3000/api/v1/me \
     -H 'content-type: application/json' \
     -d '{ "current_weight_kg": 59 }' | jq .
```

Expect a 200 with `data.profile.current_weight_kg = 59` and `data.recompute.calculation_audit_id` populated. The `calculation_results` row is asserted in `tests/integration/settings.profile.audit.test.js`; you can also tail the API logs (every PATCH that triggers a recompute logs `program_id` and `calculation_audit_id`).

### US2 — Schedule replace, in-progress session guard

```bash
curl -s -X PUT http://localhost:3000/api/v1/me/schedule \
     -H 'content-type: application/json' \
     -d @- <<'JSON' | jq .
{
  "active_days": 4,
  "slots": [
    { "day_of_week": 1, "muscle_group_id": 1, "display_order": 1 },
    { "day_of_week": 2, "muscle_group_id": 2, "display_order": 2 },
    { "day_of_week": 4, "muscle_group_id": 3, "display_order": 3 },
    { "day_of_week": 6, "muscle_group_id": 4, "display_order": 4 }
  ]
}
JSON
```

Expect a 200. Re-run with two slots having the same `muscle_group_id` and expect a 400 `VALIDATION_FAILED`.

### US3 — Exercise soft-delete preserves history

```bash
# create
curl -s -X POST http://localhost:3000/api/v1/exercises \
     -H 'content-type: application/json' \
     -d '{ "name": "Bulgarian Split Squat",
           "targeted_muscles": ["quadriceps","glutes"],
           "instructions": "Stand …" }' | jq .data.id
# delete (no historical refs → hard-delete)
curl -s -X DELETE http://localhost:3000/api/v1/exercises/<id>
```

For an exercise with historical session refs, the same DELETE returns 204 and the row remains with `is_active=false`. Verify with `?include_archived=1`.

### US4 — Custom calorie target re-runs macros (FR-017a)

```bash
curl -s -X PUT http://localhost:3000/api/v1/me/nutrition-targets \
     -H 'content-type: application/json' \
     -d '{ "daily_kcal": 3500 }' | jq .data
```

Expect `data.targets.daily_kcal = 3500`, `data.targets.daily_protein_g` unchanged from engine (still 2.2 g/kg LBM), `data.targets.source.daily_kcal = "override"`, `data.targets.source.daily_carbs_g = "auto-derived"`. Add an explicit protein override and confirm `source.daily_protein_g` flips to `"override"`.

### US5 — Full JSON export

```bash
curl -s -X POST http://localhost:3000/api/v1/data/export/json | jq '._export'
```

Expect `_export.schema_version = 1`, `_export.engine_version` matching `services/engine/constants.js`, `_export.athlete_id` matching the seeded athlete, and a non-empty array under each entity collection.

CSV export:

```bash
curl -s http://localhost:3000/api/v1/data/export/sessions.csv | head -5
```

Header row is always present, even if there are no sessions yet.

### US6 — Round-trip import

```bash
# 1. Export
curl -s -X POST http://localhost:3000/api/v1/data/export/json -o /tmp/masslab-backup.json

# 2. Modify a profile field
curl -s -X PATCH http://localhost:3000/api/v1/me \
     -H 'content-type: application/json' \
     -d '{ "current_weight_kg": 58 }'

# 3. Import the backup
curl -s -X POST http://localhost:3000/api/v1/data/import \
     -F file=@/tmp/masslab-backup.json -F source_filename=masslab-backup.json | jq .data

# 4. Verify the field reverted
curl -s http://localhost:3000/api/v1/me | jq .data.current_weight_kg
```

Should match the value at export time. The `data.schema_version_original` and `data.schema_version_applied` are both `1` for Phase 2.

### US7 — Reset (sessions only)

```bash
curl -s -X POST http://localhost:3000/api/v1/data/reset \
     -H 'content-type: application/json' \
     -d '{ "module": "sessions", "confirm_token": "RESET-MASSLAB" }' | jq .data
```

`data.deleted_counts.sessions` reports the deleted count. The athlete profile, body measurements, and preferences are untouched. A wrong token returns 400 `RESET_TOKEN_MISMATCH`. A full reset (`module: "all"`) wipes everything except the profile row and resets preferences and `engine_overrides` to defaults.

## Local override of operator settings

Three new keys in `config/schema.js`, all with sensible defaults; override only when needed via `.env`:

| Key                     | Default             | When to override                                                                            |
| ----------------------- | ------------------- | ------------------------------------------------------------------------------------------- |
| `BACKUP_SCHEMA_VERSION` | `1`                 | Bumped _only_ when shipping a new backup migrator + matching SQL migration.                 |
| `IMPORT_MAX_BYTES`      | `26214400` (25 MiB) | Raise for athletes with ~years of session history; the realistic Phase 2 maximum is ~2 MiB. |
| `CSV_SEPARATOR`         | `,`                 | Set to `;` for spreadsheets that default to that separator in `fr-FR` locales.              |
| `RESET_CONFIRM_TOKEN`   | `RESET-MASSLAB`     | Customise per environment if you want different tokens for dev vs staging.                  |

## Test commands

```bash
npm test                              # all suites
npm run test:contract                 # OpenAPI contract pass
npx vitest run tests/integration/data.export.test.js
npx vitest run tests/unit/dataManagement.exporter.test.js
npx vitest run tests/unit/dataManagement.importer.test.js
npm --prefix frontend run test        # frontend smoke suite
```

## Operational notes

- The single source of truth for the engine version is `services/engine/constants.js`. Bumping `ENGINE_VERSION` does NOT bump `BACKUP_SCHEMA_VERSION` — they version different things.
- The `services/dataManagement/backupMigrators/` directory ships with `index.js` (an empty manifest plus the `migrateChain` walker) and `README.md` (the contribution convention). The first real migrator (`v1-to-v2.js`) lands the day a Phase 3+ feature changes the backup-envelope shape; that PR also bumps `BACKUP_SCHEMA_VERSION` and updates the export path to emit `_export.schema_version = 2`.
- Imports are bounded by `IMPORT_MAX_BYTES`; `multer` is configured to memory storage, so no temporary files touch disk.
- The restore is atomic. `services/dataAccess/importers.dao.replaceAllForAthlete` delegates to the `public.replace_athlete_dataset(uuid, jsonb)` Postgres function, which wraps the wipe + reinsert in a single `plpgsql` transaction — any RAISE / runtime error rolls the whole restore back. Migration: `supabase/migrations/20260508170123_init_replace_athlete_dataset_fn.sql`.
- The reset endpoint always re-checks the `confirm_token` server-side. The frontend's typed-token dialog is UX, not security.
