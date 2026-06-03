# Phase 0 Research — Nutrition & Calories (Phase 7)

**Feature**: `010-phase7-nutrition-calories` · **Date**: 2026-06-03 · **Spec**: [spec.md](./spec.md)

This phase has **no NEEDS CLARIFICATION** markers (the four open questions were resolved in `/speckit-clarify`, Session 2026-06-03). Research here records the design decisions that shape the plan, each grounded in the existing codebase so Phase 7 reuses rather than reinvents — and is explicit about where it must add new persistence.

## Decisions

### D-1 — Create the `nutrition_logs` table (NEW migration); it is already anticipated by the reset DAO

**Decision**: Create `public.nutrition_logs` (forward-only migration `20260603000001`). Columns: `id bigint` PK, `athlete_id uuid` FK → athletes (cascade), `logged_on date`, `slot text` (one of `breakfast|lunch|pre_workout|dinner|evening_snack`), `food_id bigint` FK → foods, `food_name text` (snapshot), `quantity_g numeric(7,2)`, and the **persisted macro snapshot** `kcal numeric(7,2)`, `protein_g numeric(6,2)`, `carbs_g numeric(6,2)`, `fat_g numeric(6,2)`, plus `created_at timestamptz`. Index `(athlete_id, logged_on)`. RLS `nutrition_logs_select_own` / `_modify_own` shipped in-file.

**Rationale**: `nutrition_logs` is already listed in `services/dataAccess/reset.dao.js` (`MODULE_TABLES.nutrition_logs` + `FULL_WIPE_ORDER`) and guarded with a `42P01` "table not present yet" check — Phase 0 reserved the name but never created it. Creating it now is the natural place for it and makes the reset path fully functional. Per-entry granularity (one row per food per meal per day) is required for editing/removing individual foods (FR-005) and for per-meal subtotals (FR-006). The macro snapshot columns deliver FR-003/SC-008 (historical stability) without recomputing from the catalogue on every read.

**Alternatives considered**: A single per-day JSON blob of entries — rejected; it blocks indexed range reads for trends, complicates per-entry edit/delete, and fights the relational RLS pattern used everywhere else.

### D-2 — Create the `hydration_log` table (NEW migration); one row per athlete per day

**Decision**: Create `public.hydration_log` (migration `20260603000002`). Columns: `athlete_id uuid` FK, `logged_on date`, `total_ml int not null default 0`, `updated_at timestamptz`, `UNIQUE(athlete_id, logged_on)`. RLS `*_own` in-file. Quick-add is an **upsert that increments** `total_ml` by the signed delta, clamped at the application layer to `≥ 0` (FR-015).

**Rationale**: Hydration is a single running total per calendar day (FR-013/FR-016), not a stream of events, so one upserted row per day is the simplest correct model and makes "today resets to zero" fall out of the date key. The goal is **not** stored on the row (it is config/preference-driven, D-9), keeping the table a pure counter.

**Alternatives considered**: One row per quick-add event (append-only) with a SUM read — rejected; unnecessary write volume and a harder undo/clamp story for a value that is conceptually one number per day. Undo on an append-only log would need event deletion; the counter model makes undo a negative delta.

### D-3 — Targets are **read, never recomputed**; no audit-log write for logging

**Decision**: The four progress bars consume the athlete's stored daily targets via the existing resolution path used by `GET /api/v1/me/nutrition-targets` (`resolveTargets` in `controllers/nutritionTargets.controller.js` → `daily_kcal/daily_protein_g/daily_carbs_g/daily_fat_g`). Phase 7 does **not** re-run the macros engine, and food/water logging does **not** append to `calculation_results`.

**Rationale**: FR-008 + the constitution's AI/engine boundary: targets are the Phase 1 engine's output (with Phase 2 overrides); summing logged food against them is presentation, not a new calculation. CLAUDE.md states the audit log is written only from persisted **engine** calculation paths, not ad-hoc reads — logging a sandwich is neither. Reusing `resolveTargets` keeps a single source of truth for targets and respects any custom overrides already set.

**Alternatives considered**: Snapshot targets onto each day's log — rejected; targets are global-per-athlete and already resolvable, and snapshotting them per day would drift from the engine and the override UI.

