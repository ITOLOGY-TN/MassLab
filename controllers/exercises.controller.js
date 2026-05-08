import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

const createSchema = z
  .object({
    name: z.string().min(1).max(80),
    locale: z.string().default('fr-FR'),
    targeted_muscles: z.array(z.string()).min(1),
    instructions: z.string().min(1),
    technique_points: z.array(z.string()).optional(),
    media_image_url: z.string().url().optional(),
    media_video_url: z.string().url().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    targeted_muscles: z.array(z.string()).min(1).optional(),
    instructions: z.string().min(1).optional(),
    technique_points: z.array(z.string()).optional(),
    media_image_url: z.string().url().nullable().optional(),
    media_video_url: z.string().url().nullable().optional(),
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

export function exercisesController(exercisesDao) {
  return {
    async list(req, res, next) {
      try {
        const includeArchived =
          req.query.include_archived === '1' ||
          String(req.query.include_archived ?? '').toLowerCase() === 'true';
        const locale = req.query.locale ?? 'fr-FR';
        const data = await exercisesDao.listForAthlete({
          athleteId: req.athleteId,
          locale,
          includeArchived,
        });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const body = parse(createSchema, req.body);
        const row = await exercisesDao.create(req.athleteId, body);
        res.status(201).json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async patch(req, res, next) {
      try {
        const body = parse(patchSchema, req.body);
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION_FAILED', 'invalid id');
        const existing = await exercisesDao.findById(req.athleteId, id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Exercise not found');
        const row = await exercisesDao.patch(req.athleteId, id, body);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async destroy(req, res, next) {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION_FAILED', 'invalid id');
        const existing = await exercisesDao.findById(req.athleteId, id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'Exercise not found');
        const refs = await exercisesDao.countReferences(req.athleteId, id);
        if (refs > 0) {
          await exercisesDao.softDelete(req.athleteId, id);
        } else {
          await exercisesDao.hardDelete(req.athleteId, id);
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
