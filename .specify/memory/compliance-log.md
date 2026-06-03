# Constitution Compliance Log

Per `constitution.md` §"Compliance review", the team audits the codebase against
each principle once per implementation-phase milestone. This file is the running
log. One entry per phase; each entry records the audit date, principles
reviewed, findings, and remediation status.

---

## Phase 2 — Settings & Data Management (2026-05-10)

**Audit method**: four-pass code review using the `code-reviewer` skill.

- Pass 1 — architectural boundaries / Constitution compliance
- Pass 2 — data layer (migrations, RLS, DAOs)
- Pass 3 — pure-logic modules (`services/engine/`, `services/dataManagement/`)
- Pass 4 — HTTP surface + frontend

**Branch reviewed**: `003-phase2-settings-data` at commit `e36a61d`.

### Findings summary

| Severity | Count | Status                                                               |
| -------- | ----- | -------------------------------------------------------------------- |
| BLOCKER  | 0     | —                                                                    |
| HIGH     | 2     | ✅ both closed in PR #4 (`127bbe4`)                                  |
| MEDIUM   | 12    | 1 closed (Pass 2 M-1, atomic restore via Postgres function), 11 open |
| LOW      | 18    | 4 closed in PR #4; 14 open                                           |

### Closed in PR #4 (`004-phase2-hardening`, merged 2026-05-10)

- **Pass 2 H-1** — seed prune predicate narrowed to `is_active = false AND not referenced`. User-created active rows survive seed re-runs.
- **Pass 3 H-1** — `services/engine/macros.js` `source` map: `daily_protein_g` correctly stays `engine` under calorie-only override (protein is independent of `daily_kcal`). New unit test pins the invariant.
- **Pass 2 M-1** — `services/dataAccess/importers.dao.replaceAllForAthlete` now delegates to `public.replace_athlete_dataset(uuid, jsonb)` Postgres function — atomic restore via single transaction.
- **Pass 4 L-3** — `apiGetBlob` helper parses canonical error envelope on non-2xx for non-JSON downloads.
- **Pass 4 L-5** — `setAuthTokenProvider` plumbing wires bearer tokens through every helper (no-op until multi-user mode flips on).
- Pass 1 follow-up — `services/dataAccess/exercises.dao.patch` no longer rederives slug from name (matches the muscleGroups DAO fix).

### Closed in Polish PR (`005-phase2-polish`, this PR)

- **T099** — ESLint config migrated to v9 flat (`eslint.config.js`); old `.eslintrc.cjs` removed; Prettier run across 110 files; two unused-import warnings cleaned.
- **T100** — `console.log` audit: zero hits in production source. ✅
- **T101** — `@supabase/supabase-js` import audit: only `services/dataAccess/supabaseClient.js` imports the SDK in production; tests have allowed exceptions in `tests/integration/rls.policies.test.js` and `tests/integration/settings.muscleGroups.rls.test.js`. ✅
- **T102** — RLS coverage: every `create table public.*` in `supabase/migrations/` is followed by `enable row level security` + a policy pair (single `_self` variant for `athletes` and `app_config` is intentional and documented). 30/30 migrations clean. ✅
- **T104** — `tests/integration/README.md` adds the SC-001…SC-012 mapping table.

### Still open (track for Phase 2 hardening II)

#### MEDIUM (11)

| Pass | ID  | Topic                                                                                                                    |
| ---- | --- | ------------------------------------------------------------------------------------------------------------------------ |
| 1    | M-1 | Engine `now=new Date()` defaults (`oneRepMaxTrend.js:8`, `progressionEngine.js:159`) leak time                           |
| 1    | M-2 | Phase 0 bulk-upsert DAOs accept caller-supplied `athlete_id` without server-side stamping                                |
| 2    | M-2 | `weeklyPlan.dao.replaceSchedule` non-atomic (same RPC pattern as M-1)                                                    |
| 2    | M-3 | `muscleGroups.dao.merge` partial-failure window (repoint succeeds, archive fails → orphaned active source)               |
| 2    | M-4 | Three soft-delete shapes; only one documented in `CLAUDE.md`                                                             |
| 3    | M-1 | `programGenerator.js` silently defaults missing `morphotype` / `goal`                                                    |
| 3    | M-2 | `dataManagement` modules embed `new Date().toISOString()` for response timestamps                                        |
| 3    | M-3 | `macros.js` no energy-balance sanity warn on per-macro overrides                                                         |
| 4    | M-1 | `beforeunload` guard only on `ProfileSettings`; `ScheduleSettings` / `PreferencesSettings` lose draft state on tab close |
| 4    | M-2 | `ExerciseManager` uses `window.confirm()` instead of in-app `ConfirmDialog`                                              |
| 4    | M-3 | DataSettings reset `<a>.click()` won't fire on Safari without DOM insertion                                              |

#### LOW (14)

