// Pure — stress-vs-weight correlation pairing (Phase 11, research D-9). Joins recovery
// check-ins and body-weight entries on the calendar date, emitting a point ONLY for a
// date that has BOTH a non-null stress reading and a non-null weight, ascending by date.
// `sufficient` reports whether enough paired points exist to draw the correlation.
// No clock, no I/O, no globals (Constitution II + V).

/**
 * @param {object} args
 * @param {Array<{ logged_on: string, stress: number|null }>} args.checkins
 * @param {Array<{ measured_on: string, weight_kg: number|null }>} args.weights
 * @param {number} args.minPoints  minimum paired points for `sufficient`
 * @returns {{ points: Array<{ date: string, stress: number, weight_kg: number }>,
 *            sufficient: boolean }}
 */
export function pairStressWeight({ checkins = [], weights = [], minPoints }) {
  // Latest-wins per date is unnecessary here (one row per day), but be defensive and
  // index by date so the join is O(n).
  const stressByDate = new Map();
  for (const c of checkins) {
    if (!c || c.logged_on == null || c.stress == null) continue;
    stressByDate.set(String(c.logged_on), Number(c.stress));
  }

  const weightByDate = new Map();
  for (const w of weights) {
    if (!w || w.measured_on == null || w.weight_kg == null) continue;
    weightByDate.set(String(w.measured_on), Number(w.weight_kg));
  }

  const points = [];
  for (const [date, stress] of stressByDate) {
    if (weightByDate.has(date)) {
      points.push({ date, stress, weight_kg: weightByDate.get(date) });
    }
  }
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  return { points, sufficient: points.length >= minPoints };
}
