import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { resolveTargets } from '../services/nutrition/targets.js';
import { build } from '../services/nutrition/dayView.js';
import { build as buildTrends } from '../services/nutrition/trendsView.js';
import { entryMacros } from '../services/engine/nutritionMath.js';

const SLOTS = ['breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack'];

// Custom-food macro bounds mirror the foods write path (D-10): kcal 0–900,
// each macro 0–100 g per 100 g.
const customFoodSchema = z
  .object({
    name: z.string().trim().min(1),
    kcal_per_100g: z.number().min(0).max(900),
    protein_per_100g: z.number().min(0).max(100),
    carbs_per_100g: z.number().min(0).max(100),
    fat_per_100g: z.number().min(0).max(100),
  })
  .strict();

// T019 — log a food into a meal slot. Exactly one of food_id | custom_food.
const logSchema = z
  .object({
    logged_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'logged_on must be YYYY-MM-DD'),
    slot: z.enum(SLOTS),
    quantity_g: z.number().gt(0, 'quantity_g must be > 0').max(5000, 'quantity_g must be <= 5000'),
    food_id: z.number().int().optional(),
    custom_food: customFoodSchema.optional(),
  })
  .strict()
  .refine((v) => (v.food_id == null) !== (v.custom_food == null), {
    message: 'Provide exactly one of food_id or custom_food',
  });

const editSchema = z
  .object({
    quantity_g: z.number().gt(0, 'quantity_g must be > 0').max(5000, 'quantity_g must be <= 5000'),
  })
  .strict();

// T040 — add (or undo) water for a day. Negative deltas undo; the DAO clamps the
// running total at >= 0 (FR-013/FR-015). Bound the per-request delta to a sane range.
const hydrationSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    delta_ml: z
      .number()
      .int('delta_ml must be an integer')
      .min(-5000, 'delta_ml must be >= -5000')
      .max(5000, 'delta_ml must be <= 5000'),
  })
  .strict();

// T032 — pre-fill the day from the program's template meal plan (FR-010/FR-011).
const loadPlanSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
    mode: z.enum(['replace', 'append']).optional(),
  })
  .strict();

function parse(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
  }
  return parsed.data;
}

// Format a Date as YYYY-MM-DD (UTC) — the calendar-day convention the schema and
// DAOs use. The caller injects `now` so the future-date guard is deterministic
// (Constitution: read the clock once at the request boundary, never in a pure fn).
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