| Pass | ID  | Topic                                                                                                   |
| ---- | --- | ------------------------------------------------------------------------------------------------------- |
| 1    | L-1 | `routes/dataManagement.routes.js:10` literal `26214400` fallback duplicates schema default              |
| 1    | L-2 | `RESET-MASSLAB` literal in `frontend/src/pages/settings/DataSettings.jsx:5`                             |
| 1    | L-3 | Athletes-table single-policy variant deviates from documented pair pattern (functionally equivalent)    |
| 1    | L-4 | `app.js:88` root-mount of `athleteRoutes` — fragile alias for `/me`                                     |
| 2    | L-1 | `weeklyPlan.dao.reorderSlotExercises` bump-by-1000 fragile beyond 999 exercises                         |
| 2    | L-2 | Seed prune uses raw supabase client (now extracted to DAO method via Pass 2 H-1 fix — partially closed) |
| 2    | L-3 | App-config single-policy variant — same as Pass 1 L-3                                                   |
| 2    | L-4 | Migration timestamp drift: local `20260508000000` vs cloud `20260508142447` (cosmetic)                  |
| 3    | L-1 | `CSV_SEPARATOR` schema accepts 1–2 chars; RFC 4180 specifies single                                     |
| 3    | L-2 | No UTF-8 BOM on CSV export (Excel-Windows compatibility)                                                |
| 3    | L-3 | `backupSchema` requires only 6 of 18 collections                                                        |
| 3    | L-4 | `migrateChain` no-op when `from > to` instead of erroring                                               |
| 3    | L-5 | `services/engine/auditWriter.js` and `backupMigrators/index.js` lack dedicated unit tests               |
| 4    | L-1 | CORS doesn't expose `Content-Disposition`                                                               |
| 4    | L-2 | `ImportResult.counts` returned but not in OpenAPI                                                       |
| 4    | L-4 | Phase 0 contract test doesn't cover Phase 2 surface                                                     |

### Principle scorecard

| Principle                                                    | Status | Notes                                                                                        |
| ------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------- |
| I — Multi-tenant data model + RLS in same migration          | ✅     | All 30 migrations clean.                                                                     |
| II — Layered architecture / `@supabase/supabase-js` boundary | ✅     | Only `dataAccess/supabaseClient.js` imports the SDK in production.                           |
| III — Configuration over hardcoding                          | ⚠️     | Two minor literal duplications (LOW).                                                        |
| IV — Versioned API contract `/api/v1/`                       | ✅     | All 22 Phase 2 paths under v1 with canonical `{ data }` envelope.                            |
| V — Test-first / engine purity                               | ⚠️     | Two engine modules + three dataManagement orchestrators leak time via `new Date()` defaults. |
| VI — Athlete-first UX                                        | ⚠️     | Schedule/Preferences screens missing dirty-guard (Pass 4 M-1).                               |

### Action

No principle violations rise to BLOCKER. The four MEDIUM items in the
"atomicity + dirty-guard + UX consistency" cluster are tracked for a
**Phase 2 hardening II** PR before any multi-user expansion.
The LOW items map to operational standards drift; address opportunistically
in the phases that touch those modules.

**Compliance signed off for Phase 2.** Next audit: end of Phase 3.

---

---

## Phase 3 — Training Program & Exercise Library (2026-06-02)

**Audit method**: incremental review during `/speckit-implement` (US1–US4), tests-first for domain logic.

- **I. Tenant-ready data model** — PASS. New `exercise_alternatives` carries `athlete_id NOT NULL` + ships `*_select_own`/`*_modify_own` RLS in its migration. New `sessions.dao.js` is read-only and always parameterised by `req.athleteId`. No endpoint trusts a body-supplied tenant id.
- **II. Layered architecture** — PASS. `services/trainingProgram/*` + `services/engine/*` are pure (no Supabase import); the two new DAOs are the only Phase 3 Supabase importers. Controllers stay thin; the shared YouTube normalizer lives once in `mediaClassifier.js` (read + write paths reuse it).
- **III. Config over hardcoding** — PASS. `EXERCISE_MEDIA_MAX_BYTES`, `EXERCISE_MEDIA_IMAGE_TYPES`, `EXERCISE_MEDIA_VIDEO_TYPES`, `YOUTUBE_EMBED_HOST`, `PHOTO_STORAGE_ROOT` added with defaults + `.env.example`. No hardcoded limits/hosts in services.
- **IV. Versioned API** — PASS. All new paths under `/api/v1/`; additive `{ data }` / canonical-error envelopes; deletes/clears return 204.
- **V. Test-first for domain logic** — PASS. `exerciseHistory`, `loadRecommendation`, `oneRepMax` detail-feed invariant, and the three presenters are unit-tested; last-weight / 1RM / load-rec verified end-to-end (live insert→assert→cleanup). UI ships smoke tests.
- **VI. Athlete-first UX** — PASS. Three screens via Tailwind tokens, ≤2-tap nav, designed empty states.

**Findings / follow-ups**:
- T005 (apply `exercise_alternatives` migration to the cloud project) is OUTSTANDING — needs Supabase access-token/DB-password not available to the agent. US3/US4 alternatives contract+integration tests probe-skip until applied.
- **Localization seam** (Operational Standard): new frontend copy is hardcoded French, consistent with the pre-existing Phases 1–2 pattern — project-wide deviation, tracked, not introduced by Phase 3.
- Pre-existing frontend test failures (`scaffold.test.jsx`, `nutritionView.test.jsx`) predate Phase 3 (files untouched); flagged for a separate fix.

