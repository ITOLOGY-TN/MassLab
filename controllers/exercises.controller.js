import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { classifyVideo, normalizeYoutubeUrl } from '../services/trainingProgram/mediaClassifier.js';

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

// Derive a file extension from the upload's name or mimetype.
function extFor(file) {
  const fromName = file.originalname?.includes('.') ? file.originalname.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase();
  const sub = (file.mimetype ?? '').split('/')[1] ?? 'bin';
  return sub === 'jpeg' ? 'jpg' : sub;
}

// A stored upload URL looks like `/static/<key>`; external/YouTube URLs don't.
function storageKeyFromUrl(url) {
  return typeof url === 'string' && url.startsWith('/static/')
    ? url.slice('/static/'.length)
    : null;
}

export function exercisesController({ daos, config, photoStorage }) {
  const dao = daos.exercises;
  const altDao = daos.exerciseAlternatives;
  const embedHost = config?.YOUTUBE_EMBED_HOST;
  const imageTypes = config?.EXERCISE_MEDIA_IMAGE_TYPES ?? [];
  const videoTypes = config?.EXERCISE_MEDIA_VIDEO_TYPES ?? [];

  const mediaBlock = (row) => ({
    image_url: row.media_image_url ?? null,
    video: classifyVideo(row.media_video_url, embedHost),
  });

  async function requireExercise(athleteId, id) {
    const row = await dao.findById(athleteId, id);
    if (!row) throw new HttpError(404, 'NOT_FOUND', `Exercise ${id} not found.`);
    return row;
  }

  async function bestEffortDelete(url) {
    const key = storageKeyFromUrl(url);
    if (key && photoStorage) {
      try {
        await photoStorage.delete(key);
      } catch {
        /* best effort — a missing file must not fail the request */
      }
    }
  }

  function intId(value, label = 'id') {
    const n = Number(value);
    if (!Number.isInteger(n)) throw new HttpError(400, 'VALIDATION_FAILED', `invalid ${label}`);
    return n;
  }

  return {
    async list(req, res, next) {
      try {
        const includeArchived =
          req.query.include_archived === '1' ||
          String(req.query.include_archived ?? '').toLowerCase() === 'true';
        const locale = req.query.locale ?? 'fr-FR';
        const data = await dao.listForAthlete({
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
        const row = await dao.create(req.athleteId, body);
        res.status(201).json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async patch(req, res, next) {
      try {
        const body = parse(patchSchema, req.body);
        const id = intId(req.params.id);
        await requireExercise(req.athleteId, id);
        const row = await dao.patch(req.athleteId, id, body);
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async destroy(req, res, next) {
      try {
        const id = intId(req.params.id);
        await requireExercise(req.athleteId, id);
        const refs = await dao.countReferences(req.athleteId, id);
        if (refs > 0) await dao.softDelete(req.athleteId, id);
        else await dao.hardDelete(req.athleteId, id);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    // ---- Media (US4) -----------------------------------------------------
    async uploadImage(req, res, next) {
      try {
        const id = intId(req.params.id);
        const existing = await requireExercise(req.athleteId, id);
        if (!req.file) throw new HttpError(400, 'VALIDATION_FAILED', 'file is required.');
        if (!imageTypes.includes(req.file.mimetype)) {
          throw new HttpError(
            415,
            'MEDIA_UNSUPPORTED_TYPE',
            `Unsupported image type "${req.file.mimetype}".`,
          );
        }
        const key = await photoStorage.put(req.athleteId, req.file.buffer, extFor(req.file));
        const row = await dao.setMedia(req.athleteId, id, 'media_image_url', photoStorage.url(key));
        await bestEffortDelete(existing.media_image_url);
        res.json({ data: mediaBlock(row) });
      } catch (err) {
        next(err);
      }
    },

    async clearImage(req, res, next) {
      try {
        const id = intId(req.params.id);
        const existing = await requireExercise(req.athleteId, id);
        await dao.setMedia(req.athleteId, id, 'media_image_url', null);
        await bestEffortDelete(existing.media_image_url);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    async setVideo(req, res, next) {
      try {
        const id = intId(req.params.id);
        const existing = await requireExercise(req.athleteId, id);

        let value;
        if (req.file) {
          if (!videoTypes.includes(req.file.mimetype)) {
            throw new HttpError(
              415,
              'MEDIA_UNSUPPORTED_TYPE',
              `Unsupported video type "${req.file.mimetype}".`,
            );
          }
          const key = await photoStorage.put(req.athleteId, req.file.buffer, extFor(req.file));
          value = photoStorage.url(key);
        } else if (req.body?.video_url) {
          const normalized = normalizeYoutubeUrl(req.body.video_url, embedHost);
          if (!normalized) {
            throw new HttpError(422, 'VALIDATION_FAILED', 'video_url is not a valid YouTube URL.');
          }
          value = normalized;
        } else {
          throw new HttpError(422, 'VALIDATION_FAILED', 'Provide a file or a video_url.');
        }

        const row = await dao.setMedia(req.athleteId, id, 'media_video_url', value);
        // Only purges the previous value when it was an uploaded file (not a link).
        await bestEffortDelete(existing.media_video_url);
        res.json({ data: mediaBlock(row) });
      } catch (err) {
        next(err);
      }
    },

    async clearVideo(req, res, next) {
      try {
        const id = intId(req.params.id);
        const existing = await requireExercise(req.athleteId, id);
        await dao.setMedia(req.athleteId, id, 'media_video_url', null);
        await bestEffortDelete(existing.media_video_url);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },

    // ---- Alternatives (US4) ---------------------------------------------
    async listAlternatives(req, res, next) {
      try {
        const id = intId(req.params.id);
        await requireExercise(req.athleteId, id);
        const rows = await altDao.listForSource(req.athleteId, id);
        res.json({
          data: rows.map((a) => ({
            exercise_id: a.alternative_exercise_id ?? a.exercises?.id,
            slug: a.exercises?.slug ?? null,
            name: a.exercises?.name ?? 'Exercice',
            is_active: a.exercises?.is_active ?? true,
          })),
        });
      } catch (err) {
        next(err);
      }
    },

    async addAlternative(req, res, next) {
      try {
        const id = intId(req.params.id);
        const altId = intId(req.body?.alternative_exercise_id, 'alternative_exercise_id');
        const displayOrder = Number.isInteger(Number(req.body?.display_order))
          ? Number(req.body.display_order)
          : 0;
        await requireExercise(req.athleteId, id);
        await requireExercise(req.athleteId, altId); // alternative must exist + be owned
        const row = await altDao.add(req.athleteId, id, altId, displayOrder);
        res.status(201).json({
          data: {
            exercise_id: row.alternative_exercise_id ?? row.exercises?.id ?? altId,
            slug: row.exercises?.slug ?? null,
            name: row.exercises?.name ?? 'Exercice',
            is_active: row.exercises?.is_active ?? true,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    async removeAlternative(req, res, next) {
      try {
        const id = intId(req.params.id);
        const altId = intId(req.params.alternativeId, 'alternativeId');
        await requireExercise(req.athleteId, id);
        await altDao.remove(req.athleteId, id, altId);
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
