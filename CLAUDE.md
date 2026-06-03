<!-- SPECKIT START -->

For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:

- specs/010-phase7-nutrition-calories/plan.md
<!-- SPECKIT END -->

## Folder Layout (Phase 0)

```
routes/                  /api/v1/* HTTP shells (no business logic)
controllers/             one per route file; orchestrate, never query the DB directly
services/                pure business logic (program generator, calculators)
services/dataAccess/     ONLY directory allowed to import @supabase/supabase-js
services/photoStorage/   put/get/delete/url adapter — filesystem default
middleware/              requestId → requestLogger → auth → errorHandler
config/                  zod schema · dotenv adapter · loadConfig()
supabase/migrations/     forward-only timestamped SQL; each ships its RLS
seed/                    athlete + JSON catalogues + idempotent runSeed.js
frontend/                React + Vite + Tailwind workspace member
tests/{unit,integration,contract,frontend}/
```

## Key Handling Rules

- `SUPABASE_SECRET_KEY` (`sb_secret_…`) **server-only**. Imported solely by `services/dataAccess/supabaseClient.js`.
- `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) is the only key that may cross to the frontend (used by future Supabase Auth flows).
- Legacy `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are **forbidden**; the config schema rejects them at boot with a named error.
- Secret-tagged keys (`SECRET_KEYS` in `config/schema.js`) are added to the pino redactor, so the startup log line never prints raw secrets.

## RLS Conventions

- Every domain table ships RLS in the same migration. Pattern (`research.md` §5):

  ```sql
  alter table <t> enable row level security;
  create policy <t>_select_own on <t>
    for select using (athlete_id in (select id from athletes where auth_user_id = auth.uid()));
  create policy <t>_modify_own on <t>
    for all
    using (athlete_id in (select id from athletes where auth_user_id = auth.uid()))
    with check (athlete_id in (select id from athletes where auth_user_id = auth.uid()));
  ```

- The application uses the secret-key client which bypasses RLS by design — the auth middleware is the **primary** tenant guard. RLS is defense-in-depth and exercised by `tests/integration/rls.policies.test.js` using a per-test JWT against the publishable-key client.

## Lint Rules

- ESLint at repo root (backend); frontend extends Vite's defaults.
- Prettier (`.prettierrc`) is the single formatter — width 100, single quotes, trailing commas.
- A future custom lint rule should forbid `import '@supabase/supabase-js'` outside `services/dataAccess/` and `frontend/src/lib/`.

## Test Scaffolding

- `tests/unit/` — pure Node, no network. Includes the program-generator TDD spec.
- `tests/integration/` — boots `buildApp({ config, supabase })` against the local Supabase stack (skipped automatically when `.env` is missing or Supabase is unreachable).
- `tests/contract/` — drives every path in `specs/001-phase0-foundation/contracts/openapi.yaml` via Supertest.
- `tests/frontend/` — jsdom + React Testing Library, runs through `frontend/vitest.config.js` so Vite plugins resolve correctly.

## Constitution

`./.specify/memory/constitution.md` v1.1.1. Non-negotiables: tenant-ready data model, layered architecture (no Supabase imports outside the data-access layer), config over hardcoding, versioned API (`/api/v1/`), test-first for domain logic, athlete-first UX.

## Phase 1 — Calculators Engine (added 2026-05-08)

