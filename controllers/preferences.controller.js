import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';

const patchSchema = z
  .object({
    theme: z.enum(['dark', 'light']).optional(),
    units: z.enum(['kg', 'lbs']).optional(),
    rest_timer_sound: z.boolean().optional(),
    notification_acks: z.record(z.string().nullable()).optional(),
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

export function preferencesController({ daos }) {
  return {
    async get(req, res, next) {
      try {
        const data = await daos.appConfig.getPreferences(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async patch(req, res, next) {
      try {
        const body = parse(patchSchema, req.body);
        const data = await daos.appConfig.setPreferences(req.athleteId, body);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
