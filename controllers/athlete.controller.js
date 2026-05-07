import { HttpError } from '../middleware/errorHandler.js';

export function athleteController(athletesDao) {
  return {
    async getMe(req, res, next) {
      try {
        const a = await athletesDao.findById(req.athleteId);
        if (!a) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');
        res.json({ data: a });
      } catch (err) {
        next(err);
      }
    },
  };
}
