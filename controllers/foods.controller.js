export function foodsController(foodsDao) {
  return {
    async list(req, res, next) {
      try {
        const locale = req.query.locale ?? 'fr-FR';
        const category = req.query.category;
        const data = await foodsDao.list({ athleteId: req.athleteId, locale, category });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
