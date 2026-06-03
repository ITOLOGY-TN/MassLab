// Phase 6 (009-body-weight-measurements) — /api/v1/body-tracking/* router:
// composed read screens + the progress-photo lifecycle. The multer instance +
// uploadSingle 413/400 wrapper mirror the Phase 3 exercise-media pattern, bound
// to BODY_PHOTO_MAX_BYTES.
import { Router } from 'express';
import multer from 'multer';
import { bodyTrackingController } from '../controllers/bodyTracking.controller.js';
import { HttpError } from '../middleware/errorHandler.js';

// Wrap multer's single-file middleware so size-limit errors become the canonical
// 413 envelope (FR-010) instead of a raw MulterError.
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

export function bodyTrackingRoutes({ daos, config, photoStorage }) {
  const c = bodyTrackingController({ daos, config, photoStorage });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config?.BODY_PHOTO_MAX_BYTES ?? 26214400 },
  });

  const r = Router();
  r.get('/weight-chart', c.weightChart);
  r.get('/measurements-table', c.measurementsTable);
  r.get('/photos', c.listPhotos);
  r.post('/photos', uploadSingle(upload), c.uploadPhoto);
  r.delete('/photos/:id', c.deletePhoto);

  return r;
}
