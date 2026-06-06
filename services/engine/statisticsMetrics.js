// Pure — the four Phase 11 headline metrics (research D-7). Every figure is
// anchored on program_start_date and computed from injected data + an explicit
// `asOf`/`programStart` day string supplied by the controller. No I/O, no clock,
// no randomness, no globals (Constitution II + V). All numeric outputs round 2dp.

import { isoDayOfWeek } from '../sessionJournal/calendar.js';
import { isoWeekStart } from '../supplements/week.js';

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

/**
 * Latest body weight minus the starting weight, signed, rounded 2dp.
 * "Latest" = the `weight_kg` of the most recent `measured_on` that has a
 * non-null weight. Returns null when no body weight has ever been logged.
 * @param {{ measurements: Array<{ measured_on, weight_kg }>, startingWeightKg: number }} args
 * @returns {number|null}
 */
export function totalWeightGained({ measurements = [], startingWeightKg } = {}) {
  let latest = null;
  for (const m of measurements) {
    if (m?.weight_kg == null) continue;
    const t = dayMs(m.measured_on);
    if (Number.isNaN(t)) continue;
    if (latest === null || t > latest.t) {
      latest = { t, kg: Number(m.weight_kg) };
    }
  }
  if (latest === null) return null;
  return round2(latest.kg - num(startingWeightKg));
}

/**
 * Total finished-session volume since program start: sum of `total_volume_kg`
 * over the rows (null treated as 0), rounded 2dp. 0 when empty.
 * @param {{ dailyVolumes: Array<{ total_volume_kg }> }} args
 * @returns {number}
 */
export function totalVolumeSinceStart({ dailyVolumes = [] } = {}) {
  let sum = 0;
  for (const row of dailyVolumes) {
    sum += num(row?.total_volume_kg);
  }
  return round2(sum);
}

/**
 * Session completion rate over [programStart, asOf] inclusive.
 * scheduled = calendar dates in the window whose ISO weekday is a training day;
 * completed = distinct finished-session days that fall within the window;
 * pct = completed / scheduled * 100 (2dp), or null when scheduled is 0.
 * @param {object} args
 * @param {Array<number>|Set<number>} args.trainingWeekdays  ISO weekdays 1..7
 * @param {Array<string>|Set<string>} args.finishedDays      YYYY-MM-DD with a finished session
 * @param {string} args.programStart  YYYY-MM-DD
 * @param {string} args.asOf          YYYY-MM-DD (server "today")
 * @returns {{ completed: number, scheduled: number, pct: number|null }}
 */
export function sessionCompletionRate({
  trainingWeekdays = [],
  finishedDays = [],
  programStart,
  asOf,
} = {}) {
  const weekdays = trainingWeekdays instanceof Set ? trainingWeekdays : new Set(trainingWeekdays);
  const finished = finishedDays instanceof Set ? finishedDays : new Set(finishedDays);

  const startMs = dayMs(programStart);
  const endMs = dayMs(asOf);

  let scheduled = 0;
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    for (let ms = startMs; ms <= endMs; ms += DAY_MS) {
      const date = new Date(ms).toISOString().slice(0, 10);
      // Noon-UTC anchor so the local-time isoDayOfWeek helper reads the same
      // calendar day (hence ISO weekday) regardless of the host timezone.
      if (weekdays.has(isoDayOfWeek(`${date}T12:00:00.000Z`))) scheduled += 1;
    }
  }

  let completed = 0;
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs)) {
    for (const day of finished) {
      const t = dayMs(day);
      if (Number.isNaN(t) || t < startMs || t > endMs) continue;
      completed += 1;
    }
  }

  const pct = scheduled > 0 ? round2((completed / scheduled) * 100) : null;
  return { completed, scheduled, pct };
}

/**
 * Mean of per-ISO-week kcal totals. Entries are grouped by their week's Monday
 * (`isoWeekStart(logged_on)`), kcal summed per week, then averaged over the
 * weeks that have entries. Returns null when there are no entries.
 * @param {{ nutritionEntries: Array<{ logged_on, kcal }> }} args
 * @returns {number|null}
 */
export function averageWeeklyCalories({ nutritionEntries = [] } = {}) {
  const perWeek = new Map();
  for (const e of nutritionEntries) {
    if (e?.logged_on == null) continue;
    const weekStart = isoWeekStart(String(e.logged_on).slice(0, 10));
    perWeek.set(weekStart, (perWeek.get(weekStart) ?? 0) + num(e?.kcal));
  }
  if (perWeek.size === 0) return null;
  let total = 0;
  for (const sum of perWeek.values()) total += sum;
  return round2(total / perWeek.size);
}
