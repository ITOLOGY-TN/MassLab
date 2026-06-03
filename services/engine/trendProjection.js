// Pure — estimated-1RM time series, 30-day trend, and 8-week least-squares
// projection (Phase 5, research D-1/D-2/D-3). No I/O, no clock inside (caller
// supplies `now`); deterministic (Constitution II + V).

const DAY_MS = 86_400_000;

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Normalize `one_rep_max_records` rows into an ascending series.
 * @param {Array<{ created_at, source_weight_kg, primary_estimate_kg }>} records
 * @returns {Array<{ date, t, estimate_1rm_kg, working_load_kg }>}
 */
export function oneRmSeries(records = []) {
  return records
    .filter((r) => Number(r.primary_estimate_kg) > 0)
    .map((r) => ({
      date: String(r.created_at).slice(0, 10),
      t: new Date(r.created_at).getTime(),
      estimate_1rm_kg: Number(r.primary_estimate_kg),
      working_load_kg: Number(r.source_weight_kg),
    }))
    .sort((a, b) => a.t - b.t);
}

/**
 * Direction of the estimated-1RM change over the last `windowDays` (default 30):
 * `flat` when |change_pct| ≤ `flatBandPct` (a fixed 1% presentation dead-band —
 * NOT the engine's on_pace_pct_per_month). Neutral (null) when < 2 points are in
 * the window (D-3, FR-008).
 * @returns {{ direction: 'up'|'flat'|'down', change_pct: number }|null}
 */
export function trendDirection({ series = [], windowDays = 30, flatBandPct = 1, now } = {}) {
  if (!series.length) return null;
  const nowMs = now != null ? new Date(now).getTime() : series[series.length - 1].t;
  const cutoff = nowMs - windowDays * DAY_MS;
  const win = series.filter((p) => p.t >= cutoff);
  if (win.length < 2) return null;
  const first = win[0].estimate_1rm_kg;
  const last = win[win.length - 1].estimate_1rm_kg;
  if (!(first > 0)) return null;
  // Classify on the UNROUNDED change so e.g. 1.04% isn't rounded into the flat band.
  const rawPct = ((last - first) / first) * 100;
  const direction = Math.abs(rawPct) <= flatBandPct ? 'flat' : rawPct > 0 ? 'up' : 'down';
  return { direction, change_pct: round1(rawPct) };
}

/**
 * 8-week forward projection of the estimated-1RM trend via a least-squares
 * linear fit (x = days since the first point, y = estimate). Returns null when
 * fewer than `minPoints` (default 3) points exist or the fit is degenerate
 * (D-2, FR-015). Projection points are dotted/labelled by the chart.
 * @returns {{ method, weeks_ahead, points: Array<{ date, estimate_1rm_kg }> }|null}
 */
export function projectOneRm({ series = [], weeksAhead = 8, minPoints = 3 } = {}) {
  if (series.length < minPoints) return null;
  const t0 = series[0].t;
  const xs = series.map((p) => (p.t - t0) / DAY_MS);
  const ys = series.map((p) => p.estimate_1rm_kg);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null; // all points on the same day → no slope
  const slope = (n * sxy - sx * sy) / denom;
  const intercept = (sy - slope * sx) / n;

  const lastT = series[series.length - 1].t;
  const points = [];
  for (let w = 1; w <= weeksAhead; w += 1) {
    const tMs = lastT + w * 7 * DAY_MS;
    const x = (tMs - t0) / DAY_MS;
    points.push({
      date: new Date(tMs).toISOString().slice(0, 10),
      estimate_1rm_kg: round1(intercept + slope * x),
    });
  }
  return { method: 'least_squares_linear', weeks_ahead: weeksAhead, points };
}
