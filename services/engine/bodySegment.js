// Pure — classify an exercise as 'upper' or 'lower' body. Extracted from the
// inline derivation in controllers/progressionFlags.controller.js (research D-6)
// so Phase 1 progression eval and Phase 4 session finish / suggested target
// share one source of truth. No I/O, no globals (Constitution II + V).

const LOWER_KEYWORDS = ['legs', 'lower'];

/**
 * @param {{ slug?: string, targeted_muscles?: string[], muscle_group?: string }} exercise
 * @returns {'upper'|'lower'}
 */
export function bodySegmentFor(exercise = {}) {
  const slug = exercise.slug || '';
  const muscles = exercise.targeted_muscles || [];
  const bySlug = LOWER_KEYWORDS.some(
    (k) => slug.includes(k) || muscles.some((m) => String(m).toLowerCase().includes(k)),
  );
  const group = exercise.muscle_group;
  const byGroup = typeof group === 'string' && group.toLowerCase().includes('legs');
  return bySlug || byGroup ? 'lower' : 'upper';
}
