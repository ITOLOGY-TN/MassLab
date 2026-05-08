import { HttpError } from '../middleware/errorHandler.js';

export function nutritionController({ daos }) {
  return {
    async getTemplate(req, res, next) {
      try {
        const data = await daos.nutrition.listTemplateMeals(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async getTargets(req, res, next) {
      try {
        const program = await daos.generatedPrograms.findActiveForAthlete(req.athleteId);
        if (!program) {
          throw new HttpError(
            404,
            'NOT_FOUND',
            'No active program. Run npm run seed or POST /api/v1/program/regenerate.',
          );
        }
        const n = program.payload?.nutrition ?? {};
        res.json({
          data: {
            tdee_kcal: n.tdee_kcal ?? n.tdee,
            daily_kcal: n.daily_kcal,
            macros: n.macros,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
