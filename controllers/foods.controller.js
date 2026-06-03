import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

const createSchema = z
  .object({
    name: z.string().trim().min(1),
    kcal_per_100g: z.number().min(0).max(900),
    protein_per_100g: z.number().min(0).max(100),
    carbs_per_100g: z.number().min(0).max(100),
    fat_per_100g: z.number().min(0).max(100),
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

export function foodsController({ daos, config }) {
  const foodsDao = daos.foods;
  const defaultLocale = config.NUTRITION_LOCALE;
  return {
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? defaultLocale;
        const category = req.query.category;
        const q = req.query.q;
        const data = await foodsDao.list({ athleteId: req.athleteId, locale, category, q });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const body = parse(createSchema, req.body);
        // Resolve the locale the same way list() does so a custom food is
        // persisted under — and therefore searchable in — the caller's locale
        // (the DAO upsert key is athlete_id,slug,locale).
        const locale = req.query.locale ?? defaultLocale;
        const food = await foodsDao.createForAthlete({
          athleteId: req.athleteId,
          name: body.name,
          kcalPer100g: body.kcal_per_100g,
          proteinPer100g: body.protein_per_100g,
          carbsPer100g: body.carbs_per_100g,
          fatPer100g: body.fat_per_100g,
          locale,
          category: 'custom',
        });
        res.status(201).json({ data: food });
      } catch (err) {
        next(err);
      }
    },
  };
}