### D-4 — Snapshot computed macros on every log entry (FR-003/SC-008)

**Decision**: On insert, the controller computes the portion's `kcal/protein_g/carbs_g/fat_g` from the referenced food's per-100g reference macros scaled by `quantity_g` (pure `nutritionMath.entryMacros`) and **persists those numbers** on the `nutrition_logs` row. Day totals and trends sum the stored snapshots, never re-derive from the live catalogue.

**Rationale**: SC-008 requires that editing a catalogue food's reference macros leaves past days' totals unchanged. Storing the snapshot is the deterministic way to guarantee that and keeps reads cheap (no per-entry join-and-recompute). Editing an entry's `quantity_g` re-runs `entryMacros` against the *then-current* food and rewrites the snapshot (an explicit edit is expected to re-price).

### D-5 — A missing food is created as a **custom food that persists into the `foods` catalogue** (clarification, FR-002a)

**Decision**: The `foods` table is already `athlete_id`-scoped with `UNIQUE(athlete_id, slug, locale)` and an `upsertMany` writer. Add `foods.dao.createForAthlete({ athleteId, name, kcalPer100g, proteinPer100g, carbsPer100g, fatPer100g, locale, category })` that derives a slug via the pure `services/nutrition/foodSlug.slugify(name)` and **upserts on `(athlete_id, slug, locale)`** with `category` defaulting to `custom`. `POST /nutrition/log` accepts either a `food_id` or an inline `custom_food` object; when `custom_food` is present the controller creates/reconciles the food first, then logs against the returned `food.id`. Also add `foods.dao.findById(athleteId, id)` (used when logging by id) and an optional `q` name filter to `foods.dao.list`.

**Rationale**: Directly from the 2026-06-03 clarification ("also save to catalogue"). Reusing the existing athlete-scoped `foods` table means no new table and full multi-tenant isolation. Upserting by the name-derived slug satisfies the spec's "handle a duplicate name without a confusing duplicate" (FR-002a) — a second custom "Poulet maison" maps to the same `(athlete_id, slug, locale)` row instead of creating a sibling. Full catalogue management (rename/delete/merge across foods) remains a Phase 2 data-management concern.

**Alternatives considered**: A separate `custom_foods` table or an inline-only entry that never persists — rejected by the clarification; the former duplicates the catalogue, the latter blocks reuse-by-search (SC-011).

### D-6 — "Load daily plan" needs concrete foods+grams → add a small template-items child table; replace-or-append on a non-empty day (clarification, FR-010/FR-011)

**Decision**: The existing `nutrition_template_meals` table stores only per-slot **target macros** (`target_kcal/target_protein_g/…`), not foods — so it cannot pre-fill "foods and gram amounts" (spec US2). Add `public.nutrition_template_meal_items` (migration `20260603000003`): `id`, `athlete_id`, `slot text`, `food_id bigint` FK → foods, `quantity_g numeric(7,2)`, `display_order int`, RLS `*_own`. Seed it for the current athlete from a new `seed/nutritionTemplateItems.seed.json` (concrete catalogue foods + grams per slot, idempotent insert in `runSeed.js`). `POST /nutrition/load-plan` reads these items and creates one `nutrition_logs` entry per item (macros snapshotted via `entryMacros`). Body `{ date, mode }` where `mode ∈ {replace, append}`:

- **Empty day**: insert the template items regardless of `mode`.
- **Non-empty day**: `mode` is **required**; `replace` deletes the day's existing entries then inserts the template; `append` adds the template on top. A non-empty day **without** a `mode` returns `409 LOAD_PLAN_CONFLICT` so the UI must prompt — never a silent overwrite.

**Rationale**: The spec explicitly requires the plan to carry foods and gram amounts, which the macro-target-only template cannot provide. A child table is the relational fit (a meal has many foods) and stays multi-tenant (`athlete_id` + RLS). Seeding the items for the current athlete mirrors how Phase 0 seeds the catalogue and the meal template; generating items for arbitrary future users from the slot macro targets is recorded as a **program-generator follow-up** (out of scope here). The replace/append confirmation is the verbatim clarification outcome (FR-011), implemented server-side so the non-destructive guarantee holds even outside the UI.

