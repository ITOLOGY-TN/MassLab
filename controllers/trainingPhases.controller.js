export function trainingPhasesController(trainingPhasesDao) {
  return {
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const data = await trainingPhasesDao.listForAthlete({ athleteId: req.athleteId, locale });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
