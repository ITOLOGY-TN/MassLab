import { HttpError } from '../middleware/errorHandler.js';

export function quotesController(quotesDao) {
  return {
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const data = await quotesDao.list({ athleteId: req.athleteId, locale });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async getToday(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const data = await quotesDao.pickToday({ athleteId: req.athleteId, locale });
        if (!data) throw new HttpError(404, 'NOT_FOUND', 'No quotes available for this locale');
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
