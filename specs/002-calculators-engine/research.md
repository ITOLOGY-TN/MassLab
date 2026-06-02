# Phase 1 Research — Calculators Engine

**Feature**: 002-calculators-engine
**Date**: 2026-05-07
**Constitution**: v1.1.1

This document records the technical decisions taken for Phase 1 against the clarified spec. Every NEEDS CLARIFICATION from the Technical Context is resolved below; every clarification answer from `spec.md → ## Clarifications → Session 2026-05-07` is reflected as a "Decision".

## 1. Engine purity & determinism

**Decision**: Every calculator and the rule engine are exported as pure functions from modules under `services/engine/` and `services/progressionEngine.js`. They take explicit inputs (athlete profile snapshot, optional `resolved_constants`, optional `now` parameter for time-dependent rules) and return plain objects. No `Date.now()` reads, no `Math.random()`, no env reads, no Supabase imports.

**Rationale**:

- Constitution Principle V (test-first for domain logic) requires these functions be unit-testable in isolation. Pure functions with explicit time pass-through are straightforward to drive against historical fixtures.
- SC-002 requires identical outputs for identical inputs across 100 runs — only achievable if every clock and config read is parameterised.
- The clarified `calculation_results` audit table stores `inputs` and `resolved_constants` snapshots; replay = call the pure function with the stored snapshot and assert equality with the stored output.

**Alternatives considered**:

- Class-based services with injected dependencies. Rejected — adds ceremony for no benefit at this scale; pure functions are smaller and easier to test.
- Reading `now()` inside the engine and only making it injectable in tests. Rejected — splits "test path" and "prod path" and is exactly the trap that produces non-replayable bugs.

## 2. Engine constants storage (clarification 2026-05-07 #3)

**Decision**: Defaults live in `services/engine/constants.js` as a single frozen export. Per-athlete overrides live on `app_config.engine_overrides` as a JSONB column added in Phase 1. The engine reads via `resolveConstants(athleteId, daos.appConfig)` which returns `{ ...DEFAULTS, ...override }`. Every persisted calculation row stores the resolved snapshot in its `resolved_constants` JSONB column so historical replay reproduces the exact output even if the default or override later changes.

**Rationale**:

- Phase 1 ships zero override rows — every athlete uses defaults; the migration just adds the column. Phase 2's Settings UI is the first writer.
- A code constants module is the simplest source of truth and gets versioned through git history; reviewers see every default change in a normal diff.
- `app_config` already exists per athlete (Phase 0), already has RLS keyed on the athlete, and already has an `updated_at` trigger — extending it costs one migration with one new column.
- Snapshotting onto each calculation row is the only way historical replay survives a default change. Without the snapshot, a 6-month-old "we hit 90 % of 1RM" record could mean different absolute weights after a constant tweak.

**Alternatives considered**:

- Per-athlete `engine_overrides` table from day one. Rejected — every athlete needs exactly zero or one override row; one row per athlete is `app_config`'s pattern already.
- Global `engine_config` table. Rejected — single-tenant in Phase 1 but multi-tenant-ready architecture means every config decision must be per-athlete-scopable; global config is a future migration.
- Hard-coded only, no override path until Phase 2. Rejected — the migration is one column; deferring it means a Phase 2 schema-extension migration plus a code change instead of a code change alone.

## 3. Program supersession behaviour (clarification 2026-05-07 #1)

**Decision**: Soft-archive. The `generated_programs` table carries `is_active boolean not null default true` and `superseded_at timestamptz`. Regeneration is one transaction:

1. `update generated_programs set is_active = false, superseded_at = now() where athlete_id = $1 and is_active = true;`
2. `insert into generated_programs (athlete_id, payload, generated_at, is_active) values ($1, $2, now(), true);`

A partial-unique index `unique (athlete_id) where is_active = true` enforces "at most one active program per athlete" at the DB level. History is read by `select * from generated_programs where athlete_id = $1 order by generated_at desc`.

**Rationale**:

