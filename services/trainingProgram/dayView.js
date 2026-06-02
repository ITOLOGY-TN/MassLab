// Pure presenter — assemble the day detail view model: the slot's exercises in
// order, each with its last weight used and a progression indicator. No I/O
// (Constitution II). Phase 3: FR-007..FR-012; research D-4.

// research D-4 — map the five engine flag types onto the three UI states.
const INDICATOR_BY_FLAG = Object.freeze({
  add_load: 'ready_to_increase',
  regression: 'regressing',
  // maintain / stagnation / deload_suggested / none → 'stable'
});

export function mapProgression(flagType) {
  return INDICATOR_BY_FLAG[flagType] ?? 'stable';
}

/**
 * @param {object} input
 * @param {number} input.dayOfWeek
 * @param {{ exercises?: Array }} input.slot  The weekly_plan slot for the day.
 * @param {{ name: string, color: string }|null} input.muscleGroup
 * @param {Map<number, { slug, name, is_active }>} input.exerciseById  Catalogue.
 * @param {Map<number, number|null>} [input.lastWeightByExerciseId]
 * @param {Map<number, string|null>} [input.flagTypeByExerciseId]  scope_ref → flag_type.
 */
export function buildDayView({
  dayOfWeek,
  slot,
  muscleGroup = null,
  exerciseById = new Map(),
  lastWeightByExerciseId = new Map(),
  flagTypeByExerciseId = new Map(),
}) {
  const exercises = [...(slot?.exercises ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((se) => {
      const meta = exerciseById.get(se.exercise_id) ?? {};
      return {
        exercise_id: se.exercise_id,
        slug: meta.slug ?? null,
        name: meta.name ?? 'Exercice',
        position: se.position,
        target_sets: se.target_sets,
        target_reps_low: se.target_reps_low,
        target_reps_high: se.target_reps_high,
        is_active: meta.is_active ?? true,
        last_weight_kg: lastWeightByExerciseId.get(se.exercise_id) ?? null,
        progression: mapProgression(flagTypeByExerciseId.get(se.exercise_id) ?? null),
      };
    });

  return {
    day_of_week: dayOfWeek,
    muscle_group: muscleGroup,
    exercises,
    empty_exercises: exercises.length === 0,
  };
}
