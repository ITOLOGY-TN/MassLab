export function exercisesController(exercisesDao) {
  return {
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const data = await exercisesDao.listForAthlete({ athleteId: req.athleteId, locale });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