- The clarification answer (B) explicitly chose soft-archive.
- The unique-where-active index makes the invariant visible in the schema and survives any DAO bug.
- One row per regeneration is bounded; the seeded athlete will produce a handful per year, not thousands.

**Alternatives considered**:

- Hard delete (option A in the clarification). Rejected at clarification time.
- Full immutable version log with monotonic version numbers (option C). Rejected — adds a sequence column for no read-side benefit; `generated_at desc` already orders history, and the only "version number" question that matters in practice ("which one was active when this calculation ran?") is answered by the audit log's foreign key into the program row.

## 4. Progression-flag lifecycle (clarification 2026-05-07 #2)

**Decision**: Auto-supersede on next rule evaluation for the same scope. The `progression_flags` table follows the same `is_active` + `superseded_at` pattern as `generated_programs`. The "scope" is `(athlete_id, exercise_id)` for per-exercise rules (add-load, regression) and `(athlete_id, muscle_group)` for volume rules (stagnation, deload-suggested). On every rule re-eval the engine emits a "candidate flag" set; the DAO compares against active flags for each scope and:

1. If the candidate matches the active flag's type and adjustment → no-op (idempotent).
2. If the candidate differs → mark active as `is_active = false, superseded_at = now()` and insert the new flag.
3. If the candidate is "no flag" (rule did not fire because conditions are not met) → mark the active flag for that scope as superseded with no replacement; the read API returns nothing.

A partial-unique index `unique (athlete_id, scope_kind, scope_ref) where is_active = true` enforces one active flag per scope.

**Rationale**:

- Clarification answer (B) selected auto-clear on next eval.
- "Scope" needs an explicit shape because per-exercise and per-muscle-group flags coexist; a single `scope_kind text + scope_ref text` pair carries both without a polymorphic table.
- Idempotent re-eval (no-op when nothing changed) avoids history bloat from logging the same flag every session save.

**Alternatives considered**:

- Append-only flags with the dashboard filtering by latest-per-scope. Rejected — the dashboard query gets gnarly fast and "active vs historical" becomes a calculation rather than a column.
- Manual dismiss. Rejected — adds a UI burden for no behavioural gain.
- Time-boxed expiry. Rejected — the rule already encodes recency (it reads the latest sessions).

## 5. Calculation-result audit log (clarification 2026-05-07 #4)

**Decision**: Single shared `calculation_results` audit table written **only** on persisted, athlete-affecting runs. Schema:

```
calculation_results (
  id              bigint identity primary key,
  athlete_id      uuid not null references athletes(id) on delete cascade,
  calculator      text not null,           -- 'bmr' | 'tdee' | 'macros' | 'one_rep_max' | 'body_composition' | 'progression_eval' | 'program_generate'
  inputs          jsonb not null,
  outputs         jsonb not null,
  resolved_constants jsonb not null,
  engine_version  text not null,
  produced_record_kind text,               -- e.g. 'one_rep_max_records', 'progression_flags'
  produced_record_id   text,               -- stable string id of the typed row, when applicable
  created_at      timestamptz not null default now()
)
```

Writes happen in:

- profile save → BMR / TDEE / macros (one row per calculator that ran)
- session save (Phase 4 wires the trigger; Phase 1 ships an explicit `POST /api/v1/progression-flags/evaluate` endpoint exercised by tests) → progression_eval
- body-weight save → body_composition (which then triggers macros recompute → one more row)
- program generation → program_generate (one row per regeneration)
- `POST /api/v1/one-rep-max-records` → one_rep_max

Calculators-page (US6) ad-hoc runs MUST NOT write to this table. The route handler for `POST /api/v1/calculators/*` calls the pure engine function directly and returns; no DAO is touched.

**Rationale**:

- Clarification answer (A): single shared table, persisted runs only.
- One audit table is simpler than per-calculator audit tables and simpler to query for "everything that happened for athlete X in May".
- Phase 1 doesn't need indexed lookup by `produced_record_id` (replay queries are rare and bounded); a regular B-tree index on `(athlete_id, created_at desc)` covers the timeline read.

