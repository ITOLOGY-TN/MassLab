// Phase 2 US2 (T032): muscle-groups controller. Thin orchestrator over the DAO.
import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const createSchema = z
  .object({
    name: z.string().min(1).max(40),
    display_color: z.string().regex(HEX_COLOR).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

const patchSchema = z
  .object({
    name: z.string().min(1).max(40).optional(),
    display_color: z.string().regex(HEX_COLOR).optional(),
    sort_order: z.number().int().optional(),
  })
  .strict();

const mergeSchema = z.object({ target_id: z.number().int().positive() }).strict();

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

export function muscleGroupsController({ daos }) {
  const dao = daos.muscleGroups;

  return {
    async list(req, res, next) {
      try {
        const includeArchived =
          String(req.query.include_archived ?? '').toLowerCase() === 'true' ||
          req.query.include_archived === '1';
        const data = await dao.listForAthlete(req.athleteId, { includeArchived });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const body = parse(createSchema, req.body);
        const row = await dao.create(req.athleteId, body);
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
        const existing = await dao.findById(req.athleteId, id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'muscle group not found');
        const row = await dao.patch(req.athleteId, id, body);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async destroy(req, res, next) {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION_FAILED', 'invalid id');
        const existing = await dao.findById(req.athleteId, id);
        if (!existing) throw new HttpError(404, 'NOT_FOUND', 'muscle group not found');
        const refs = await dao.countReferences(req.athleteId, id);
        if (refs > 0) {
          await dao.softArchive(req.athleteId, id);
        } else {
          await dao.hardDelete(req.athleteId, id);
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async merge(req, res, next) {
      try {
        const body = parse(mergeSchema, req.body);
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) throw new HttpError(400, 'VALIDATION_FAILED', 'invalid id');
        const target = await dao.merge(req.athleteId, id, body.target_id);
        res.json({ data: target });
      } catch (err) {
        next(err);
      }
    },
  };
}
