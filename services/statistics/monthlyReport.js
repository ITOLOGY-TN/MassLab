// Pure — the month-scoped report assembler (Phase 11, US4, data-model §3).
// Produces the exact `Report` contract shape consumed by the client PDF builder.
//
// Decoupled from US1/US2 (running in parallel): this module DOES NOT import
// statisticsMetrics.js or exerciseImprovements.js. Instead it RECEIVES `lifetime`,
// `topProgressions`, `weightSeries`, and `recommendations` as injected inputs and
// computes ONLY the month `summary` itself.
//
// No I/O, no clock, no random, no globals (Constitution II + V).

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(n) {
  return Number(n) || 0;
}

/**
 * @param {object} args
 * @param {{month, from, to, label}} args.period   passed-in month boundaries + label
 * @param {Array<{ended_at, total_volume_kg}>} args.monthDailyVolumes  finished sessions in the month
 * @param {Array<{measured_on, weight_kg}>} args.monthMeasurements     measurements in the month (ASC)
 * @param {Array<{logged_on, kcal}>} args.monthNutritionEntries        nutrition logs in the month
 * @param {Array<{logged_on, sleep_hours}>} args.monthCheckins         recovery check-ins in the month
 * @param {object} args.lifetime                  pre-built lifetime stats (injected, passed through)
 * @param {Array<{exercise_id, name, gain_kg}>} args.topProgressions   injected, passed through
 * @param {Array<{date, weight_kg}>} args.weightSeries                 injected, passed through
 * @param {Array<{key, message, context?}>} args.recommendations       injected, passed through
 * @returns {object} the Report contract shape
 */
export function build({
  period,
  monthDailyVolumes = [],
  monthMeasurements = [],
  monthNutritionEntries = [],
  monthCheckins = [],
  lifetime,
  topProgressions = [],
  weightSeries = [],
  recommendations = [],
} = {}) {
  // volume_kg — Σ finished-session volume in the month.
  const volume_kg = round2(monthDailyVolumes.reduce((acc, r) => acc + num(r?.total_volume_kg), 0));

  // sessions_completed — count of finished sessions in the month.
  const sessions_completed = monthDailyVolumes.length;

  // weight_change_kg — last minus first non-null weight; null below 2 weight points.
  const weights = monthMeasurements
    .filter((r) => r?.weight_kg != null)
    .map((r) => num(r.weight_kg));
  const weight_change_kg =
    weights.length >= 2 ? round2(weights[weights.length - 1] - weights[0]) : null;

  // avg_daily_calories — mean of per-logged-day kcal totals; null when none.
  const perDayKcal = new Map();
  for (const e of monthNutritionEntries) {
    const day = String(e?.logged_on).slice(0, 10);
    perDayKcal.set(day, (perDayKcal.get(day) ?? 0) + num(e?.kcal));
  }
  const avg_daily_calories =
    perDayKcal.size > 0
      ? round2([...perDayKcal.values()].reduce((a, b) => a + b, 0) / perDayKcal.size)
      : null;

  // avg_sleep_hours — mean over check-ins with a non-null sleep value; null when none.
  const sleeps = monthCheckins.filter((c) => c?.sleep_hours != null).map((c) => num(c.sleep_hours));
  const avg_sleep_hours =
    sleeps.length > 0 ? round2(sleeps.reduce((a, b) => a + b, 0) / sleeps.length) : null;

  return {
    period,
    summary: {
      volume_kg,
      sessions_completed,
      weight_change_kg,
      avg_daily_calories,
      avg_sleep_hours,
    },
    lifetime,
    topProgressions,
    weightSeries,
    recommendations,
  };
}