- **Engine boundary**: every pure calculator lives under `services/engine/`. No `@supabase/supabase-js` imports in this directory or in `services/programGenerator.js` / `services/progressionEngine.js`.
- **Engine version pinning**: `services/engine/constants.js` exports `ENGINE_VERSION` (semver) and a frozen `DEFAULTS` map. Every persisted calculation row snapshots `engine_version` + `resolved_constants` so replays survive default changes. Bump rules: PATCH = rounding fix, MINOR = new calculator/optional input, MAJOR = behavioural change to an existing calculator.
- **Per-athlete overrides**: stored on `app_config.engine_overrides` (JSONB, defaults `{}`). The engine reads via `resolveConstants(override)` — defaults ⊕ override, deep-frozen.
- **Audit log**: `services/engine/auditWriter.js` is the single helper that appends a row to `calculation_results`. Called from every persisted-write path (program regenerate, 1RM record, body composition + measurement save, progression eval). NOT called from `/api/v1/calculators/*` ad-hoc endpoints (FR-029).
- **Soft-archive shapes**: `generated_programs` and `progression_flags` use `is_active` + `superseded_at`. Partial-unique indexes enforce "at most one active per scope" at the DB level.
- **Frontend routing**: `react-router-dom@^6` is wired in `frontend/src/App.jsx`. `/`, `/nutrition`, `/calculators`, and `/calculators/<slug>` are the Phase 1 routes. Phase 4's journal screen extends this.
- **Body measurement extension**: Phase 0's `body_measurements` table didn't include `neck_cm` / `hip_cm`. Phase 1 added migration `20260507000008_extend_body_measurements_neck_hip.sql` to support the U.S. Navy multi-measurement body-fat formula.

## Phase 3 — Training Program & Exercise Library (added 2026-06-02)

- **Read presenter boundary**: composed view models live under `services/trainingProgram/` (`weekView.js`, `dayView.js`, `exerciseView.js`, `mediaClassifier.js`) — pure, no `@supabase/supabase-js`. Controllers read DAOs and hand plain data to these presenters.
- **Read-only session history**: `services/dataAccess/sessions.dao.js` is the first reader of `session_journal_entries` + `session_sets` (Phase 4 owns the write path). Phase 3 never writes sessions (FR-026).
- **History-derived numbers** (test-first, `services/engine/`): `exerciseHistory.js` (`heaviestCompletedSet`, `feedSet`, `lastWeightUsed`, `recentSessions`), `loadRecommendation.js`. "Last weight" = heaviest **completed** set of the most recent session; the same feed set drives the 1RM estimate (`oneRepMax().primary_estimate_kg`) so the day row and detail page agree (SC-003). Load rec reuses the `add_load` flag's snapshotted `delta_kg`.
- **Progression indicator**: read from active `progression_flags` (`scope_ref = String(exercise_id)`); `add_load`→ready_to_increase, `regression`→regressing, else stable.
- **`/program/*` endpoints** are mounted as a SECOND router at `/api/v1/program` (after the program-generator router); paths are disjoint so unmatched requests fall through. `GET /program/week|day/:dayOfWeek|exercises/:id`.
- **Alternatives**: one new table `exercise_alternatives` (migration `20260602000001`), one-directional, `CHECK` no-self + unique no-dup, FK `ON DELETE CASCADE`, RLS in-file. DAO maps `23505`→409 CONFLICT.
- **Exercise media**: reuses `exercises.media_image_url` / `media_video_url`. Uploads go through the `photoStorage` adapter (root `PHOTO_STORAGE_ROOT`), served unauthenticated at `/static/*` so `<img>`/`<video>` can load them. YouTube videos are stored as URLs and normalized to `YOUTUBE_EMBED_HOST` by `mediaClassifier.normalizeYoutubeUrl` (shared by read + write paths). Size/type bounded by `EXERCISE_MEDIA_MAX_BYTES` / `EXERCISE_MEDIA_IMAGE_TYPES` / `EXERCISE_MEDIA_VIDEO_TYPES`.
- **Frontend**: `/program`, `/program/day/:dayOfWeek`, `/program/exercises/:id` in `App.jsx`. Live Supabase-backed contract/integration tests for the alternatives surface **probe for the `exercise_alternatives` table and skip until the migration is applied**.

## Phase 4 — Session Journal (added 2026-06-02)