**Alternatives considered**: (a) Pre-fill each slot with a synthetic "plan target" pseudo-entry carrying the slot's macro targets instead of real foods — rejected; it contradicts "foods and gram amounts" and pollutes the catalogue/snapshot model. (b) Hardcode template foods in code — rejected by Constitution III (no athlete/program data in source) and the multi-tenant goal.

### D-7 — New pure boundaries: `services/engine/*` for the numbers, `services/nutrition/*` for view composition (mirrors Phase 5/6)

**Decision**: Follow the established split.

- **`services/engine/` (new pure, test-first per Constitution V)**:
  - `nutritionMath.js` — `entryMacros({ food, quantityG })` (per-100g → portion snapshot, D-4); `dayTotals(entries)` (sum of snapshots); `progress(totals, targets)` → per-bar `{ value, target, pct, state: 'under'|'at'|'over' }` (FR-007).
  - `nutritionTrends.js` — `caloriesByDay(entries, { days, asOf })` (date-ordered daily kcal over the window, FR-017); `macroBreakdown(dayEntries)` (protein/carbs/fat proportions of a day, FR-018); `weeklyAvgProtein(entries, { asOf })` → **mean daily protein per week** (the clarified metric, FR-019) — robust to weeks with missing days.
- **`services/nutrition/` (new pure presenters + slug helper)**: `foodSlug.js` (`slugify`), `dayView.js` (meal slots with entries + subtotals + the four progress bars + hydration current/goal), `trendsView.js` (the three chart view models). Assemble from injected DAO output, no I/O, including empty/low-data shapes.

**Rationale**: Constitution II (layering) + V (test-first for any surfaced number). Portion macros, totals, progress states, and the three trend aggregations are all "numbers surfaced to the athlete," so they are pure and tested first. Composition stays I/O-free and unit-testable, matching `services/loadTracking/*` and `services/bodyTracking/*`.

### D-8 — Charts reuse Phase 5 SVG; add one pure donut/gauge geometry helper

**Decision**: Calories-over-30-days renders through the existing `LineChart.jsx` (with a goal line, reusing the Phase 6 goal-line overlay pattern); weekly average protein renders through the existing `BarChart.jsx`. The **macro breakdown** (donut) and the **hydration circular gauge** need arc geometry not yet in `chartGeometry.js` — add pure `donutSegments({ values, ... })` / `gaugeArc({ value, max, ... })` (or a shared `arcPath`), unit-tested alongside the existing geometry, driving two small new components `DonutChart.jsx` + `HydrationGauge.jsx`.

**Rationale**: Phase 5 D-9 established hand-rolled, unit-tested SVG geometry and shipped `LineChart`/`BarChart`/`RadarChart`. Reusing them keeps the premium look (Constitution VI) and avoids a charting dependency. The only genuinely new geometry — circular arcs for a donut and a gauge — is a few lines of pure, testable math.

**Alternatives considered**: Introduce a charting library (Recharts/Chart.js) — rejected; consistent with Phase 5/6's deliberate no-library stance.

### D-9 — Config keys for hydration goal, trend window, and locale (config over hardcoding)

**Decision**: Add to `config/schema.js`: `HYDRATION_GOAL_ML` (default `3000`), `NUTRITION_TREND_DAYS` (default `30`), `NUTRITION_LOCALE` (default `'fr-FR'`). The **per-athlete** hydration-goal override (clarification: "Settings/preferences, configurable") rides on the existing `app_config.engine_overrides.hydration.goal_ml` JSONB read via `appConfig.getOverridesFor` — the day view resolves `override.hydration.goal_ml ?? config.HYDRATION_GOAL_ML`. No extra migration for the override.

**Rationale**: Constitution III. The 3 L goal, the 30-day window, and the food locale are environment/preference values, not constants. Reusing the `engine_overrides` JSONB for the per-athlete override matches exactly how nutrition-target overrides already work (`app_config.engine_overrides.nutrition.*`), so no schema change is needed for "configurable in Settings."

**Alternatives considered**: A new `app_config.hydration_goal_ml` column — rejected; the JSONB override channel already exists and avoids a fourth migration for a single optional scalar.

### D-10 — Validation rules (controller boundary + zod)

