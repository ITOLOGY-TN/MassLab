// Pure — post-session summary numbers from COMPLETED sets only (FR-021/FR-022,
// FR-028, research D-11). No I/O, no clock, no globals (Constitution II + V).

function isCompleted(s) {
  return Boolean(s) && s.completed === true && Number(s.weight_kg) > 0 && Number(s.reps) > 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

/** Σ(weight × reps) over completed sets only. */
export function totalVolume(sets = []) {
  return round2(
    sets.filter(isCompleted).reduce((sum, s) => sum + Number(s.weight_kg) * Number(s.reps), 0),
  );
}

/**
 * The session's top performance: the single heaviest completed set, ties broken
 * by the higher rep count (FR-022, clarification Q3). Returns the set or null
 * when there are no completed sets.
 */
export function topPerformance(sets = []) {
  let best = null;
  for (const s of sets) {
    if (!isCompleted(s)) continue;
    if (
      best === null ||
      Number(s.weight_kg) > Number(best.weight_kg) ||
      (Number(s.weight_kg) === Number(best.weight_kg) && Number(s.reps) > Number(best.reps))
    ) {
      best = s;
    }
  }
  return best;
}