// Subtract `n` whole days from a YYYY-MM-DD string, returning YYYY-MM-DD.
// Anchored at UTC midnight so the result is deterministic (no DST/locale drift),
// matching the calendar-day convention the schema and DAOs use.
function isoDayMinus(isoDate, n) {
  const d = new Date(`${isoDate}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

export function nutritionController({ daos, config, now = () => new Date() }) {
  // Compose the canonical day view (shared by getDay + loadPlan): resolved
  // targets + the day's entries + the hydration counter (with override goal).
  async function buildDay(athleteId, date) {
    const [{ targets }, entries, hyd, overrides] = await Promise.all([
      resolveTargets({ daos, athleteId }),
      daos.nutritionLogs.listForDay(athleteId, date),
      daos.hydration.getForDay(athleteId, date),
      daos.appConfig.getOverridesFor(athleteId),
    ]);
    const goal_ml = overrides?.hydration?.goal_ml ?? config.HYDRATION_GOAL_ML;
    return build({
      entries,
      targets: {
        kcal: targets.daily_kcal,
        protein_g: targets.daily_protein_g,
        carbs_g: targets.daily_carbs_g,
        fat_g: targets.daily_fat_g,
      },
      hydration: { total_ml: hyd.total_ml, goal_ml },
      date,
    });
  }

  return {
    async getTemplate(req, res, next) {
      try {
        const data = await daos.nutrition.listTemplateMeals(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async getTargets(req, res, next) {
      try {
        const program = await daos.generatedPrograms.findActiveForAthlete(req.athleteId);
        if (!program) {
          throw new HttpError(
            404,
            'NOT_FOUND',
            'No active program. Run npm run seed or POST /api/v1/program/regenerate.',
          );
        }
        const n = program.payload?.nutrition ?? {};
        res.json({
          data: {
            tdee_kcal: n.tdee_kcal ?? n.tdee,
            daily_kcal: n.daily_kcal,
            macros: n.macros,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // T020 — composed day view: meal slots + subtotals + four progress bars +
    // hydration. `date` defaults to the server's current day.
    async getDay(req, res, next) {
      try {
        const date = req.query.date || isoDay(now());
        const data = await buildDay(req.athleteId, date);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T020 — log a food (FR-001/FR-003/FR-004). Resolves or creates the food,
    // snapshots the macros, inserts. No audit-log write (D-3).
    async logEntry(req, res, next) {
      try {
        const body = parse(logSchema, req.body);

        // FR-024 — reject a future-dated log (compared to server today).
        if (body.logged_on > isoDay(now())) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'logged_on must not be in the future');
        }

        let food;
        if (body.custom_food) {
          food = await daos.foods.createForAthlete({
            athleteId: req.athleteId,
            name: body.custom_food.name,
            kcalPer100g: body.custom_food.kcal_per_100g,
            proteinPer100g: body.custom_food.protein_per_100g,
            carbsPer100g: body.custom_food.carbs_per_100g,
            fatPer100g: body.custom_food.fat_per_100g,
            locale: config.NUTRITION_LOCALE,
            category: 'custom',
          });
        } else {
          food = await daos.foods.findById(req.athleteId, body.food_id);
          if (!food) throw new HttpError(404, 'NOT_FOUND', 'Food not found');
        }

        const snapshot = entryMacros({ food, quantityG: body.quantity_g });
        const entry = await daos.nutritionLogs.insert({
          athlete_id: req.athleteId,
          logged_on: body.logged_on,
          slot: body.slot,
          food_id: food.id,
          food_name: food.name,
          quantity_g: body.quantity_g,
          ...snapshot,
        });
        res.status(201).json({ data: entry });
      } catch (err) {
        next(err);
      }
    },

    // T020 — edit an entry's quantity, rewriting the macro snapshot from the
    // then-current food (FR-005).
    async editEntry(req, res, next) {
      try {
        const body = parse(editSchema, req.body);
        const existing = await daos.nutritionLogs.findById(req.athleteId, req.params.id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Nutrition log entry not found');

        const food = await daos.foods.findById(req.athleteId, existing.food_id);
        if (!food) throw new HttpError(404, 'NOT_FOUND', 'Food not found');

        const snapshot = entryMacros({ food, quantityG: body.quantity_g });
        const entry = await daos.nutritionLogs.update(req.athleteId, req.params.id, {
          quantity_g: body.quantity_g,
          ...snapshot,
        });
        res.json({ data: entry });
      } catch (err) {
        next(err);
      }
    },

    // T020 — remove a log entry (FR-005).
    async deleteEntry(req, res, next) {
      try {
        const existing = await daos.nutritionLogs.findById(req.athleteId, req.params.id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Nutrition log entry not found');
        await daos.nutritionLogs.delete(req.athleteId, req.params.id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    // T040 — add (or undo) water for a day (FR-013/FR-015). The DAO clamps the
    // running total at >= 0. Resolves goal_ml the same way getDay does so the two
    // stay consistent.
    async addHydration(req, res, next) {
      try {
        const body = parse(hydrationSchema, req.body);

        // FR-024 — reject a future-dated change (compared to server today).
        if (body.date > isoDay(now())) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'date must not be in the future');
        }

        const row = await daos.hydration.upsertDelta(req.athleteId, body.date, body.delta_ml);
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const goal_ml = overrides?.hydration?.goal_ml ?? config.HYDRATION_GOAL_ML;
        res.json({ data: { total_ml: row.total_ml, goal_ml } });
      } catch (err) {
        next(err);
      }
    },

    // T051 — nutrition trends (FR-017..FR-020): the calories window + macro
    // breakdown for the anchor day + weekly avg protein. `date` (anchor) defaults
    // to the server's current day; the window spans NUTRITION_TREND_DAYS ending on
    // `date`. Renders a low/no-data state without error — never recomputes targets
    // beyond reading the resolved daily_kcal goal.
    async getTrends(req, res, next) {
      try {
        const date = req.query.date || isoDay(now());
        const days = config.NUTRITION_TREND_DAYS;
        const from = isoDayMinus(date, days - 1);
        const [rangeEntries, { targets }] = await Promise.all([
          daos.nutritionLogs.listRange(req.athleteId, { from, to: date }),
          resolveTargets({ daos, athleteId: req.athleteId }),
        ]);
        const dayEntries = rangeEntries.filter((e) => e.logged_on === date);
        const goalKcal = targets.daily_kcal;
        res.json({ data: buildTrends({ rangeEntries, dayEntries, goalKcal, days, asOf: date }) });
      } catch (err) {
        next(err);
      }
    },

    // T032 — pre-fill the day from the program's template meal plan
    // (FR-010/FR-011). Empty day loads regardless of mode; a non-empty day
    // requires an explicit mode, else 409 so the UI prompts (never silent
    // overwrite). 'replace' clears the day first; 'append' adds on top.
    async loadPlan(req, res, next) {
      try {
        const body = parse(loadPlanSchema, req.body);

        // FR-024 — reject a future-dated load (compared to server today).
        if (body.date > isoDay(now())) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'date must not be in the future');
        }

        const existing = await daos.nutritionLogs.listForDay(req.athleteId, body.date);
        if (existing.length > 0 && body.mode == null) {
          throw new HttpError(
            409,
            'LOAD_PLAN_CONFLICT',
            'Day has entries; choose replace or append',
          );
        }

        const items = await daos.nutrition.listTemplateItems(req.athleteId);

        if (body.mode === 'replace') {
          await daos.nutritionLogs.deleteForDay(req.athleteId, body.date);
        }

        for (const item of items) {
          const food = item.food ?? {};
          const snapshot = entryMacros({ food, quantityG: item.quantity_g });
          await daos.nutritionLogs.insert({
            athlete_id: req.athleteId,
            logged_on: body.date,
            slot: item.slot,
            food_id: item.food_id,
            food_name: item.food_name ?? food.name ?? null,
            quantity_g: item.quantity_g,
            ...snapshot,
          });
        }

        const data = await buildDay(req.athleteId, body.date);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