---

## Phase 4 — Session Journal (2026-06-02)

**Audit method**: `/speckit-implement` (US1–US4), tests-first for every number-producing function; full backend suite (281) + Phase 4 frontend smoke (6) green.

- **I. Tenant-ready data model** — PASS. No new table; the added `session_journal_entries.day_of_week` column inherits the existing `session_journal_*_own` RLS; the `session_sets` uniqueness change does not touch RLS. Every new DAO write method is parameterised by `req.athleteId`; no endpoint trusts a body-supplied tenant id. `rls.policies.test.js` extended (T055) to assert session-table read + write isolation.
- **II. Layered architecture** — PASS. Only the new write methods in `services/dataAccess/sessions.dao.js` import Supabase; `services/sessionJournal/*` + `services/engine/{sessionTotals,personalRecords,bodySegment}.js` are pure. The `bodySegment` derivation was extracted from `progressionFlags.controller.js` so both share one source (no duplication).
- **III. Config over hardcoding** — PASS. The one tunable (auto-save cadence) is a frontend Vite var `VITE_SESSION_AUTOSAVE_INTERVAL_MS` (default 30000 in `sessionConfig.js`); no backend key. Rest intervals come from `training_phases.rest_seconds`; load increments from `resolveConstants`.
- **IV. Versioned API** — PASS. All paths under `/api/v1/sessions`; additive `{ data }` / canonical-error envelopes; 201 create, 204 delete, 409 named conflicts (`ACTIVE_SESSION_EXISTS`, `SESSION_ALREADY_FINISHED`).
- **V. Test-first for domain logic** — PASS. `sessionTotals`, `personalRecords`, `bodySegment`, `calendar`, `currentPhase`, and the `sessionView`/`summaryView` presenters are unit-tested (27 new unit tests). Finish-time engine side effects covered by gated integration tests. UI ships smoke tests (steppers, timers, audio cues, resume/stale).
- **VI. Athlete-first UX** — PASS. This is the phase Principle VI targets: one-handed logging (±2.5 / ±1 QuickStepper), auto-save ≥30 s + on-completion, live session timer + rest timer with audio cues (silent fallback), designed empty/resume/summary states via Tailwind tokens.

**Findings / follow-ups**:
- T004 (apply migrations `20260602000002`/`20260602000003` to the cloud project) is OUTSTANDING — applying DDL to the production Supabase project requires explicit user authorization (the auto-mode classifier correctly blocked `supabase db push`). Session contract/integration tests probe-skip on the `day_of_week` column until applied; T053 (quickstart validation) is blocked on the same.
- **Localization seam**: new frontend copy is hardcoded French, consistent with Phases 1–3 — project-wide deviation, tracked, not introduced here.

---

## Phase 5 — Load Tracking & Progression Algorithm (2026-06-02)

**Audit method**: `/speckit-implement` (US1–US3), tests-first for every number-producing function; full backend suite (310) + Phase 5 frontend smoke (6) green; load-tracking contract + consistency verified live against the cloud project.

- **I. Tenant-ready data model** — PASS. No new table, no migration. Every read is parameterised by `req.athleteId` over already-RLS-protected tables; no endpoint trusts a body-supplied tenant id. The consistency integration test asserts a load-tracking GET returns only the athlete's data.
- **II. Layered architecture** — PASS. Two read-only methods added to existing DAOs are the only Supabase touch; `services/loadTracking/*`, `services/engine/trendProjection.js`, and `frontend/src/lib/chartGeometry.js` are pure (no I/O, caller-supplied `now`). `phaseForDate` extracted from `currentTrainingPhase` (one source of truth).
- **III. Config over hardcoding** — PASS. No new config. Algorithm constants (8-week horizon, ≥3-point floor, 30-day window, 1% flat band) are documented constants in the pure helpers; the 1% dead-band is explicitly decoupled from the engine's `on_pace_pct_per_month`.
- **IV. Versioned API** — PASS. Three additive read endpoints under `/api/v1/load-tracking`; `{ data }` envelope; 200/404. No existing contract changed.
- **V. Test-first for domain logic** — PASS. `statusMap`, `trendDirection`, `projectOneRm`, the three presenters, `phaseForDate`, and the `chartGeometry` functions (incl. `radarPolygon`) are unit-tested. 1RM/progression reuse already-tested Phase 1/4 output. UI ships smoke tests.
- **VI. Athlete-first UX** — PASS. Overview/detail/radar each answer a real post-session question; hand-rolled SVG charts over Tailwind tokens keep the premium look (no generic chart library); empty/low-data states are designed.

**Findings / follow-ups**:
- READ-ONLY confirmed: a load-tracking GET appends no `progression_flags` / `one_rep_max_records` / `calculation_results` rows (asserted in `tests/integration/loadTracking.consistency.test.js`).
- **Localization seam**: new frontend copy is hardcoded French, consistent with Phases 1–4 — project-wide deviation, tracked, not introduced here.
