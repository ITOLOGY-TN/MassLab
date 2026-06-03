// Pure — recovery trend aggregations (Phase 9, FR-013/FR-014/FR-015, data-model.md §4b).
// No I/O, no clock, no globals (Constitution II + V). Callers supply the window bounds.
// Dates are handled as plain ISO `YYYY-MM-DD` day strings (no timezone math).

const DAY_MS = 86_400_000;

// Parse a `YYYY-MM-DD` day string to a UTC-midnight epoch (tz-stable).
function dayMs(isoDay) {
  return Date.parse(`${String(isoDay).slice(0, 10)}T00:00:00.000Z`);
}

// Format a UTC-midnight epoch back to a `YYYY-MM-DD` day string.
function msDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// A signal is "present" when it carries an actual value — 0 counts, null/undefined do not.
function hasValue(v) {
  return v !== null && v !== undefined;
}

/**
 * Monthly energy heatmap — one cell per calendar day of the month, ascending.
 * `energy = null` for days with no check-in (rendered uncolored, FR-013). A genuine
 * `energy: 0` is preserved (distinct from a missing check-in's null).
 * @param {Array<{ logged_on, energy }>} checkins
 * @param {{ year: number, month: number }} opts  month is 1–12
 * @returns {{ year: number, month: number, cells: Array<{ date: string, energy: number|null }> }}
 */
export function energyHeatmap(checkins = [], { year, month } = {}) {
  // Index energy by day, but only for days inside the requested month.
  const prefix = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
  const byDay = new Map();
  for (const c of checkins ?? []) {
    const date = String(c?.logged_on ?? '').slice(0, 10);
    if (!date.startsWith(prefix)) continue;
    byDay.set(date, hasValue(c?.energy) ? c.energy : null);
  }

  // Day count for the month (day 0 of the next month = last day of this one).
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    const date = `${prefix}-${String(d).padStart(2, '0')}`;
    cells.push({ date, energy: byDay.has(date) ? byDay.get(date) : null });
  }

  return { year, month, cells };
}

/**
 * Sleep-vs-performance scatter. Emits a point ONLY for days present in BOTH `checkins`
 * (with an actual sleep value) and `volumeByDay` (FR-014, "missing pairs" edge case).
 * Points are ascending by date.
 * @param {Array<{ logged_on, sleep_hours }>} checkins
 * @param {Record<string, number>} volumeByDay  `{ 'YYYY-MM-DD': total_volume_kg }`
 * @returns {Array<{ date: string, sleep_hours: number, volume_kg: number }>}
 */
export function sleepPerformanceScatter(checkins = [], volumeByDay = {}) {
  // Last sleep value wins per day (one check-in per day in practice).
  const sleepByDay = new Map();
  for (const c of checkins ?? []) {
    if (!hasValue(c?.sleep_hours)) continue;
    const date = String(c?.logged_on ?? '').slice(0, 10);
    sleepByDay.set(date, c.sleep_hours);
  }

  const points = [];
  for (const [date, sleep_hours] of sleepByDay) {
    if (!Object.prototype.hasOwnProperty.call(volumeByDay ?? {}, date)) continue;
    points.push({ date, sleep_hours, volume_kg: volumeByDay[date] });
  }

  return points.sort((a, b) => dayMs(a.date) - dayMs(b.date));
}

/**
 * Energy/stress/sleep overlay aligned over the inclusive `[from, to]` day axis.
 * Gaps (no check-in, or a signal absent on a logged day) are `null` — never `0`.
 * Each signal is independent: a partially-filled day can be `[6, null, null]`.
 * @param {Array<{ logged_on, energy, stress, sleep_hours }>} checkins
 * @param {{ from: string, to: string }} opts
 * @returns {{ days: string[], energy: (number|null)[], stress: (number|null)[], sleep: (number|null)[] }}
 */
export function overlapSeries(checkins = [], { from, to } = {}) {
  const byDay = new Map();
  for (const c of checkins ?? []) {
    const date = String(c?.logged_on ?? '').slice(0, 10);
    byDay.set(date, c);
  }

  const days = [];
  const energy = [];
  const stress = [];
  const sleep = [];

  const endMs = dayMs(to);
  for (let ms = dayMs(from); ms <= endMs; ms += DAY_MS) {
    const date = msDay(ms);
    const c = byDay.get(date);
    days.push(date);
    energy.push(c && hasValue(c.energy) ? c.energy : null);
    stress.push(c && hasValue(c.stress) ? c.stress : null);
    sleep.push(c && hasValue(c.sleep_hours) ? c.sleep_hours : null);
  }

  return { days, energy, stress, sleep };
}