**Decision**:

- **Quantity (FR-004)**: `quantity_g` must be a number `> 0` and `≤ 5000` (plausible single-portion cap); zero/negative/non-numeric/over-cap → `400 VALIDATION_FAILED`, nothing logged.
- **Custom food macros (FR-002a)**: name non-empty; per-100g macros numeric and within plausible bounds (`kcal 0–900`, each macro `0–100` g/100 g) → else `400`.
- **Future/invalid date (FR-024)**: `logged_on` (and hydration/load-plan `date`) later than the server's "today" or malformed → `400 VALIDATION_FAILED`, compared at the request boundary (pure functions stay time-free, mirroring the Phase 6 weigh-in guard).
- **Hydration delta (FR-015)**: `delta_ml` is a bounded integer; the resulting `total_ml` is clamped at `≥ 0`.
- **Load-plan (FR-011)**: non-empty day without `mode` → `409 LOAD_PLAN_CONFLICT`; `mode ∉ {replace, append}` → `400`.

**Rationale**: These are the spec's edge cases turned into cheap, directly testable rules. Date "today" is read at the boundary so the engine/presenter functions remain pure (Constitution II).

### D-11 — Determinism, tenant scoping, layering

**Decision**: All new `services/engine/*`, `services/nutrition/*`, and `chartGeometry` functions are pure — the caller supplies `asOf`/`now`; no `Date.now()`, random, I/O, or globals. Every read/write is parameterised by `req.athleteId`; no endpoint accepts a tenant id from the body/query. No `@supabase/supabase-js` import appears outside `services/dataAccess/*`. The three new tables ship `*_own` RLS in their migrations and are added to the RLS integration probe.

**Rationale**: Constitution I + II and the project's determinism convention (established across Phases 1–6). Keeps every surfaced number unit-testable and every row tenant-isolated.

### D-12 — Frontend: extend the existing `/nutrition` route into a day-log + trends tree

**Decision**: The current `/nutrition` page (`NutritionHome.jsx`) only displays resolved targets. Repurpose `/nutrition` as the **day log** (`NutritionDay.jsx`: four progress bars across the top, five meal-slot cards with food search + gram input + per-meal subtotals, a "Load daily plan" button with the replace/append prompt, and the hydration gauge with quick-add buttons), and add `/nutrition/trends` (`NutritionTrends.jsx`: calories-30d line + goal, macro donut, weekly-protein bars). The existing "Nutrition" nav item is reused; a sub-link or tab exposes Trends. A thin `lib/nutritionApi.js` wraps the new endpoints.

**Rationale**: Constitution VI (every screen answers a real question) and consistency with the Phase 5/6 page-tree pattern (`/load-tracking`, `/body`). The targets the old `NutritionHome` showed are now embedded in the progress bars (target = bar maximum), so no information is lost; the resolved-targets/override view stays reachable from Settings (Phase 2).

## Resolved unknowns summary

| Question | Resolution |
|----------|------------|
| New tables needed? | **Yes** — `nutrition_logs` (D-1), `hydration_log` (D-2), `nutrition_template_meal_items` (D-6). 3 migrations, each with RLS. |
| Where do calorie/macro targets come from? | Read via existing `resolveTargets` (`/me/nutrition-targets`); never recomputed; no audit write (D-3). |
| How is historical stability guaranteed? | Per-entry macro snapshot on `nutrition_logs` (D-4). |
| Food missing from the catalogue? | Create a custom food that persists into the athlete-scoped `foods` table, slug-reconciled (D-5, clarification). |
| Can "Load daily plan" carry real foods+grams? | Yes — new template-items child table, seeded; replace/append on a non-empty day (D-6, clarification). |
| Weekly protein metric? | Average daily protein per week (D-7, clarification). |
| Hydration goal source? | `HYDRATION_GOAL_ML` config default 3 L + optional per-athlete `engine_overrides.hydration.goal_ml` (D-9, clarification). |
| Charting library? | No — reuse Phase 5 SVG + one new pure donut/gauge geometry helper (D-8). |
| Where does the new numeric logic live? | Pure `services/engine/{nutritionMath,nutritionTrends}.js`, composed by pure `services/nutrition/*` (D-7). |
