// Pure — personal-record detection over a session's COMPLETED sets (FR-023,
// clarification Q3, research D-10). A PR is a completed set that beats the
// athlete's previous all-time heaviest completed set for the exercise, and/or
// yields a new highest estimated 1RM. Reuses heaviestCompletedSet + oneRepMax.
// No I/O, no clock, no globals (Constitution II + V).
import { heaviestCompletedSet } from './exerciseHistory.js';
import { oneRepMax } from './oneRepMax.js';
import { DEFAULTS } from './constants.js';

/**
 * @param {object} args
 * @param {number} args.exerciseId
 * @param {string} [args.name]
 * @param {Array} args.sessionCompletedSets  Completed sets for THIS exercise this session.
 * @param {{ weight_kg: number }|null} [args.priorHeaviestCompletedSet]  Prior all-time heaviest (excludes this session).
 * @param {number|null} [args.priorBestEstimate1rmKg]  Prior highest recorded estimate (excludes this session).
 * @param {object} [args.constants]  Resolved engine constants.
 * @returns {Array<{ exercise_id, name, kind: 'weight'|'estimated_1rm', value_kg, previous_kg }>}
 */
export function detectPersonalRecords({
  exerciseId,
  name = null,
  sessionCompletedSets = [],
  priorHeaviestCompletedSet = null,
  priorBestEstimate1rmKg = null,
  constants = DEFAULTS,
} = {}) {
  const records = [];
  const best = heaviestCompletedSet(sessionCompletedSets);
  if (!best) return records;

  // Weight PR — heaviest completed set beats the prior all-time heaviest.
  const priorWeight =
    priorHeaviestCompletedSet != null ? Number(priorHeaviestCompletedSet.weight_kg) : null;
  if (priorWeight == null || Number(best.weight_kg) > priorWeight) {
    records.push({
      exercise_id: exerciseId,
      name,
      kind: 'weight',
      value_kg: Number(best.weight_kg),
      previous_kg: priorWeight,
    });
  }

  // 1RM PR — the BEST estimate across every completed set this session (a
  // lighter high-rep set can out-estimate the heaviest set), vs the prior best.
  let estimate = 0;
  for (const s of sessionCompletedSets) {
    if (s.completed !== true) continue;
    if (!(Number(s.weight_kg) > 0) || !(Number(s.reps) > 0)) continue;
    const e = oneRepMax({
      weight_kg: Number(s.weight_kg),
      reps: Number(s.reps),
      constants,
    }).primary_estimate_kg;
    if (e > estimate) estimate = e;
  }
  const priorEstimate = priorBestEstimate1rmKg != null ? Number(priorBestEstimate1rmKg) : null;
  if (priorEstimate == null || estimate > priorEstimate) {
    records.push({
      exercise_id: exerciseId,
      name,
      kind: 'estimated_1rm',
      value_kg: estimate,
      previous_kg: priorEstimate,
    });
  }

  return records;
}
