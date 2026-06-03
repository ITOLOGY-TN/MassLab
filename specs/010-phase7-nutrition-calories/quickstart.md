# Quickstart — Nutrition & Calories (Phase 7)

**Feature**: `010-phase7-nutrition-calories` · **Date**: 2026-06-03

Operator's guide to the four user-facing surfaces this phase adds. Assumes the app boots (`npm install && npm start`), the seeded athlete exists, and the **three Phase 7 migrations have been applied** (see Migrations below — live contract/integration tests probe for the `nutrition_logs` table and skip until then).

## What's new

| Surface | Route (frontend) | Endpoint(s) |
|---------|------------------|-------------|
| Daily food log + 4 progress bars | `/nutrition` | `GET /api/v1/nutrition/day` · `POST/PATCH/DELETE /api/v1/nutrition/log` · `GET/POST /api/v1/foods` |
| Load daily plan | `/nutrition` | `POST /api/v1/nutrition/load-plan` |
| Hydration tracker | `/nutrition` | `POST /api/v1/nutrition/hydration` (current value comes back in `GET /nutrition/day`) |
| Nutrition trends | `/nutrition/trends` | `GET /api/v1/nutrition/trends` |

Nav link: **"Nutrition"** (already present) now opens the day log; a tab/sub-link reaches Trends.

## 1. Log the day's food + watch the bars (P1)

```bash
# Log a catalogue food by id
curl -X POST localhost:3000/api/v1/nutrition/log \
  -H 'content-type: application/json' \
  -d '{ "logged_on": "2026-06-03", "slot": "breakfast", "food_id": 3, "quantity_g": 80 }'

# Log a food missing from the catalogue → it is created in the athlete's catalogue, then logged (FR-002a)
curl -X POST localhost:3000/api/v1/nutrition/log \
  -H 'content-type: application/json' \
  -d '{ "logged_on": "2026-06-03", "slot": "lunch", "quantity_g": 150,
        "custom_food": { "name": "Poulet maison", "kcal_per_100g": 165,
                         "protein_per_100g": 31, "carbs_per_100g": 0, "fat_per_100g": 3.6 } }'

# The day view: meal slots + subtotals + totals + 4 progress bars + hydration
curl 'localhost:3000/api/v1/nutrition/day?date=2026-06-03'

# Edit a portion / remove an entry
curl -X PATCH localhost:3000/api/v1/nutrition/log/12 -H 'content-type: application/json' -d '{ "quantity_g": 100 }'
curl -X DELETE localhost:3000/api/v1/nutrition/log/12
```

- Each entry **snapshots** its computed `kcal/protein_g/carbs_g/fat_g` at log time, so editing a catalogue food later never shifts past days' totals (FR-003/SC-008).
- The four bars compare day totals to the athlete's **stored targets** (read from `GET /api/v1/me/nutrition-targets` — never recomputed here). `state` is `under|at|over`.
- **Rejected (400)**: `quantity_g ≤ 0` or out of range (FR-004); a future `logged_on` (FR-024); neither `food_id` nor `custom_food`.
- **Search**: `GET /api/v1/foods?q=poul` filters the catalogue by name. A repeated custom food name reconciles to the same catalogue row (no duplicate, FR-002a).

## 2. Load the program's daily plan (P2)

```bash
# Empty day → fills the five meal slots from the template (foods + grams)
curl -X POST localhost:3000/api/v1/nutrition/load-plan \
  -H 'content-type: application/json' -d '{ "date": "2026-06-03" }'

# Non-empty day → mode REQUIRED: replace (swap) or append (add on top)
curl -X POST localhost:3000/api/v1/nutrition/load-plan \
  -H 'content-type: application/json' -d '{ "date": "2026-06-03", "mode": "append" }'
```

- A non-empty day **without** `mode` returns `409 LOAD_PLAN_CONFLICT` — the UI prompts replace-or-append; the server never silently overwrites (FR-011, clarification).
- Loaded entries are ordinary log entries (editable/removable, FR-012).

## 3. Hydration (P2)

```bash
curl -X POST localhost:3000/api/v1/nutrition/hydration -H 'content-type: application/json' -d '{ "date":"2026-06-03","delta_ml":500 }'
curl -X POST localhost:3000/api/v1/nutrition/hydration -H 'content-type: application/json' -d '{ "date":"2026-06-03","delta_ml":-250 }'  # undo
```

- Returns `{ total_ml, goal_ml }`. The total is clamped at `≥ 0` (FR-015); a new calendar day starts at 0 (FR-016).
- Goal resolves `app_config.engine_overrides.hydration.goal_ml ?? HYDRATION_GOAL_ML` (default 3000).

## 4. Nutrition trends (P3)

```bash
curl 'localhost:3000/api/v1/nutrition/trends?date=2026-06-03'
```

Returns `calories.points` (daily kcal over `NUTRITION_TREND_DAYS`, with `goalKcal` line), `macroBreakdown` (the day's protein/carbs/fat proportions), and `weeklyProtein` (**average daily protein per week**, FR-019). Renders a low/no-data state without error (FR-020).

## Config (`.env`, all defaulted)

```
HYDRATION_GOAL_ML=3000           # daily hydration goal (system default)
NUTRITION_TREND_DAYS=30          # calories-trend window
NUTRITION_LOCALE=fr-FR           # food search + custom-food locale
# Per-athlete hydration override (optional): app_config.engine_overrides.hydration.goal_ml (JSONB, no migration)
```

## Tests to run

```bash
npm test -- tests/unit/nutritionMath.test.js \
            tests/unit/nutritionTrends.test.js \
            tests/unit/foodSlug.test.js \
            tests/unit/dayView.test.js \
            tests/unit/trendsView.test.js \
            tests/unit/lib.chartGeometry.test.js   # donut/gauge geometry
npm test -- tests/contract        # nutrition/* + foods custom-food paths (live-gated; skips until nutrition_logs exists)
npm test -- tests/integration     # log/edit/delete, custom-food persist+reuse, load-plan replace/append, hydration clamp, RLS probes
npm run test:frontend             # /nutrition day + trends smoke (bars, load-plan prompt, gauge, charts, empty states)
```

## Migrations

**Three, forward-only** (apply before the live tests pass):

```
supabase/migrations/20260603000001_init_nutrition_logs.sql
supabase/migrations/20260603000002_init_hydration_log.sql
supabase/migrations/20260603000003_init_nutrition_template_meal_items.sql
```

Each ships its `*_own` RLS in the same file. Re-run the seed (`seed/runSeed.js`) to populate `nutrition_template_meal_items` for the current athlete (idempotent). `nutrition_logs` is the table the Phase 2 reset DAO already references — shipping it makes that path live.
