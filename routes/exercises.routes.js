import { Router } from 'express';
import multer from 'multer';
import { exercisesController } from '../controllers/exercises.controller.js';
import { HttpError } from '../middleware/errorHandler.js';

// Wrap multer's single-file middleware so size-limit errors become the
// canonical 413 envelope (FR-024) instead of a raw MulterError.
function uploadSingle(upload) {
  return (req, res, next) =>
    upload.single('file')(req, res, (err) => {
      if (!err) return next();
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(
          new HttpError(413, 'MEDIA_TOO_LARGE', 'Uploaded media exceeds the size limit.'),
        );
      }
      return next(new HttpError(400, 'VALIDATION_FAILED', err.message));
    });
}

/**
 * Phase 0 called this as `exercisesRoutes(dao)`. Phase 3 (US4) needs the full
 * deps for media uploads + alternatives, so it now takes `{ daos, config,
 * photoStorage }`. The legacy single-dao shape is still tolerated for callers
 * that only use the read/CRUD routes.
 */
export function exercisesRoutes(deps) {
  const args = deps?.daos ? deps : { daos: { exercises: deps } };
  const { config } = args;
  const c = exercisesController(args);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config?.EXERCISE_MEDIA_MAX_BYTES ?? 26214400 },
  });

  const r = Router();
  r.get('/', c.list);
  r.post('/', c.create);
  r.patch('/:id', c.patch);
  r.delete('/:id', c.destroy);

  // Media (US4)
  r.post('/:id/media/image', uploadSingle(upload), c.uploadImage);
  r.delete('/:id/media/image', c.clearImage);
  r.post('/:id/media/video', uploadSingle(upload), c.setVideo);
  r.delete('/:id/media/video', c.clearVideo);

  // Alternatives (US4)
  r.get('/:id/alternatives', c.listAlternatives);
  r.post('/:id/alternatives', c.addAlternative);
  r.delete('/:id/alternatives/:alternativeId', c.removeAlternative);

  return r;
}
