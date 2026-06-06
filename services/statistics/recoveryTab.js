// Pure — Recovery tab presenter (Phase 11, data-model §3). Builds the sleep-hours trend
// (points + average) from recovery check-ins and the stress-vs-weight correlation series
// (paired only when both readings exist for a date) via the pure engine helper. No I/O,
// no clock, no @supabase import.
import { pairStressWeight } from '../engine/stressWeightSeries.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} args
 * @param {Array<{ logged_on: string, sleep_hours: number|null, stress: number|null }>} args.checkins
 * @param {Array<{ measured_on: string, weight_kg: number|null }>} args.weights
 * @param {number} args.minPoints  sufficiency threshold for the correlation
 * @returns {{ sleep: { points: Array<{ date, hours }>, average_hours: number|null },
 *            stress_weight: { points, sufficient } }}
 */
export function build({ checkins = [], weights = [], minPoints }) {
  const sleepPoints = checkins
    .filter((c) => c && c.logged_on != null && c.sleep_hours != null)
    .map((c) => ({ date: String(c.logged_on), hours: Number(c.sleep_hours) }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const average_hours = sleepPoints.length
    ? round2(sleepPoints.reduce((sum, p) => sum + p.hours, 0) / sleepPoints.length)
    : null;

  return {
    sleep: { points: sleepPoints, average_hours },
    stress_weight: pairStressWeight({ checkins, weights, minPoints }),
  };
}
