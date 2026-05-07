export function nutritionController(nutritionDao) {
  return {
    async getTemplate(req, res, next) {
      try {
        const data = await nutritionDao.listTemplateMeals(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
