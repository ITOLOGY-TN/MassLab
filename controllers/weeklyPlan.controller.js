import { HttpError } from '../middleware/errorHandler.js';
import { validateSchedule } from '../services/scheduleValidator.js';

function buildScheduleEnvelope(slots) {
  return {
    active_days: slots.length,
    slots: slots.map((s) => ({
      id: s.id,
      day_of_week: s.day_of_week,
      muscle_group_id: s.muscle_group_id,
      display_order: s.display_order,
      display_color: s.display_color,
      exercises: s.exercises ?? [],
    })),
  };
}

export function weeklyPlanController({ daos }) {
  const dao = daos.weeklyPlan;

  return {
    async list(req, res, next) {
      try {
        const data = await dao.listSlotsWithExercises(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async getSchedule(req, res, next) {
      try {
        const slots = await dao.listSlotsWithExercises(req.athleteId);
        res.json({ data: buildScheduleEnvelope(slots) });
      } catch (err) {
        next(err);
      }
    },

    async replaceSchedule(req, res, next) {
      try {
        const validation = validateSchedule(req.body);
        if (!validation.ok) {
          throw new HttpError(400, 'VALIDATION_FAILED', validation.errors[0].message, {
            errors: validation.errors,
          });
        }

        // Validate every referenced muscle_group_id belongs to the athlete and
        // is active. This is the FK + RLS guarantee, but checking up-front
        // lets us return a clean 400 instead of a 500 from the DB layer.
        const groups = await daos.muscleGroups.listForAthlete(req.athleteId, {
          includeArchived: true,
        });
        const groupById = new Map(groups.map((g) => [g.id, g]));
        for (const slot of req.body.slots) {
          const g = groupById.get(slot.muscle_group_id);
          if (!g) {
            throw new HttpError(
              400,
              'VALIDATION_FAILED',
              `muscle_group_id=${slot.muscle_group_id} does not belong to this athlete.`,
            );
          }
          if (!g.is_active) {
            throw new HttpError(
              400,
              'VALIDATION_FAILED',
              `muscle_group_id=${slot.muscle_group_id} is archived; restore or pick another.`,
            );
          }
        }

        // FR-008 conflict check: reject if a session is in progress on a day
        // the new schedule deactivates, unless ?force=1.
        const force = req.query.force === '1' || req.query.force === 'true';
        if (!force) {
          const inProgressDays = await dao.findInProgressSessionDays(req.athleteId);
          const newDays = new Set(req.body.slots.map((s) => s.day_of_week));
          const dropped = inProgressDays.filter((d) => !newDays.has(d));
          if (dropped.length) {
            throw new HttpError(
              409,
              'CONFLICT',
              'A session is in progress on a day this replace would drop. Resend with ?force=1 to override.',
              { in_progress_days: dropped },
            );
          }
        }

        const slots = await dao.replaceSchedule(req.athleteId, req.body);
        res.json({ data: buildScheduleEnvelope(slots) });
      } catch (err) {
        next(err);
      }
    },

    async reorderSlotExercises(req, res, next) {
      try {
        const slotId = Number(req.params.slotId);
        if (!Number.isInteger(slotId)) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'invalid slotId');
        }
        const orderedIds = req.body?.ordered_exercise_ids;
        if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'ordered_exercise_ids is required.');
        }
        await dao.reorderSlotExercises(slotId, req.athleteId, orderedIds);
        const slots = await dao.listSlotsWithExercises(req.athleteId);
        const slot = slots.find((s) => s.id === slotId);
        if (!slot) throw new HttpError(404, 'NOT_FOUND', 'slot not found');
        res.json({
          data: {
            id: slot.id,
            day_of_week: slot.day_of_week,
            muscle_group_id: slot.muscle_group_id,
            display_order: slot.display_order,
            display_color: slot.display_color,
            exercises: slot.exercises,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