- **Sole owner of the session WRITE path**: `controllers/sessions.controller.js` + `routes/sessions.routes.js` mounted at `/api/v1/sessions` (registered before `/one-rep-max-records`; `/active` is declared before `/:id`). Phase 3 stays read-only over what this phase writes. The write methods live on the existing `services/dataAccess/sessions.dao.js` (Phase 3 shipped its read side); `daos.sessions` was already wired in `app.js`.
- **Pure boundary**: composed view models + helpers live under `services/sessionJournal/` (`calendar.js` = `isoDayOfWeek`/`isSameAppDay`, `currentPhase.js` = `currentTrainingPhase`, `sessionView.js`, `summaryView.js`) — pure, no `@supabase/supabase-js`. New pure engine helpers: `services/engine/{sessionTotals,personalRecords,bodySegment}.js`. `bodySegment.js` is **extracted** from the old inline derivation in `progressionFlags.controller.js` and now shared by both (research D-6).
- **Today detection** = ISO calendar weekday (`isoDayOfWeek`, Mon=1…Sun=7) matched to `weekly_plan_slots.day_of_week`, NOT a `program_start_date` offset (D-1). **Current phase** = derived from `program_start_date` + cumulative phase `weeks` (D-8); its `rest_seconds` drives the rest timer — no `is_current` column.
- **Finish is the sole engine trigger** (D-6): `POST /sessions/:id/finish` discards incomplete sets (D-7), finalizes `ended_at`/`total_volume_kg`, then runs the Phase 1 engine exactly once — `evaluateForAthlete` → `progressionFlags.supersedeAndInsert`, `oneRepMax` → `oneRepMaxRecords.insert`, and `writeAudit` (one `one_rep_max` row per record + one `progression_eval`, both `reason:'session_finish'`). A **finish-once guard** (409 `SESSION_ALREADY_FINISHED`) + idempotent supersede make this safe without DB transactions. Auto-save (`PUT /sessions/:id/sets`) **never** runs the engine (D-5).
- **Schema**: two forward-only migrations on existing tables, **no new table** — `20260602000002` adds `session_journal_entries.day_of_week` (nullable 1–7) + a partial active-session index; `20260602000003` changes `session_sets` uniqueness to `(session_id, exercise_id, set_number)` for per-exercise numbering + extra/ad-hoc sets (D-3/D-4). RLS unchanged (existing `*_own` policies key on `athlete_id`). **Live contract/integration tests probe for the `day_of_week` column and skip until the migration is applied.**
- **Frontend**: `/journal` route + "Séance" nav in `App.jsx`. State machine in `lib/useSessionJournal.js` (idle/prompt/active/summary). One-handed `QuickStepper` (±2.5 kg / ±1 rep), `SessionTimer` (anchored to server `started_at`, D-12), `RestTimer` (Web Audio beeps via `lib/restTimerAudio.js`, silent fallback). Auto-save cadence is a **frontend Vite var** `VITE_SESSION_AUTOSAVE_INTERVAL_MS` (default 30000 in `frontend/src/lib/sessionConfig.js`) — no backend config key.

## Phase 5 — Load Tracking & Progression Algorithm (added 2026-06-02)

- **Read-only analytics layer** over Phase 4 data — **0 migrations, 0 new tables, no new dependency**. Three composed read endpoints at `/api/v1/load-tracking/*` (`overview`, `exercises/:id`, `phase-comparison`), mounted after `/sessions` in `app.js`. Pure presenter boundary `services/loadTracking/` (`statusMap.js`, `overviewView.js`, `exerciseProgressView.js`, `phaseRadarView.js`); controllers read DAOs and hand plain data to presenters. Never writes, never re-runs the engine (FR-022).
- **`one_rep_max_records` is the time series** (research D-1): one row per exercise per finished session — `source_weight_kg` (= heaviest completed set = current load + all-time record via max), `primary_estimate_kg` (= e1RM, drives trend + projection). New read `oneRepMaxRecords.seriesForAthlete`. Volume/last-10 come from `sessions.dao.recentSessionVolumesForExercise` (D-11).
- **Trend + projection** (pure `services/engine/trendProjection.js`, D-2/D-3): trend = signed e1RM change over the last **30 days**, `flat` when |Δ| ≤ **1%** (fixed dead-band, NOT `on_pace_pct_per_month`); 8-week projection = **least-squares linear fit** over the e1RM series, `null` below **3** points. The detail chart's primary line is the e1RM series (the projection extends it); working load is the secondary line; all-time record is the heaviest completed set, annotated (I1).
- **Status map** (`statusMap.js`, D-5): the 5 persisted `progression_flags` types → 4 per-exercise badges (`add_load`→ready, `regression`→regressing, muscle-group `stagnation`→stagnation when the exercise has no own actionable flag, else `maintain`) + a separate muscle-group **deload notice**.
- **Phase attribution** (D-7): `phaseForDate` extracted from `currentTrainingPhase` (which now delegates to it) buckets sessions by date; the radar (`phaseRadarView.js`, D-8) = avg per-day top working load per muscle group per phase.
- **Charts are hand-rolled SVG** (D-9): pure geometry in `frontend/src/lib/chartGeometry.js` (`linearScale`/`linePath`/`barRects`/`radarPolygon`/`niceTicks`, unit-tested) drives `components/charts/{LineChart,BarChart,RadarChart}.jsx`. No charting library. Frontend route tree `/load-tracking`, `/load-tracking/exercises/:id`, `/load-tracking/phases` + "Charges" nav.

