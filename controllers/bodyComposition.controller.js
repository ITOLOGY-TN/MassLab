import { HttpError } from '../middleware/errorHandler.js';

export function bodyCompositionController({ daos }) {
  return {
    async list(req, res, next) {
      try {
        const data = await daos.bodyComposition.listForAthlete(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async latest(req, res, next) {
      try {
        const row = await daos.bodyComposition.latestForAthlete(req.athleteId);
        if (!row) throw new HttpError(404, 'NOT_FOUND', 'No body composition row yet.');
        res.json({ data: row });
      } catch (err) {
        next(err);
      }
    },
  };
}
