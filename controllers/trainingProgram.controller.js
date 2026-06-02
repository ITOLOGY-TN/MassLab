// Phase 3 (006-training-program-library) — composed read models for the
// Training Program surface. Thin orchestration only: read DAOs, hand plain
// data to the pure presenters, return the `{ data }` envelope. research D-9.
import { buildWeekView } from '../services/trainingProgram/weekView.js';

export function trainingProgramController({ daos }) {
  return {
    // GET /api/v1/program/week — US1 (FR-001..FR-006).
    async getWeek(req, res, next) {
      try {
        const [slots, muscleGroups] = await Promise.all([
          daos.weeklyPlan.listSlotsWithExercises(req.athleteId),
          // include archived so a slot pointing at an archived group still resolves its name
          daos.muscleGroups.listForAthlete(req.athleteId, { includeArchived: true }),
        ]);
        res.json({ data: buildWeekView({ slots, muscleGroups }) });
      } catch (err) {
        next(err);
      }
    },
  };
}
