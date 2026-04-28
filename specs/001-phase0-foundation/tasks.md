---
description: "Task list for MassLab Phase 0 — Foundation and Architecture"
---

# Tasks: Phase 0 — Foundation and Architecture

**Input**: Design documents from `/specs/001-phase0-foundation/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/openapi.yaml, quickstart.md

**Tests**: Tests for the program generator are MANDATORY per Constitution Principle V (Test-First for Domain Logic). Other tests covering FRs/SCs/USs are also included because the spec's Success Criteria explicitly require them (`npm test` is part of acceptance per quickstart.md).

**Organization**: Tasks are grouped by user story so each one can be implemented and verified independently. Each task names the exact file path, exact library version (via `package.json`), and exact contract or schema reference where relevant — so a smaller LLM can execute it without re-reading the whole spec.

## Format

`- [ ] [TaskID] [P?] [Story?] Description with file path`

- **[P]**: parallelizable (different file, no dependency on a still-incomplete task).
- **[USx]**: user story label (only on user-story-phase tasks).
- File paths are repo-root-relative.

## Reference shortcuts (used inline in tasks)

- **plan**: `specs/001-phase0-foundation/plan.md`
- **spec**: `specs/001-phase0-foundation/spec.md`
- **research**: `specs/001-phase0-foundation/research.md`
- **data-model**: `specs/001-phase0-foundation/data-model.md`
- **contract**: `specs/001-phase0-foundation/contracts/openapi.yaml`
- **quickstart**: `specs/001-phase0-foundation/quickstart.md`
- **constitution**: `.specify/memory/constitution.md`

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project scaffolding. Must complete before any foundational or story task.

- [ ] T001 Create the directory tree exactly as listed in **plan** § "Source Code (repository root)": `routes/`, `controllers/`, `services/`, `services/photoStorage/`, `services/config/`, `models/`, `middleware/`, `migrations/`, `seed/`, `public/`, `data/`, `data/photos/`, `tests/unit/`, `tests/integration/`, `tests/contract/`. Add a `.gitkeep` file inside `public/` and inside `data/photos/` so the empty directories are tracked.
- [ ] T002 Create `package.json` at repo root with: `"name": "masslab"`, `"version": "0.1.0"`, `"private": true`, `"type": "module"`, `"engines": { "node": ">=20" }`, `"scripts": { "start": "node server.js", "dev": "node --watch server.js", "test": "vitest", "test:run": "vitest run", "test:contract": "vitest run tests/contract", "lint": "eslint .", "format": "prettier --write .", "setup": "cp -n .env.example .env" }`.
- [ ] T003 [P] Install runtime dependencies via npm: `npm install express@^4.19 better-sqlite3@^11 pino@^9 pino-pretty@^11 dotenv@^16 bcrypt@^5 zod@^3`.
- [ ] T004 [P] Install dev dependencies via npm: `npm install -D vitest@^2 supertest@^7 eslint@^9 prettier@^3 @types/node@^20 ajv@^8 ajv-formats@^3 yaml@^2`.
- [ ] T005 [P] Create `.gitignore` at repo root with these lines (one per line): `node_modules/`, `.env`, `data/masslab.db`, `data/masslab.db-journal`, `data/masslab.db-wal`, `data/masslab.db-shm`, `data/photos/*`, `!data/photos/.gitkeep`, `coverage/`, `*.log`, `.DS_Store`. (Implements **FR-017**.)
- [ ] T006 [P] Create `.env.example` at repo root with: `PORT=3000`, `DB_PATH=./data/masslab.db`, `SINGLE_USER_MODE=true`, `LOG_LEVEL=info`, `BCRYPT_COST=12`, `PHOTO_STORAGE_ROOT=./data/photos`. One key per line, with a one-line comment above each describing it. (Implements **FR-017**.)
- [ ] T007 [P] Create `eslint.config.js` at repo root using flat config exporting an array of one config object: `{ files: ['**/*.js'], languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...process: 'readonly', console: 'readonly' } }, rules: { 'no-console': 'error', 'no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }`. Note: `no-console: error` enforces the constitution's "no bare console.log" rule.
- [ ] T008 [P] Create `.prettierrc.json` at repo root with `{ "semi": true, "singleQuote": true, "trailingComma": "all", "printWidth": 100 }`.
- [ ] T009 [P] Create `vitest.config.js` at repo root: `import { defineConfig } from 'vitest/config'; export default defineConfig({ test: { environment: 'node', testTimeout: 10000, hookTimeout: 10000, include: ['tests/**/*.test.js'] } });`.

**Checkpoint**: `npm install` succeeds; `npm run lint` runs (will pass with empty src); directory tree matches plan.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure all user stories depend on (config loader, DB, migrations, middleware stack, photo adapter). NO user-story work begins until this phase is complete.

### Configuration & logging

- [ ] T010 Create `services/config/schema.js`: `import { z } from 'zod';` Export `export const configSchema = z.object({ PORT: z.coerce.number().int().positive().default(3000), DB_PATH: z.string().min(1).default('./data/masslab.db'), SINGLE_USER_MODE: z.preprocess(v => String(v).toLowerCase() === 'true', z.boolean()).default(true), LOG_LEVEL: z.enum(['fatal','error','warn','info','debug','trace']).default('info'), BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12), PHOTO_STORAGE_ROOT: z.string().min(1).default('./data/photos') });` Also export `export const secretKeys = []` (registry for FR-014 redaction; no secrets in Phase 0).
- [ ] T011 [P] Create `services/config/dotenvAdapter.js`: import dotenv (`import 'dotenv/config'`) and `configSchema` from `./schema.js`. Export `class DotenvAdapter { load() { const parsed = configSchema.safeParse(process.env); if (!parsed.success) { const issues = parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '); throw new Error('[masslab] FATAL: invalid configuration — ' + issues); } return Object.freeze(parsed.data); } }`.
- [ ] T012 Create `services/config/index.js`: `import { DotenvAdapter } from './dotenvAdapter.js'; export { secretKeys } from './schema.js'; export function loadConfig(adapter = new DotenvAdapter()) { return adapter.load(); }`.
- [ ] T013 Create `services/logger.js`: `import pino from 'pino'; export function createLogger({ level, redactKeys = [] }) { return pino({ level, redact: redactKeys.length ? { paths: redactKeys, remove: true } : undefined, transport: process.env.NODE_ENV === 'production' ? undefined : { target: 'pino-pretty' } }); }`.
- [ ] T014 [P] Unit test `tests/unit/config.schema.test.js`: import `configSchema` and assert: (a) parsing `{}` returns defaults `{ PORT: 3000, DB_PATH: './data/masslab.db', SINGLE_USER_MODE: true, LOG_LEVEL: 'info', BCRYPT_COST: 12, PHOTO_STORAGE_ROOT: './data/photos' }`; (b) `SINGLE_USER_MODE: 'false'` (string) parses to `false`; (c) `PORT: '8080'` parses to `8080` (number); (d) `LOG_LEVEL: 'verbose'` fails parsing; (e) `BCRYPT_COST: '20'` fails (max 15).

### Database & migrations

- [ ] T015 Create `services/db.js`: `import Database from 'better-sqlite3'; import { existsSync, mkdirSync } from 'node:fs'; import { dirname } from 'node:path'; export function openDatabase({ dbPath, logger }) { const dir = dirname(dbPath); if (!existsSync(dir)) mkdirSync(dir, { recursive: true }); const db = new Database(dbPath); db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON'); logger.info({ dbPath }, 'database opened'); return db; }`.
- [ ] T016 Create `migrations/runner.js`: `import { readdirSync, readFileSync } from 'node:fs'; import { join } from 'node:path'; export function runMigrations({ db, migrationsDir, logger }) { db.exec("CREATE TABLE IF NOT EXISTS _migrations (filename TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"); const applied = new Set(db.prepare('SELECT filename FROM _migrations').all().map(r => r.filename)); const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort(); let count = 0; for (const file of files) { if (applied.has(file)) continue; const sql = readFileSync(join(migrationsDir, file), 'utf8'); const tx = db.transaction(() => { db.exec(sql); db.prepare('INSERT INTO _migrations(filename) VALUES (?)').run(file); }); tx(); count++; logger.info({ file }, 'migration applied'); } logger.info({ count }, 'migrations complete'); }`.

### Migration SQL files (one per data-model.md migration map row)

- [ ] T017 [P] Create `migrations/0001_init_athletes.sql` matching the `athletes` table in **data-model** § athletes (all columns, types, CHECK constraints, NOT NULL/UNIQUE, defaults). Do NOT create `_migrations` here; the runner already creates it.
- [ ] T018 [P] Create `migrations/0002_init_exercises.sql` matching **data-model** § exercises (table + UNIQUE constraint + index `idx_exercises_athlete`).
- [ ] T019 [P] Create `migrations/0003_init_weekly_plan.sql` matching **data-model** § `weekly_plan_slots` AND § `weekly_plan_slot_exercises` (both tables, both UNIQUEs, FK with `ON DELETE CASCADE`, index `idx_weekly_plan_athlete_day`).
- [ ] T020 [P] Create `migrations/0004_init_training_phases.sql` matching **data-model** § training_phases.
- [ ] T021 [P] Create `migrations/0005_init_nutrition.sql` matching **data-model** § nutrition_template_meals (with the slot CHECK constraint and `(athlete_id, slot)` UNIQUE).
- [ ] T022 [P] Create `migrations/0006_init_supplements.sql` matching **data-model** § supplements AND § supplement_intakes (index `idx_supplement_intakes_athlete_date`).
- [ ] T023 [P] Create `migrations/0007_init_foods.sql` matching **data-model** § foods (index `idx_foods_athlete_locale_name`).
- [ ] T024 [P] Create `migrations/0008_init_quotes.sql` matching **data-model** § quotes.
- [ ] T025 [P] Create `migrations/0009_init_session_journal.sql` matching **data-model** § sessions AND § sets (indexes `idx_sessions_athlete_started`, `idx_sets_session`, `idx_sets_athlete_exercise`; `ON DELETE CASCADE` for sets→sessions).
- [ ] T026 [P] Create `migrations/0010_init_body_measurements.sql` matching **data-model** § body_measurements (index `idx_body_measurements_athlete_date`).
- [ ] T027 [P] Create `migrations/0011_init_athlete_photos.sql` matching **data-model** § athlete_photos (index `idx_athlete_photos_athlete_date`).
- [ ] T028 [P] Create `migrations/0012_init_recovery_log.sql` matching **data-model** § recovery_logs (index `idx_recovery_logs_athlete_date`).
- [ ] T029 [P] Create `migrations/0013_init_app_config.sql` matching **data-model** § app_config.

### Middleware

- [ ] T030 Create `middleware/requestId.js`: `import { randomUUID } from 'node:crypto'; export function requestIdMiddleware({ logger }) { return (req, res, next) => { req.id = randomUUID(); res.setHeader('X-Request-Id', req.id); req.log = logger.child({ request_id: req.id }); next(); }; }`. (Implements **FR-018**.)
- [ ] T031 [P] Create `middleware/auth.js`: export `authMiddleware({ config }) { return (req, res, next) => { if (config.SINGLE_USER_MODE) { req.athleteId = 1; return next(); } return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' }, request_id: req.id }); }; }`. (Implements **FR-005**, **FR-016**.)
- [ ] T032 [P] Create `middleware/tenantScope.js`: export `tenantScopeMiddleware() { return (req, res, next) => { if (!req.athleteId) { return res.status(500).json({ error: { code: 'NO_TENANT', message: 'No tenant resolved' }, request_id: req.id }); } next(); }; }`. (Implements **FR-003**.)
- [ ] T033 [P] Create `middleware/requestLogger.js`: export `requestLoggerMiddleware() { return (req, res, next) => { const start = Date.now(); res.on('finish', () => { req.log.info({ method: req.method, path: req.originalUrl, status: res.statusCode, duration_ms: Date.now() - start, athlete_id: req.athleteId ?? null }, 'http_request'); }); next(); }; }`. (Implements **FR-019**.)
- [ ] T034 [P] Create `middleware/errorHandler.js`: export `errorHandlerMiddleware() { return (err, req, res, _next) => { req.log.error({ err: { name: err.name, message: err.message, stack: err.stack } }, 'unhandled_error'); res.status(err.status || 500).json({ error: { code: err.code || 'INTERNAL', message: err.expose ? err.message : 'Internal server error' }, request_id: req.id }); }; }`.

### Photo storage adapter

- [ ] T035 [P] Create `services/photoStorage/photoStorage.contract.js`: a JSDoc-only file documenting the interface — `/** @typedef {Object} PhotoStorage @property {(athleteId:number, buffer:Buffer, ext:string)=>Promise<string>} put @property {(ref:string)=>NodeJS.ReadableStream} get @property {(ref:string)=>Promise<void>} delete */ export {};`.
- [ ] T036 [P] Create `services/photoStorage/filesystemAdapter.js`: import `node:fs/promises`, `node:fs` (for createReadStream), `node:path`, `node:crypto`. Export `function createFilesystemPhotoStorage({ root }) { return { async put(athleteId, buffer, ext) { const dir = path.join(root, String(athleteId)); await fs.mkdir(dir, { recursive: true }); const filename = `${randomUUID()}.${ext}`; await fs.writeFile(path.join(dir, filename), buffer); return path.posix.join(String(athleteId), filename); }, get(ref) { return createReadStream(path.join(root, ref)); }, async delete(ref) { await fs.unlink(path.join(root, ref)); } }; }`. (Implements **FR-021**.)
- [ ] T037 [P] Create `services/photoStorage/index.js`: re-export `createFilesystemPhotoStorage` from `./filesystemAdapter.js`.
- [ ] T038 [P] Unit test `tests/unit/photoStorage.local.test.js`: create a temp dir via `os.tmpdir() + '/' + randomUUID()`; build adapter with `root = tempDir`; assert `put(1, Buffer.from('hi'), 'jpg')` returns a string `ref`; assert the file exists under `tempDir/1/<uuid>.jpg`; assert `get(ref)` produces a readable stream whose first chunk equals `'hi'`; assert `delete(ref)` removes the file.

### App composition

- [ ] T039 Create `app.js` at repo root: `import express from 'express'; export function createApp({ logger, db, config }) { const app = express(); app.use(express.json({ limit: '1mb' })); app.use(requestIdMiddleware({ logger })); app.use(requestLoggerMiddleware()); app.use(authMiddleware({ config })); app.use(tenantScopeMiddleware()); /* routes mounted in T058 */ app.use(errorHandlerMiddleware()); return app; }`. Imports for middleware factories at the top of the file.
- [ ] T040 Create `server.js` at repo root: `(async () => { try { const config = loadConfig(); const logger = createLogger({ level: config.LOG_LEVEL, redactKeys: secretKeys }); const wasSingleUserUnset = process.env.SINGLE_USER_MODE === undefined; if (wasSingleUserUnset) logger.warn('SINGLE_USER_MODE not set explicitly; defaulting to true. Set it explicitly before going online.'); /* FR-015 */ const db = openDatabase({ dbPath: config.DB_PATH, logger }); runMigrations({ db, migrationsDir: new URL('./migrations/', import.meta.url).pathname, logger }); /* seed wired in T046 */ const app = createApp({ logger, db, config }); app.listen(config.PORT, () => { logger.info({ port: config.PORT, dbPath: config.DB_PATH, singleUserMode: config.SINGLE_USER_MODE }, 'masslab listening'); }); } catch (err) { console.error(err.message); process.exit(1); } })();`. (Implements **FR-009**, **FR-010**, **FR-014**, **FR-015**.) Note: the single `console.error` here is the one allowed exception during early bootstrap before logger is constructed.

**Checkpoint**: `npm start` boots, applies all 13 migrations, listens on PORT 3000. `curl http://localhost:3000/anything` returns a structured 404 with a `request_id` in the body. Schema is empty otherwise; no seed yet.

---

## Phase 3: User Story 1 — First Launch Is Ready to Use (P1) MVP

**Goal**: After `npm install && npm start`, a fresh DB is migrated and seeded, and all read endpoints return the seeded program.

**Independent Test**: GET each endpoint listed in **contract** and verify the response shapes and counts in spec § US1 acceptance scenarios.

### Test-first for the program generator (Constitution V — NON-NEGOTIABLE)

- [ ] T041 [US1] Create `tests/unit/programGenerator.test.js` BEFORE the implementation. Import `{ generateProgram }` from `../../services/programGenerator.js`. Define `const seededProfile = { /* same shape as T045 */ }`. Assert: result has keys `trainingPlan`, `nutritionTargets`, `supplements`, `recoveryGuidelines`. Assert: `nutritionTargets.calories` is a number between 3000 and 3600 (Mifflin-St Jeor + 1.55 + bulk surplus). Assert: `nutritionTargets.protein_g >= 150`. Assert: `trainingPlan.phases.length === 3`. Assert: `trainingPlan.weeklyPlan.length === 5`. Assert: deterministic — calling twice with the same input returns deeply equal output. Run `npm run test:run -- tests/unit/programGenerator.test.js` and confirm it FAILS (no implementation yet).

### Program generator implementation

- [ ] T042 [US1] Create `services/programGenerator.js`: pure function `export function generateProgram(profile)` returning `{ trainingPlan, nutritionTargets, supplements, recoveryGuidelines }`. Implementation:
    - BMR (Mifflin-St Jeor): male `10*w + 6.25*h - 5*age + 5`, female `... - 161`.
    - Activity multipliers map: `{ sedentary: 1.2, lightly_active: 1.375, moderately_active: 1.55, very_active: 1.725, extremely_active: 1.9 }`. Default key `moderately_active`.
    - Calorie target: `TDEE + (goal === 'bulk' ? 400 : goal === 'cut' ? -400 : 0)`.
    - LBM ≈ `weight * 0.9`. Protein g = `LBM * 2.2`. Fat g = `(calories * 0.25) / 9`. Carbs g = `(calories - protein*4 - fat*9) / 4`.
    - `trainingPlan.phases`: `[ {name:'Volume', start_week:1, end_week:6, sets_per_exercise:4, reps_low:8, reps_high:12, rest_seconds:90, target_intensity_pct:70}, {name:'Intensity', start_week:7, end_week:14, sets_per_exercise:5, reps_low:5, reps_high:8, rest_seconds:120, target_intensity_pct:80}, {name:'Specialization', start_week:15, end_week:20, sets_per_exercise:4, reps_low:4, reps_high:6, rest_seconds:150, target_intensity_pct:85} ]`.
    - `trainingPlan.weeklyPlan`: `[ {day:1,muscle_group:'Chest+Triceps'}, {day:2,'Back+Biceps'}, {day:3,'Legs Quads'}, {day:5,'Shoulders+Traps'}, {day:6,'Legs Hams+Glutes'} ]`.
    - `recoveryGuidelines`: `{ sleep_hours_per_night: 8, deload_every_weeks: 4, hydration_l_per_day: 3 }`.
    - `supplements`: identical to the seeded list (read from `seed/supplements.seed.json` is fine, but to keep it pure: hardcode the same five items here as a constant array so the function has zero I/O).
    Re-run T041; must now PASS.

### Seed data (JSON content)

- [ ] T043 [P] [US1] Create `seed/exercises.seed.json` — 18 exercises in French. Required fields per item: `name`, `muscle_group`, `targeted_muscles` (array), `instructions`, `technique_points` (array). Must include at least: Développé Couché Barre, Développé Incliné Haltères, Dips Lestés, Tractions Pronation, Rowing Barre, Rowing T-bar, Soulevé de Terre, Squat Barre, Presse à Cuisses, Squat Bulgare, Hip Thrust, Leg Curl, Développé Militaire Debout, Élévations Latérales, Shrug Haltères, Curl Biceps Barre, Curl Marteau, Extensions Triceps Poulie. Each `instructions` ≥ 60 chars; each `technique_points` ≥ 3 items. Validate the file parses as JSON (`node -e "JSON.parse(require('fs').readFileSync('seed/exercises.seed.json','utf8'))"`).
- [ ] T044 [P] [US1] Create `seed/foods.seed.json` — 50 foods in French with `{ name, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g, calories_per_100g }`. Calories must satisfy `|calories - (protein*4 + carbs*4 + fat*9)| < 15` per row. Cover staples used in the meal plan: Riz blanc cuit, Riz basmati cuit, Pâtes complètes cuites, Avoine, Pain complet, Patate douce cuite, Pomme de terre cuite, Poulet (blanc, cuit), Bœuf haché 5%, Saumon, Thon en boîte, Œuf entier, Blanc d'œuf, Yaourt grec nature, Fromage blanc 0%, Lentilles cuites, Pois chiches cuits, Haricots rouges cuits, Quinoa cuit, Banane, Pomme, Orange, Fraises, Myrtilles, Brocoli, Épinards, Carotte, Tomate, Concombre, Avocat, Amandes, Noix, Noix de cajou, Beurre de cacahuète, Huile d'olive, Beurre, Lait demi-écrémé, Fromage emmental, Mozzarella, Whey isolate, Maltodextrine, Miel, Confiture, Chocolat noir 70%, Pain de mie complet, Tofu, Saumon fumé, Crevettes, Sardines à l'huile, Cabillaud cuit.
- [ ] T045 [P] [US1] Create `seed/supplements.seed.json` — exactly 5 items with `{ name, dosage, recommended_time, display_order }`: 1=Créatine Monohydrate / 5 g / Après l'entraînement, 2=Serious Mass / 1 dose (≈250 g) / Post-entraînement, 3=Vitamine D3 / 2000 UI / Matin (au repas), 4=Magnésium bisglycinate / 400 mg / Soir (avant coucher), 5=Oméga-3 EPA/DHA / 2 g / Midi (au repas).
- [ ] T046 [P] [US1] Create `seed/trainingPhases.seed.json` — exactly 3 phases identical to the constants defined in T042's `trainingPlan.phases`.
- [ ] T047 [P] [US1] Create `seed/nutritionTemplate.seed.json` — 5 meals: breakfast (display_order 1, target_calories 700, protein 35, carbs 95, fat 18), lunch (2, 900, 50, 110, 25), pre_workout (3, 400, 20, 70, 5), dinner (4, 900, 50, 110, 25), evening (5, 400, 20, 45, 17). Totals ≈ 3300 kcal / 175 P / 430 C / 90 F per **spec FR-012** indirectly (matches PLAN.md Phase 7).
- [ ] T048 [P] [US1] Create `seed/quotes.seed.json` — 30 quote items `{ text, author, display_order }`. French. Mix of athletes, coaches, philosophers (Bruce Lee, Arnold Schwarzenegger, Lao Tseu, Sénèque, Marc Aurèle, etc.). `author` may be null.
- [ ] T049 [P] [US1] Create `seed/athlete.seed.js`: `export const seededAthlete = { email: 'athlete@masslab.local', password_hash: null, display_name: 'Athlete', age: 29, biological_sex: 'male', height_cm: 173, starting_weight_kg: 58, target_weight_kg: 65, morphotype: 'ectomorph', goal: 'bulk', activity_level: 'moderately_active', sessions_per_week: 5, equipment_json: JSON.stringify(['barbell','dumbbells','bench','rack','pull_up_bar']), injuries_json: JSON.stringify([]), program_start_date: '2026-04-28' };` (Implements **FR-013**, **SC-007**.)

### Models (one per entity, all queries scoped by `athlete_id`)

- [ ] T050 [P] [US1] Create `models/athlete.model.js`. Header comment: `// All queries MUST be scoped by athleteId — Constitution Principle I (multi-tenant-ready).` Export functions that take `db` as first arg via a factory: `export function createAthleteModel(db) { return { findById(athleteId) { return db.prepare('SELECT * FROM athletes WHERE id = ?').get(athleteId); }, findByEmail(email) { return db.prepare('SELECT * FROM athletes WHERE email = ?').get(email); }, insert(profile) { const stmt = db.prepare('INSERT INTO athletes (email, password_hash, display_name, age, biological_sex, height_cm, starting_weight_kg, target_weight_kg, morphotype, goal, activity_level, sessions_per_week, equipment_json, injuries_json, program_start_date) VALUES (@email, @password_hash, @display_name, @age, @biological_sex, @height_cm, @starting_weight_kg, @target_weight_kg, @morphotype, @goal, @activity_level, @sessions_per_week, @equipment_json, @injuries_json, @program_start_date)'); const r = stmt.run(profile); return r.lastInsertRowid; } }; }`.
- [ ] T051 [P] [US1] Create `models/exercise.model.js` with the same header comment and a factory exporting `listForAthlete({ athleteId, locale, muscle_group })` (filter by muscle_group when provided; ORDER BY name), `findById({ athleteId, id })`, `insert({ athleteId, locale, name, muscle_group, targeted_muscles, instructions, technique_points, media_ref })`. JSON fields stored as strings; parse on read.
- [ ] T052 [P] [US1] Create `models/weeklyPlan.model.js` exporting `getForAthlete({ athleteId, locale })` returning `{ days: [{ day_of_week, muscle_group, exercises: [...] }] }` via JOIN of `weekly_plan_slots` + `weekly_plan_slot_exercises` + `exercises`, ordered by `day_of_week, order_in_slot`. Plus `insertSlot({ athleteId, day_of_week, muscle_group, display_order })` returning new slot id, and `attachExercise({ athleteId, weekly_plan_slot_id, exercise_id, order_in_slot })`.
- [ ] T053 [P] [US1] Create `models/trainingPhase.model.js` exporting `listForAthlete({ athleteId, locale })` ordered by `start_week`, plus `insert(...)`.
- [ ] T054 [P] [US1] Create `models/nutritionTemplate.model.js` exporting `listForAthlete({ athleteId })` ordered by `display_order`, plus `insert(...)`.
- [ ] T055 [P] [US1] Create `models/supplement.model.js` exporting `listForAthlete({ athleteId, locale })` ordered by `display_order`, plus `insert(...)`.
- [ ] T056 [P] [US1] Create `models/food.model.js` exporting `searchForAthlete({ athleteId, locale, q, limit })` — when `q` is non-empty, `WHERE name LIKE ?` with `%${q}%`; otherwise unfiltered. ORDER BY name. LIMIT clamped to 200. Plus `insert(...)`.
- [ ] T057 [P] [US1] Create `models/quote.model.js` exporting `listForAthlete({ athleteId, locale })` and `pickRotatingForAthlete({ athleteId, locale, dateIso, programStartDate })`: compute `daysSinceStart = floor((Date.parse(dateIso) - Date.parse(programStartDate)) / 86400000)`; index into the locale-filtered, display_order-sorted list at `daysSinceStart % count`.

### Weekly plan seed builder + seed runner

- [ ] T058 [US1] Create `seed/weeklyPlan.seed.js`: export `function buildWeeklyPlanForAthlete({ exercisesByMuscleGroup })` returning an array of 5 day objects, each with `{ day_of_week, muscle_group, display_order, exercises: [exerciseId, ...] }`. Mapping: `1: 'Chest+Triceps'`, `2: 'Back+Biceps'`, `3: 'Legs Quads'`, `5: 'Shoulders+Traps'`, `6: 'Legs Hams+Glutes'`. Pick 4–6 exercises per day from `exercisesByMuscleGroup` matching the muscle group prefix (e.g. for `'Chest+Triceps'` pick all exercises whose `muscle_group` is `'Chest'` or `'Triceps'`). `display_order` increments 1..5 by `day_of_week` order.
- [ ] T059 [US1] Create `seed/runSeed.js`: export `function runSeed({ db, logger })`:
    1. Begin transaction (`db.transaction(...)()`).
    2. Insert seededAthlete via athlete model `findByEmail` then `insert` if absent. Capture athleteId.
    3. Read each `seed/*.seed.json` (`exercises`, `foods`, `supplements`, `trainingPhases`, `nutritionTemplate`, `quotes`); for each row, call the appropriate model's `insert({ athleteId, locale: 'fr-FR', ...row })`. Catch `SQLITE_CONSTRAINT_UNIQUE` and skip.
    4. Build `exercisesByMuscleGroup` map from inserted exercises.
    5. Run `buildWeeklyPlanForAthlete({ exercisesByMuscleGroup })`; insert slots and slot-exercises via `weeklyPlan.model`.
    6. Commit. Log row counts per table at info level.
    (Implements **FR-001**, **FR-011**, **FR-012**.)

### Controllers (read-only)

- [ ] T060 [US1] Create `controllers/athlete.controller.js`: `export function createAthleteController({ athleteModel }) { return { getCurrent(req, res) { const row = athleteModel.findById(req.athleteId); if (!row) return res.status(404).json({ error: { code:'NOT_FOUND', message:'athlete not found' }, request_id: req.id }); res.json({ ...row, equipment: JSON.parse(row.equipment_json || '[]'), injuries: JSON.parse(row.injuries_json || '[]'), equipment_json: undefined, injuries_json: undefined, password_hash: undefined }); } }; }`. Response shape matches **contract** AthleteProfile (strip internal columns).
- [ ] T061 [P] [US1] Create `controllers/exercises.controller.js` with `list(req,res)` and `getOne(req,res)` mapped to model `listForAthlete` and `findById`. On `getOne` with no row, return 404 with the standard error envelope.
- [ ] T062 [P] [US1] Create `controllers/weeklyPlan.controller.js` mapped to model `getForAthlete`.
- [ ] T063 [P] [US1] Create `controllers/trainingPhases.controller.js` mapped to `listForAthlete`.
- [ ] T064 [P] [US1] Create `controllers/nutrition.controller.js` exporting `getTemplate(req,res)` mapped to `nutritionTemplate.listForAthlete`.
- [ ] T065 [P] [US1] Create `controllers/supplements.controller.js` mapped to `supplement.listForAthlete`.
- [ ] T066 [P] [US1] Create `controllers/foods.controller.js` exporting `list(req,res)` reading `req.query.q` and `req.query.limit` (parse int; default 50; max 200) and calling `food.searchForAthlete`.
- [ ] T067 [P] [US1] Create `controllers/quotes.controller.js` exporting `getToday(req,res)` calling `quote.pickRotatingForAthlete({ athleteId: req.athleteId, locale: 'fr-FR', dateIso: new Date().toISOString().slice(0,10), programStartDate: athleteModel.findById(req.athleteId).program_start_date })`.

### Routes (thin)

- [ ] T068 [P] [US1] Create `routes/athlete.routes.js`: `import { Router } from 'express'; export function athleteRoutes(ctrl) { const r = Router(); r.get('/', (req,res)=>ctrl.getCurrent(req,res)); return r; }`.
- [ ] T069 [P] [US1] Create `routes/exercises.routes.js` mapping `GET /` → `ctrl.list` and `GET /:id` → `ctrl.getOne`.
- [ ] T070 [P] [US1] Create `routes/weeklyPlan.routes.js` mapping `GET /` → `ctrl.get`.
- [ ] T071 [P] [US1] Create `routes/trainingPhases.routes.js` mapping `GET /` → `ctrl.list`.
- [ ] T072 [P] [US1] Create `routes/nutrition.routes.js` mapping `GET /template` → `ctrl.getTemplate`.
- [ ] T073 [P] [US1] Create `routes/supplements.routes.js` mapping `GET /` → `ctrl.list`.
- [ ] T074 [P] [US1] Create `routes/foods.routes.js` mapping `GET /` → `ctrl.list`.
- [ ] T075 [P] [US1] Create `routes/quotes.routes.js` mapping `GET /today` → `ctrl.getToday`.

### Wire-up

- [ ] T076 [US1] Update `app.js` (from T039) to construct models + controllers + routers and mount them under `/api/v1/`. Order: `app.use('/api/v1/athlete', athleteRoutes(...))`, then exercises, weekly-plan, training-phases, nutrition, supplements, foods, quotes. Mount routers AFTER the auth + tenant-scope middleware and BEFORE the error handler. (Implements **FR-004**, **SC-009**.)
- [ ] T077 [US1] Update `server.js` (from T040) to call `runSeed({ db, logger })` AFTER `runMigrations` and BEFORE `createApp`. (Implements **FR-001**.)

### Tests for User Story 1

- [ ] T078 [US1] Integration test `tests/integration/firstLaunch.test.js`: in `beforeAll`, create a temp file DB, build config with `DB_PATH = tempFile, SINGLE_USER_MODE: true`, run migrations + seed, build app via `createApp`. Use Supertest to assert: (a) `GET /api/v1/athlete` 200 with `email = 'athlete@masslab.local'`; (b) `GET /api/v1/exercises` 200 with body length ≥ 18; (c) `GET /api/v1/weekly-plan` 200 with `days.length === 5`; (d) `GET /api/v1/training-phases` 200 with length === 3; (e) `GET /api/v1/nutrition/template` 200 with length === 5; (f) `GET /api/v1/supplements` 200 with length === 5; (g) `GET /api/v1/foods` 200 with length ≥ 50; (h) `GET /api/v1/quotes/today` 200 with `text` non-empty. (Implements **US1** acceptance scenarios 1–4.)

**Checkpoint US1 done**: `npm start` boots a working seeded API; `npm test -- tests/integration/firstLaunch.test.js` passes; the application is independently demoable.

---

## Phase 4: User Story 2 — Tenant-Isolated Data From Day One (P1)

**Goal**: Prove the schema and model layer scope every read/write by `athlete_id`.

**Independent Test**: Insert a hypothetical second athlete; verify the first athlete's data is not returned for the second's queries, and vice versa.

- [ ] T079 [US2] Audit each model file (T050–T057) and add at the top of every exported function a JSDoc line `@param {number} athleteId — required by Constitution I`. Confirm every SQL `SELECT`, `INSERT`, `UPDATE`, `DELETE` includes `athlete_id` either in the `WHERE` clause or as an inserted column. (No code change if already correct; this task is the audit + documentation.)
- [ ] T080 [US2] Integration test `tests/integration/tenantScoping.test.js`: same setup as T078; after seed completes, insert a SECOND athlete directly via raw SQL with `id=2, email='other@masslab.local'`; insert ONE exercise for athlete_id=2 via raw SQL. Then via the model: (a) `exerciseModel.listForAthlete({ athleteId: 1, locale: 'fr-FR' })` length === number of seeded exercises (no leak from athlete 2); (b) `exerciseModel.listForAthlete({ athleteId: 2, locale: 'fr-FR' })` length === 1; (c) `weeklyPlanModel.getForAthlete({ athleteId: 2, locale: 'fr-FR' })` returns `{ days: [] }`. (Implements **US2** acceptance scenario 3.)
- [ ] T081 [US2] Integration test `tests/integration/schemaTenant.test.js`: open the seeded DB; for each of these tables — `exercises, weekly_plan_slots, weekly_plan_slot_exercises, training_phases, nutrition_template_meals, supplements, supplement_intakes, foods, quotes, sessions, sets, body_measurements, athlete_photos, recovery_logs, app_config` — run `PRAGMA table_info(<table>)` and assert one row has `name === 'athlete_id'` and `notnull === 1`. (Implements **SC-002**, **US2** acceptance scenario 1.)

**Checkpoint US2 done**: tenant-scoping is verified at both schema and model layer.

---

## Phase 5: User Story 3 — Multi-User Mode Activates Without Code Changes (P2)

**Goal**: Flipping `SINGLE_USER_MODE=false` in `.env` flips the auth middleware behavior with no source change.

**Independent Test**: With flag true, requests succeed and resolve to seeded athlete; with flag false, same requests are rejected 401.

- [ ] T082 [P] [US3] Integration test `tests/integration/authModeSwitch.test.js`:
    - Sub-test A: build app with `config.SINGLE_USER_MODE = true`; `GET /api/v1/athlete` returns 200 with the seeded athlete.
    - Sub-test B: build app with `config.SINGLE_USER_MODE = false`; `GET /api/v1/athlete` returns 401 with body `{ error: { code: 'UNAUTHORIZED', message: 'Authentication required' }, request_id: <uuid string> }`. Assert `request_id` is a UUID.
    - No source files changed between the two sub-tests; only the config object differs. (Implements **US3** acceptance scenarios 1, 2, 3.)
- [ ] T083 [P] [US3] Lint test `tests/integration/configFlagOnly.test.js`: shell out to `git grep -n 'SINGLE_USER_MODE' -- ':!*.env*' ':!services/config/' ':!specs/' ':!tests/integration/configFlagOnly.test.js' ':!README.md'` (via `child_process.execSync`); assert the output is empty. Confirms no other source file reads the flag directly.
- [ ] T084 [US3] Add a "Switching modes" section to `README.md` that shows the `.env` line change and `npm start` restart, citing **FR-005** and **SC-003**. (Required for story completion.)

**Checkpoint US3 done**: mode switch is config-only, verified by automated test.

---

## Phase 6: User Story 4 — One-Command Startup on a Fresh Machine (P3)

**Goal**: Bringing the app online from a clean checkout takes ≤5 minutes (per **SC-001**).

**Independent Test**: From a fresh clone, run install + start; reach the running app at the configured URL.

- [ ] T085 [P] [US4] Create/finalize `README.md` at repo root with: a one-paragraph project intro pointing to PLAN.md and `specs/001-phase0-foundation/`; the "Prerequisites" and "Steps" sections from `quickstart.md`; the "Switching modes" section (from T084); a "Troubleshooting" section (port in use, permission denied, re-seed). Reference `specs/001-phase0-foundation/quickstart.md` for the canonical version.
- [ ] T086 [P] [US4] Smoke test `tests/integration/freshStart.test.js`: in `beforeEach` create a fresh temp directory; copy `.env.example` content into a temp `.env`-shaped object; programmatically call `loadConfig` with overrides for `DB_PATH` and `PHOTO_STORAGE_ROOT` pointing into the temp dir; call `runMigrations` then `runSeed`; assert no thrown errors and that `db.prepare('SELECT COUNT(*) AS c FROM athletes').get().c === 1`. (Implements **US4** acceptance scenarios 1, 2.)
- [ ] T087 [US4] Add `package.json` script `"setup": "cp -n .env.example .env"` (already added in T002) and verify it appears in README (cross-check against T085).

**Checkpoint US4 done**: a new operator can reach the running app in ≤5 minutes.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T088 [P] Contract test `tests/contract/api.v1.test.js`: load `specs/001-phase0-foundation/contracts/openapi.yaml` (use the `yaml` package). For each `paths.<route>.<method>.responses.<code>.content.application/json.schema`, hit the running test app via Supertest and validate the response body against the schema using `ajv` + `ajv-formats`. Cover all 9 endpoints. Fail loudly on any 4xx/5xx unexpected by the contract or any schema mismatch. (Implements **FR-004**, **SC-009**.)
- [ ] T089 [P] Integration test `tests/integration/requestId.test.js`: capture the pino stream (use a custom write target). `GET /api/v1/athlete`. Assert: response header `X-Request-Id` is a UUID; the captured log includes one entry with `msg === 'http_request'` whose `request_id` equals the response header value. Same test repeats with `SINGLE_USER_MODE=false` to confirm the 401 also produces a log entry with a `request_id`. (Implements **FR-018**, **FR-019**, **SC-010**.)
- [ ] T090 [P] Performance check `tests/integration/performance.test.js` (mark `.skip` if `process.env.CI === 'true'`): boot the app once, send 100 sequential `GET /api/v1/exercises` requests, measure latencies; assert p95 ≤ 50 ms. (Validates **plan** § Performance Goals.)
- [ ] T091 [P] Static check `tests/integration/noLeakedAthleteData.test.js`: shell out via `child_process.execSync('grep -RE "(173|58|29|ectomorph|athlete@masslab.local|Athlete\\b)" --exclude-dir=node_modules --exclude-dir=specs --exclude-dir=seed --exclude=.env.example .')`; assert the command returns exit code 1 (no matches). (Implements **SC-007**, **FR-013**.)
- [ ] T092 [P] Run `npm run lint` and `npm run format`; fix any reported issues. Re-run until both succeed with zero errors.
- [ ] T093 [P] Update `quickstart.md` with any divergence found during implementation (e.g. exact `npm install` lines, log examples). Keep section headings unchanged.
- [ ] T094 Final verification — run `npm run test:run` and confirm all suites pass. Then run `rm -rf data/masslab.db && npm start` and confirm a clean boot in <30 s with the startup summary log line printed.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup, T001–T009)** — no dependencies.
- **Phase 2 (Foundational, T010–T040)** — depends on Phase 1.
- **Phase 3 (US1, T041–T078)** — depends on Phase 2.
- **Phase 4 (US2, T079–T081)** — depends on Phase 3 (needs models + seed).
- **Phase 5 (US3, T082–T084)** — depends on Phase 2 only (auth middleware + app composition); can run in parallel with Phase 3 if desired, but T076 (mounting routes) must already exist for the integration test to hit endpoints, so practically run after Phase 3.
- **Phase 6 (US4, T085–T087)** — depends on Phases 1–3 (the project must boot end-to-end).
- **Phase 7 (Polish, T088–T094)** — depends on all user stories complete.

### Within Phase 3 (US1) — task ordering rules

- T041 (test) MUST be written and FAIL before T042 (program generator implementation) — Constitution V.
- Migration tasks T017–T029 in Phase 2 must complete before any model task in Phase 3 (T050–T057), because models require the schema to exist.
- Seed-data JSON files (T043–T048) and `seededAthlete` (T049) must exist before `runSeed.js` (T059).
- Models (T050–T057) must exist before controllers (T060–T067).
- Controllers must exist before routes (T068–T075).
- Routes must exist before app wire-up (T076).
- App wire-up + seed wire-up (T076–T077) must exist before the integration test (T078).

### Parallel opportunities

- All `[P]` tasks within a phase run in parallel.
- All migration files (T017–T029) are mutually independent; can be written in parallel.
- All seed JSON files (T043–T048) are mutually independent.
- All models (T050–T057) are mutually independent.
- All controllers (T060–T067) are mutually independent.
- All routes (T068–T075) are mutually independent.
- All polish tests (T088–T091) are mutually independent.

---

## Parallel Execution Examples

### Phase 2: writing all 13 migrations at once

```text
Task: "Create migrations/0001_init_athletes.sql per data-model § athletes"
Task: "Create migrations/0002_init_exercises.sql per data-model § exercises"
... (all 13 migrations, T017–T029)
```

### Phase 3: writing all seed JSON files at once

```text
Task: "Create seed/exercises.seed.json with 18 French exercises"
Task: "Create seed/foods.seed.json with 50 French foods"
Task: "Create seed/supplements.seed.json with 5 supplements"
Task: "Create seed/trainingPhases.seed.json with 3 phases"
Task: "Create seed/nutritionTemplate.seed.json with 5 meals"
Task: "Create seed/quotes.seed.json with 30 French quotes"
```

### Phase 3: writing all models, controllers, and routes in parallel waves

```text
# Wave 1 (after migrations + seed JSON exist)
Task: "Create models/athlete.model.js"
Task: "Create models/exercise.model.js"
... (all 8 models)

# Wave 2 (after models exist)
Task: "Create controllers/athlete.controller.js"
... (all 8 controllers)

# Wave 3 (after controllers exist)
Task: "Create routes/athlete.routes.js"
... (all 8 routes)
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 + Phase 2 (setup + foundational).
2. Phase 3 (US1): test-first program generator → seed data → models → controllers → routes → wire-up.
3. **STOP and VALIDATE**: run `npm start`, hit each endpoint manually, run `tests/integration/firstLaunch.test.js`.
4. Demo-ready.

### Incremental delivery

1. After US1 ships, add US2 (tenant scoping audit + tests).
2. Then US3 (mode switch tests + README update).
3. Then US4 (README finalisation + fresh-start smoke test).
4. Polish (Phase 7) last.

### Smaller-LLM-friendly notes

- Each task names the **exact file path** and **exact import paths**.
- Library versions are pinned in T002–T004 so the implementing model does not need to research compatibility.
- All response shapes match `specs/001-phase0-foundation/contracts/openapi.yaml`; if in doubt, the contract is canonical.
- All schema details live in `specs/001-phase0-foundation/data-model.md`; the implementing model should treat it as the source of truth and not re-derive table shapes from the spec text.
- Whenever a task says "per **data-model** §X", read that section verbatim and copy the column list exactly.
- Tests in T041 must FAIL before T042 is implemented — this is mandated by Constitution Principle V and is the only ordering rule that cannot be relaxed.

---

## Notes

- `[P]` tasks operate on different files — safe to run concurrently.
- `[Story]` tags map tasks to spec.md user stories for traceability.
- Each user story phase ends with a checkpoint that an LLM (or human) can demo independently.
- Verify tests fail before implementation only for T041; other tests are written alongside or after their target code.
- Commit after each task or logical group (the `after_implement` git hook can auto-commit if enabled).
- Stop at any checkpoint to validate the story independently.
