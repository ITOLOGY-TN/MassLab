// Pure presenter — compose the body-weight chart view model from injected DAO
// output (Phase 6, research D-6/D-7). Assembles the weight curve, the goal line,
// the ideal-progression zone, the phase-boundary markers, and a `hasTrend` flag.
// No I/O, no clock — the caller passes `asOf` (Constitution II + V).
import { idealZone, phaseBoundaries } from '../engine/weightTrajectory.js';

/**
 * @param {object} args
 * @param {Array<{ measured_on: string, weight_kg: number|null }>} args.measurements
 *   weigh-in rows (any order); only those with a non-null `weight_kg` become points.
 * @param {object} [args.profile]  athlete profile context
 * @param {number|null} [args.profile.starting_weight_kg]  ideal-zone start (FR-018)
 * @param {number|null} [args.profile.target_weight_kg]    goal line + ideal-zone target (FR-017/FR-018)
 * @param {string|null} [args.profile.program_start_date]  time-axis origin + phase markers
 * @param {Array} [args.phases]  training phases (for the boundary markers, FR-019)
 * @param {Date|string|number} [args.asOf]  caller-supplied "now"
 * @returns {{
 *   points: Array<{date:string, kg:number}>,
 *   goalKg: number|null,
 *   zone: {lower:Array, upper:Array}|null,
 *   phaseMarkers: Array<{name:string|null, date:string}>,
 *   hasTrend: boolean
 * }}
 */
export function build({ measurements = [], profile = {}, phases = [], asOf } = {}) {
  const startDate = profile?.program_start_date ?? null;

  // Points: weight_kg non-null, date-ascending, from the program start date when
  // it is known (FR-016). Without a start date we still plot every weigh-in.
  const points = measurements
    .filter((m) => m?.weight_kg != null)
    .filter((m) => startDate == null || m.measured_on >= startDate)
    .map((m) => ({ date: m.measured_on, kg: Number(m.weight_kg) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const goalKg = profile?.target_weight_kg ?? null;

  // Total program weeks = sum of phase durations (drives the ideal-zone window).
  const totalWeeks = phases.reduce((sum, p) => sum + (Number(p?.weeks) || 0), 0) || null;

  const zone = idealZone({
    startKg: profile?.starting_weight_kg ?? null,
    targetKg: profile?.target_weight_kg ?? null,
    startDate,
    totalWeeks,
    asOf,
  });

  const phaseMarkers = phaseBoundaries({ startDate, phases });

  return {
    points,
    goalKg,
    zone,
    phaseMarkers,
    hasTrend: points.length >= 2, // FR-020 — false at 0 or 1 logged entries
  };
}
