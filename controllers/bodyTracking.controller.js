// Phase 6 (009-body-weight-measurements) — composed read screens + progress-photo
// lifecycle under /api/v1/body-tracking/*. Controllers orchestrate: they read
// DAOs and hand plain data to the pure presenters in services/bodyTracking/*.
//
// US1 fills uploadPhoto; US2 (weightChart), US3 (measurementsTable), and US4
// (listPhotos/deletePhoto) fill the remaining handlers in their own waves.
import { HttpError } from '../middleware/errorHandler.js';
import { build as buildWeightChart } from '../services/bodyTracking/weightChartView.js';
import { build as buildMeasurementsTable } from '../services/bodyTracking/measurementsTableView.js';
import { build as buildPhotoGallery } from '../services/bodyTracking/photoGalleryView.js';

// Derive a file extension from the upload's name or mimetype (jpeg → jpg),
// mirroring the Phase 3 exercise-media helper.
function extFor(file) {
  const fromName = file.originalname?.includes('.') ? file.originalname.split('.').pop() : '';
  if (fromName) return fromName.toLowerCase();
  const sub = (file.mimetype ?? '').split('/')[1] ?? 'bin';
  return sub === 'jpeg' ? 'jpg' : sub;
}

// Parse an optional numeric form field; blanks become null (the overlay weight
// is optional — a photo may be uploaded on a date with no weight logged, D-3).
function optionalNumber(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// I1 — explicit high read limit so the 5-month weigh-in series is never silently
// truncated by the DAO default of 50.
const HISTORY_READ_LIMIT = 1000;

export function bodyTrackingController({ daos, config, photoStorage, now = () => new Date() }) {
  const imageTypes = config?.BODY_PHOTO_IMAGE_TYPES ?? [];

  return {
    // T024 [US2] — composed weight-chart view (curve + goal line + ideal zone +
    // phase markers). Reads the full weigh-in history (I1), the athlete profile
    // (starting/target weight + program_start_date), and the training phases, then
    // hands plain data to the pure presenter. `asOf` is the server's current date
    // read once at this boundary (Constitution: no clock inside pure services).
    async weightChart(req, res, next) {
      try {
        const [measurements, profile, phases] = await Promise.all([
          daos.bodyMeasurements.listForAthlete(req.athleteId, { limit: HISTORY_READ_LIMIT }),
          daos.athletes.findById(req.athleteId),
          daos.trainingPhases.listForAthlete({ athleteId: req.athleteId }),
        ]);
        const data = buildWeightChart({ measurements, profile, phases, asOf: now() });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T032 [US3] — monthly measurements table with month-over-month deltas. Reads
    // the full history (I1) and hands it to the pure presenter.
    async measurementsTable(req, res, next) {
      try {
        const measurements = await daos.bodyMeasurements.listForAthlete(req.athleteId, {
          limit: HISTORY_READ_LIMIT,
        });
        const data = buildMeasurementsTable({ measurements });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T039 [US4] — progress-photo gallery (date-desc, resolved served URLs).
    async listPhotos(req, res, next) {
      try {
        const rows = await daos.athletePhotos.listForAthlete(req.athleteId);
        const data = buildPhotoGallery({ rows, url: photoStorage.url });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    // T014 [US1] — dedicated photo upload (D-3). The 413 size cap is handled by
    // the multer `uploadSingle` wrapper before this runs; here we enforce the
    // mimetype allow-list (FR-010), store the file via the adapter, then persist
    // the row. A failed file write never touches the already-saved weigh-in.
    async uploadPhoto(req, res, next) {
      try {
        if (!req.file) throw new HttpError(400, 'VALIDATION_FAILED', 'file is required.');
        if (!imageTypes.includes(req.file.mimetype)) {
          throw new HttpError(
            400,
            'VALIDATION_FAILED',
            `Unsupported image type "${req.file.mimetype}".`,
          );
        }
        const takenOn = req.body?.taken_on;
        if (!takenOn) throw new HttpError(400, 'VALIDATION_FAILED', 'taken_on is required.');

        const storageKey = await photoStorage.put(req.athleteId, req.file.buffer, extFor(req.file));
        let row;
        try {
          row = await daos.athletePhotos.insert({
            athlete_id: req.athleteId,
            taken_on: takenOn,
            storage_key: storageKey,
            weight_overlay_kg: optionalNumber(req.body?.weight_overlay_kg),
            note: req.body?.note ?? null,
          });
        } catch (err) {
          // The row write failed after the file was stored — remove the now-orphaned
          // file (best-effort) so a failed insert never leaks storage, then rethrow.
          try {
            await photoStorage.delete(storageKey);
          } catch {
            // ignore — surface the original insert error below
          }
          throw err;
        }

        res.status(201).json({
          data: {
            id: row.id,
            takenOn: row.taken_on,
            weightKg: row.weight_overlay_kg ?? null,
            url: photoStorage.url(row.storage_key),
            note: row.note ?? null,
          },
        });
      } catch (err) {
        next(err);
      }
    },

    // T039 [US4] — delete a progress photo: remove the row then best-effort
    // remove the stored file (FR-012). 404 when the photo is absent or not owned
    // by the request athlete (the DAO scopes findById by athlete_id).
    async deletePhoto(req, res, next) {
      try {
        const row = await daos.athletePhotos.findById(req.athleteId, req.params.id);
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'Photo not found.');
        await daos.athletePhotos.delete(req.athleteId, req.params.id);
        try {
          await photoStorage.delete(row.storage_key);
        } catch {
          // Best-effort file cleanup — a missing/already-gone file must not fail
          // the delete (the row, the source of truth, is already removed).
        }
        res.status(204).end();
      } catch (err) {
        next(err);
      }
    },
  };
}