## Phase 7 — Nutrition & Calories (added 2026-06-03)

- **Write-heavy phase — 3 new tables, RLS in-migration**: `nutrition_logs` (one row per food per meal-slot per day; `food_id`→`foods` **ON DELETE RESTRICT**; persists a **macro snapshot** `kcal/protein_g/carbs_g/fat_g` so past totals never shift when a catalogue food is edited — FR-003/SC-008), `hydration_log` (per-athlete-per-day counter, PK `(athlete_id, logged_on)`), `nutrition_template_meal_items` (concrete foods+grams per slot for "Load daily plan", seeded by `runSeed.js`). All ship `*_own` policies in-file (Constitution I). `nutrition_logs` finally backs the name the Phase 2 reset DAO already reserved — `reset.dao` `FULL_WIPE_ORDER` deletes the food-referencing children **before** `foods` (RESTRICT ordering).
- **Targets are read, never recomputed** (D-3/FR-008): daily kcal/macros come from the **shared** `services/nutrition/targets.js#resolveTargets({ daos, athleteId })` (extracted from `nutritionTargets.controller`, the single source consumed by the day view + trends + the targets endpoint). Food/water logging does **not** write the `calculation_results` audit log (it is summation, not an engine calculation — FR-029).
- **Custom food persists to the catalogue** (FR-002a): the `foods` table is athlete-writable here via `foods.dao.createForAthlete` (upsert on `(athlete_id, slug, locale)` using `services/nutrition/foodSlug.slugify`, so a duplicate name reconciles — no dup). `POST /nutrition/log` accepts `food_id` **or** an inline `custom_food` (create-then-log).
- **Load daily plan is non-destructive** (FR-011, clarification): `POST /nutrition/load-plan` requires `mode` (`replace`|`append`) on a non-empty day, else `409 LOAD_PLAN_CONFLICT` — never a silent overwrite. Hydration goal resolves `app_config.engine_overrides.hydration.goal_ml ?? HYDRATION_GOAL_ML` (per-athlete setter is a Phase 2 concern).
- **Pure boundary**: `services/engine/{nutritionMath,nutritionTrends}.js` (entryMacros/dayTotals/progress; caloriesByDay/macroBreakdown/**weeklyAvgProtein = mean daily protein/week**, D-7) + `services/nutrition/{foodSlug,targets,dayView,trendsView}.js` — all pure, test-first (Constitution V), no `@supabase` import. Controllers read DAOs and hand plain data to these presenters; the future-date guard reads the clock at the controller boundary (`isoDay(now())`), never inside a pure fn.
- **Endpoints** extend the existing `/api/v1/nutrition` router: `GET /day`, `POST/PATCH/DELETE /log`, `POST /load-plan`, `POST /hydration`, `GET /trends` (+ `POST /foods` custom-food create on the foods router). Config keys: `HYDRATION_GOAL_ML` (3000), `NUTRITION_TREND_DAYS` (30), `NUTRITION_LOCALE` (`fr-FR`).
- **Charts reuse Phase 5 SVG** + two new pure `chartGeometry` helpers `gaugeArc`/`donutSegments` (unit-tested) driving `components/charts/{HydrationGauge,DonutChart}.jsx`. Frontend `/nutrition` (day log: 4 bars, 5 meal slots, search, custom food, load-plan, hydration gauge) + `/nutrition/trends` (calories-30d + goal line, macro donut, weekly protein). Live contract/integration tests probe for `nutrition_logs` and **skip until migrations are applied**.
