// Pure — recommend the next working load from the last weight used and the
// athlete's active progression flag. Reuses the engine's persisted add_load
// delta (snapshotted on the flag by the progression engine) and falls back to
// the configured per-segment increment. No I/O, no clock (Constitution II + V).
// Phase 3: research D-3 / FR-018.
import { DEFAULTS } from './constants.js';

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * @param {object} args
 * @param {number|null} args.lastWeightKg  Heaviest completed set in the most recent session.
 * @param {{ flag_type: string, suggested_adjustment?: { delta_kg?: number } }|null} [args.activeFlag]
 * @param {'upper'|'lower'} [args.bodySegment]  Used only when the flag carries no delta snapshot.
 * @param {object} [args.constants]  Resolved engine constants (defaults ⊕ override).
 * @returns {number|null}  Recommended load in kg, or null when there is no history.
 */
export function recommendWorkingLoad({
  lastWeightKg,
  activeFlag = null,
  bodySegment = 'upper',
  constants = DEFAULTS,
} = {}) {
  if (lastWeightKg == null || !(Number(lastWeightKg) > 0)) return null;
  const last = Number(lastWeightKg);

  if (activeFlag?.flag_type === 'add_load') {
    const snapshot = activeFlag.suggested_adjustment?.delta_kg;
    const delta =
      snapshot != null
        ? Number(snapshot)
        : bodySegment === 'lower'
          ? constants.load_increment_lower_kg
          : constants.load_increment_upper_kg;
    return round1(last + delta);
  }

  // maintain / stagnation / regression / deload_suggested / no flag → hold.
  return round1(last);
}