**Alternatives considered**:

- Per-calculator typed audit tables. Rejected — five tables for the same shape; harder to add a sixth.
- Audit every run including ad-hoc. Rejected — defeats the point of US6 ("ad-hoc inputs without committing to their profile") and would write a row on every keystroke if the Calculators page debounces poorly.
- No audit log in Phase 1. Rejected — the spec defines `Calculation result` as a key entity and `engine_version` snapshotting is the constitution-level guarantee for replayability.

## 6. Phase 1 frontend surface (clarification 2026-05-07 #5)

**Decision**: Phase 1 ships two new pages on top of the Phase 0 scaffold:

1. **Calculators page** (`/calculators` with sub-routes per calculator) — five forms (BMR, TDEE, macros, 1RM, body composition) that POST to `/api/v1/calculators/<name>` and render the result on the same page. Stateless; no profile changes.
2. **Nutrition view** (`/nutrition`) — read-only display of the active program's daily targets (calories / protein g / carbs g / fat g) and the per-meal breakdown from `nutrition_template_meals`. Reads `/api/v1/program` (or composes from existing endpoints if simpler).

Routing is added via `react-router-dom@^6`. The existing scaffold home at `/` is kept and updated to link to the two new pages.

**Rationale**:

- Clarification answer (B) selected this scope.
- Phase 1 must be demoable end-to-end the same way Phase 0 was; without a Nutrition view, the calorie/macro engine has no visible deliverable.
- Adding `react-router-dom` is standard for a multi-page Vite app and Phase 4's journal will need it anyway.

**Alternatives considered**:

- Calculators page only, no Nutrition view. Rejected at clarification — leaves the engine's primary daily output (calories + macros) hidden until Phase 3.
- Full Phase 1 UI including a basic training/program view. Rejected at clarification — leaks into Phase 3 (Training screen) territory.

## 7. Profile field additions

