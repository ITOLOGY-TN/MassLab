// Pure — attendance heatmap grading (Phase 11, research D-6). Buckets finished-session
// daily training volume into a calendar grid graded by volume: level 0 for any day with
// no completed session (rest/future days land here naturally), otherwise a quantile
// bucket 1..levels over the positive day-volumes. Emits one entry for EVERY date in
// [from,to] inclusive, ascending. No clock, no I/O, no globals (Constitution II + V) —
// the caller supplies the window and the rows.

const DAY_MS = 86400000;

function isoDay(d) {
  return d.toISOString().slice(0, 10);
}

// Ascending list of YYYY-MM-DD strings in [from,to] inclusive, via UTC date math.
function dateRange(from, to) {
  const out = [];
  let t = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  while (t <= end) {
    out.push(isoDay(new Date(t)));
    t += DAY_MS;
  }
  return out;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Grade per-day training volume into heatmap levels.
 * @param {object} args
 * @param {Array<{ ended_at: string, total_volume_kg: number }>} args.dailyVolumes
 *   finished sessions; reduced to a per-day sum keyed by the UTC day of `ended_at`.
 * @param {string} args.from   YYYY-MM-DD (inclusive)
 * @param {string} args.to     YYYY-MM-DD (inclusive)
 * @param {number} args.levels number of nonzero intensity buckets
 * @returns {{ from: string, to: string, levels: number,
 *            days: Array<{ date: string, volume_kg: number, level: number }> }}
 */
export function gradeByVolume({ dailyVolumes = [], from, to, levels }) {
  // Sum session volume per UTC calendar day.
  const totals = new Map();
  for (const s of dailyVolumes) {
    if (!s || s.ended_at == null) continue;
    const date = new Date(s.ended_at).toISOString().slice(0, 10);
    totals.set(date, (totals.get(date) ?? 0) + Number(s.total_volume_kg ?? 0));
  }

  // The sorted (ascending) list of positive day-volumes drives the quantile rank.
  const nonzero = [...totals.values()].filter((v) => v > 0).sort((a, b) => a - b);

  const days = dateRange(from, to).map((date) => {
    const volume_kg = totals.get(date) ?? 0;
    let level = 0;
    if (volume_kg > 0 && nonzero.length) {
      const rank = nonzero.filter((v) => v <= volume_kg).length;
      level = clamp(Math.ceil((rank / nonzero.length) * levels), 1, levels);
    }
    return { date, volume_kg, level };
  });

  return { from, to, levels, days };
}
