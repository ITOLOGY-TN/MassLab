// Phase 3 (006-training-program-library) — composed read models for the
// Training Program surface. Thin orchestration only: read DAOs, hand plain
// data to the pure presenters, return the `{ data }` envelope. research D-9.
import { HttpError } from '../middleware/errorHandler.js';
import { buildWeekView } from '../services/trainingProgram/weekView.js';
import { buildDayView } from '../services/trainingProgram/dayView.js';
import { lastWeightUsed } from '../services/engine/exerciseHistory.js';

// Active exercise flags are keyed by scope_ref = String(exercise_id).
function flagTypeMap(activeFlags) {
  const m = new Map();
  for (const f of activeFlags) {
    if (f.scope_kind === 'exercise') m.set(Number(f.scope_ref), f.flag_type);
  }
  return m;
}

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

    // GET /api/v1/program/day/:dayOfWeek — US2 (FR-007..FR-012).
    async getDay(req, res, next) {
      try {
        const dayOfWeek = Number(req.params.dayOfWeek);
        if (!Number.isInteger(dayOfWeek) || dayOfWeek < 1 || dayOfWeek > 7) {
          throw new HttpError(404, 'NOT_FOUND', 'dayOfWeek must be an integer 1–7.');
        }

        const [slots, muscleGroups, exercises, activeFlags] = await Promise.all([
          daos.weeklyPlan.listSlotsWithExercises(req.athleteId),
          daos.muscleGroups.listForAthlete(req.athleteId, { includeArchived: true }),
          daos.exercises.listForAthlete({ athleteId: req.athleteId, includeArchived: true }),
          daos.progressionFlags.findActiveForAthlete(req.athleteId),
        ]);

        const slot = slots.find((s) => s.day_of_week === dayOfWeek);
        if (!slot) {
          throw new HttpError(404, 'NOT_FOUND', `Day ${dayOfWeek} is not a training day.`);
        }

        const mg = muscleGroups.find((g) => g.id === slot.muscle_group_id);
        const muscleGroup = {
          name: mg?.name ?? 'Unassigned',
          color: slot.display_color ?? mg?.display_color ?? '#6b7280',
        };
        const exerciseById = new Map(
          exercises.map((e) => [e.id, { slug: e.slug, name: e.name, is_active: e.is_active }]),
        );

        // Last weight per exercise — one indexed read each (bounded by slot size).
        const lastWeightByExerciseId = new Map(
          await Promise.all(
            (slot.exercises ?? []).map(async (se) => {
              const sessions = await daos.sessions.recentSessionsForExercise(
                req.athleteId,
                se.exercise_id,
                { limit: 5 },
              );
              return [se.exercise_id, lastWeightUsed(sessions)];
            }),
          ),
        );

        res.json({
          data: buildDayView({
            dayOfWeek,
            slot,
            muscleGroup,
            exerciseById,
            lastWeightByExerciseId,
            flagTypeByExerciseId: flagTypeMap(activeFlags),
          }),
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