**Decision**: Add `activity_level text not null default 'moderately_active'` to `athletes` via migration `20260507000001_extend_athletes_activity_level.sql`. Allowed values (CHECK): `sedentary` (1.2), `lightly_active` (1.375), `moderately_active` (1.55), `very_active` (1.725), `extremely_active` (1.9). The Phase 0 `weekly_session_count` field is preserved (it remains the input to the program generator's split selection); `activity_level` is a separate, lifestyle-level concept used by the TDEE calculator.

**Rationale**:

- The spec (FR-002) names a five-level activity factor exactly matching standard practice.
- The Phase 0 schema only carries `weekly_session_count`, which conflates training frequency with daily lifestyle activity. They are not the same — an office worker training 5 days/week has a different TDEE than a construction worker training 5 days/week.
- A default of `moderately_active` keeps the seeded athlete's TDEE close to what Phase 0's program generator already produced (1.725 was used implicitly via `weekly_session_count = 5` mapping; `moderately_active` = 1.55 is more conservative and matches the bulk of literature).

**Alternatives considered**:

- Derive activity level from `weekly_session_count`. Rejected — the user clarified "activity level" is a profile concept; deriving it removes the user's ability to override.
- Make the column nullable. Rejected — Mifflin–St Jeor + activity-factor is undefined without a level; default plus CHECK is safer than null-handling in the engine.

## 8. 1RM formula choice and percentage table

**Decision**: Compute four formulas (Epley, Brzycki, Lander, Lombardi) and report all four plus their average as the primary estimate. The percentage table renders rows for 60 %, 70 %, 75 %, 80 %, 85 %, 90 % with a recommended rep range derived from a fixed mapping:

| % of 1RM | Rep range |
| -------- | --------- |
| 60       | 12–15     |
| 70       | 10–12     |
| 75       | 8–10      |
| 80       | 6–8       |
| 85       | 4–6       |
| 90       | 2–4       |

The reduced-confidence flag fires for `reps > 10` per FR-008.

**Rationale**:

- The four chosen formulas are the most widely-cited in resistance-training literature; averaging smooths individual formula bias.
- The percentage-to-rep mapping is the standard NSCA loading-and-rep-range chart; baking it in is appropriate because Phase 1 ships exactly one chart, not a configurable one.

**Alternatives considered**:

- Single formula (Epley). Rejected — the spec (FR-007) explicitly requires four-formula exposure with averaging.
- Configurable percentage rows. Rejected — those six rows are the spec (FR-009); making them configurable now is YAGNI.

## 9. Body composition: multi-measurement vs. fallback

**Decision**: Use the U.S. Navy circumference formula when `waist`, `neck`, and `height` (and `hip` for female athletes) are available; fall back to the Deurenberg BMI-based estimate otherwise. Plausibility ranges (FR-022): waist 50–200 cm, neck 25–60 cm, hip 60–200 cm, weight 30–250 kg, height 100–250 cm, age 10–100 years. Out-of-range inputs return a 422 with `code: 'OUT_OF_RANGE'` and the offending field name; previously persisted targets are unchanged.

**Rationale**:

- U.S. Navy circumference is the most widely-validated multi-measurement field formula and matches PLAN.md's intent for waist+neck.
- Deurenberg BMI fallback is well-cited and only needs values already on the athlete profile.
- Plausibility ranges are deliberately wide so legitimate athletes are never blocked; the goal is to catch typos (e.g. weight = 580 kg).

**Alternatives considered**:

- Skinfold-based formulas (Jackson–Pollock). Rejected — needs caliper measurements not in the data model.
- Single fallback for all cases. Rejected — the spec (FR-019, FR-020) explicitly distinguishes the multi-measurement and fallback paths.

## 10. Engine versioning

**Decision**: A single semver string `ENGINE_VERSION` exported from `services/engine/constants.js`, bumped manually in the same commit that introduces a behavioural change. Every persisted calculation row carries this version. Phase 1 ships `1.0.0`. Bumps follow:

- **PATCH**: bug fixes that change outputs by ≤ rounding (e.g. correcting an integer round-vs-floor).
- **MINOR**: new calculator added, or a calculator gains a new optional input.
- **MAJOR**: a default constant changes in a way that would alter outputs for the same input, OR a calculator's output shape changes.

**Rationale**:

- Replay needs to know "which engine produced this row". Without a version, a 2027 default tweak silently rebases every old calculation on the new constant.
- Manual bumps are sufficient at this scale; automating them is overengineering for a single-author codebase.

**Alternatives considered**:

- Git SHA as the version. Rejected — opaque to humans, ties replay to repo cloning.
- No version, just `resolved_constants` snapshot. Rejected — the snapshot covers config drift but not formula drift; if Mifflin–St Jeor's coefficients are corrected, the snapshot doesn't help.

## 11. Constitution alignment summary

| Principle                          | Touchpoints                                                                                                                        | Status            |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| I. Multi-Tenant-Ready Data Model   | §3 (`generated_programs.athlete_id` + RLS), §4 (`progression_flags.athlete_id` + RLS), §5 (`calculation_results.athlete_id` + RLS) | ✅                |
| II. Layered Architecture           | §1 (engine purity), §5 (audit DAO is the only Supabase touchpoint), §6 (frontend uses `/api/v1/` only)                             | ✅                |
| III. Configuration over Hardcoding | §2 (defaults + override path), §7 (no hardcoded activity level)                                                                    | ✅                |
| IV. Versioned API Contract         | §6 (new pages call `/api/v1/*`), `contracts/openapi.yaml` mounts every new path under v1                                           | ✅                |
| V. Test-First for Domain Logic     | §1 (purity makes testability free), §4 (rule engine is pure), tests authored before implementation                                 | ✅                |
| VI. Athlete-First UX               | §6 (Tailwind-only, design-token-driven Calculators + Nutrition pages)                                                              | ✅ scaffold-style |
