// Pure presenter — assemble the weekly planning view model from the schedule
// slots + the muscle-group catalogue. No I/O, no globals (Constitution II).
// Phase 3: FR-001..FR-006; data-model.md §3.1.

const DEFAULT_COLOR = '#6b7280';

/**
 * @param {object} input
 * @param {Array<{ id, day_of_week, muscle_group_id, display_color, exercises?: Array }>} input.slots
 *        Schedule slots (from weeklyPlan.dao.listSlotsWithExercises).
 * @param {Array<{ id, name, display_color }>} input.muscleGroups  Per-athlete catalogue.
 * @returns {{ days: Array, training_day_count: number, empty: boolean }}
 */
export function buildWeekView({ slots = [], muscleGroups = [] } = {}) {
  const mgById = new Map(muscleGroups.map((m) => [m.id, m]));
  const slotByDay = new Map(slots.map((s) => [s.day_of_week, s]));

  const days = [];
  for (let dow = 1; dow <= 7; dow += 1) {
    const slot = slotByDay.get(dow);
    if (!slot) {
      days.push({
        day_of_week: dow,
        kind: 'rest',
        slot_id: null,
        muscle_group: null,
        exercise_count: null,
      });
      continue;
    }
    const mg = mgById.get(slot.muscle_group_id);
    days.push({
      day_of_week: dow,
      kind: 'training',
      slot_id: slot.id,
      muscle_group: {
        name: mg?.name ?? 'Unassigned',
        color: slot.display_color ?? mg?.display_color ?? DEFAULT_COLOR,
      },
      exercise_count: Array.isArray(slot.exercises) ? slot.exercises.length : 0,
    });
  }

  const training_day_count = days.filter((d) => d.kind === 'training').length;
  return { days, training_day_count, empty: training_day_count === 0 };
}
