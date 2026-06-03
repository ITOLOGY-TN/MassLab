// Pure — map the persisted progression flags onto the overview's four per-exercise
// badges + the separate muscle-group deload notice (Phase 5, research D-5).
// Read-only: the engine emits add_load/regression at exercise scope and
// stagnation/deload_suggested at muscle-group scope; the per-exercise badge
// privileges the exercise's own flag and only falls back to its muscle group's
// stagnation. No I/O, no globals (Constitution II + V).

export const STATUS = Object.freeze({
  READY: 'ready_to_increase',
  MAINTAIN: 'maintain',
  STAGNATION: 'stagnation',
  REGRESSING: 'regressing',
});

/**
 * @param {object} args
 * @param {string|null} args.exerciseFlagType  active flag_type for the exercise scope
 * @param {string|null} args.muscleGroupFlagType  active flag_type for the exercise's muscle group
 * @returns {'ready_to_increase'|'maintain'|'stagnation'|'regressing'}
 */
export function overviewStatus({ exerciseFlagType = null, muscleGroupFlagType = null } = {}) {
  if (exerciseFlagType === 'add_load') return STATUS.READY;
  if (exerciseFlagType === 'regression') return STATUS.REGRESSING;
  if (muscleGroupFlagType === 'stagnation') return STATUS.STAGNATION;
  return STATUS.MAINTAIN;
}

/** Muscle-group scope_refs that currently carry an active deload suggestion. */
export function deloadMuscleGroups(activeFlags = []) {
  return activeFlags
    .filter((f) => f.scope_kind === 'muscle_group' && f.flag_type === 'deload_suggested')
    .map((f) => f.scope_ref);
}
