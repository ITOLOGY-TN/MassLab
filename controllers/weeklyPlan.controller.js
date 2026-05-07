export function weeklyPlanController(weeklyPlanDao) {
  return {
    async list(req, res, next) {
      try {
        const data = await weeklyPlanDao.listSlotsWithExercises(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
