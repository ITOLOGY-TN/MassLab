// Pure — nutrition trend aggregations (Phase 7, FR-017/FR-018/FR-019, research D-7).
// No I/O, no clock, no globals (Constitution II + V). Callers supply `asOf`.
// Dates are handled as plain ISO `YYYY-MM-DD` day strings (no timezone math).

const DAY_MS = 86_400_000;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(n) {
  return Number(n) || 0;
}

// Parse a `YYYY-MM-DD` day string to a UTC-midnight epoch (tz-stable).
function dayMs(isoDay) {
  return Date.parse(`${String(isoDay).slice(0, 10)}T00:00:00.000Z`);
}

// Format a UTC-midnight epoch back to a `YYYY-MM-DD` day string.
function msDay(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Daily kcal totals over the trailing `days`-day window ending at `asOf`
 * (inclusive), date-ascending. Every day in the window is present; days with no
 * entries surface as `kcal: 0` (FR-017). Entries carry `{ logged_on, kcal }`.
 * @returns {Array<{ date: string, kcal: number }>}
 */
export function caloriesByDay(entries = [], { days = 30, asOf } = {}) {
  const endMs = dayMs(asOf);
  const startMs = endMs - (days - 1) * DAY_MS;

  const totals = new Map();
  for (const e of entries) {
    const t = dayMs(e?.logged_on);
    if (Number.isNaN(t) || t < startMs || t > endMs) continue;
    const key = msDay(t);
    totals.set(key, (totals.get(key) ?? 0) + num(e?.kcal));
  }

  const series = [];
  for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
    const date = msDay(ms);
    series.push({ date, kcal: round2(totals.get(date) ?? 0) });
  }
  return series;
}

/**
 * Macro gram totals for a single day's entries plus each macro's fraction of
 * the total macro grams (FR-018). Fractions sum to 1 for a non-empty day and
 * are all 0 (never NaN) when there are no macro grams.
 * @param {Array<{ protein_g, carbs_g, fat_g }>} dayEntries
 * @returns {{ protein_g, carbs_g, fat_g, fractions: { protein, carbs, fat } }}
 */
export function macroBreakdown(dayEntries = []) {
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const e of dayEntries) {
    protein += num(e?.protein_g);
    carbs += num(e?.carbs_g);
    fat += num(e?.fat_g);
  }
  const protein_g = round2(protein);
  const carbs_g = round2(carbs);
  const fat_g = round2(fat);
  const total = protein + carbs + fat;
  const frac = (g) => (total > 0 ? g / total : 0);
  return {
    protein_g,
    carbs_g,
    fat_g,
    fractions: { protein: frac(protein), carbs: frac(carbs), fat: frac(fat) },
  };
}

// Monday-anchored ISO week start (`YYYY-MM-DD`) for a given day epoch.
function isoWeekStartMs(ms) {
  const dow = new Date(ms).getUTCDay(); // 0=Sun … 6=Sat
  const offset = (dow + 6) % 7; // days since Monday
  return ms - offset * DAY_MS;
}

/**
 * Mean daily protein per ISO week (Monday-anchored), chronological (FR-019).
 * The average is over that week's LOGGED days (days with entries), NOT /7, so
 * partial weeks are handled. Multiple entries on a day are summed first.
 * @param {Array<{ logged_on, protein_g }>} entries
 * @returns {Array<{ weekStart: string, avgProteinG: number }>}
 */
export function weeklyAvgProtein(entries = [], _opts = {}) {
  // Sum protein per logged day first.
  const perDay = new Map();
  for (const e of entries) {
    const t = dayMs(e?.logged_on);
    if (Number.isNaN(t)) continue;
    const key = msDay(t);
    perDay.set(key, (perDay.get(key) ?? 0) + num(e?.protein_g));
  }

  // Group day totals by ISO week, tracking sum + count of logged days.
  const perWeek = new Map();
  for (const [day, total] of perDay) {
    const weekStart = msDay(isoWeekStartMs(dayMs(day)));
    const agg = perWeek.get(weekStart) ?? { sum: 0, count: 0 };
    agg.sum += total;
    agg.count += 1;
    perWeek.set(weekStart, agg);
  }

  return [...perWeek.entries()]
    .sort((a, b) => dayMs(a[0]) - dayMs(b[0]))
    .map(([weekStart, { sum, count }]) => ({
      weekStart,
      avgProteinG: round2(sum / count),
    }));
}
