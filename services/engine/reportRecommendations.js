// Pure — deterministic, rule-based monthly-report recommendations (Phase 11,
// US4, D-11, FR-020/SC-009). NO AI, NO free-form generation: every line is one
// of the fixed templated French strings below. No I/O, no clock, no random, no
// globals (Constitution II + V). Mirrors the Phase 10 dashboard alert ordering:
// signals in → an ordered, fully-deterministic array out.

/**
 * The French strings map. Templated strings are plain functions of their single
 * dynamic value; static lines are plain strings. This is the localization seam
 * (NUTRITION_LOCALE) — callers may inject an alternate map of the same shape.
 */
const FRENCH_STRINGS = {
  readyToAddLoad: (exercise) => `Augmente la charge sur ${exercise}.`,
  stagnation: (group) => `Varie le stimulus et ajoute du volume pour ${group}.`,
  deload: 'Envisage une semaine de décharge (deload) pour mieux récupérer.',
  increaseCalories: (target) => `Augmente ton apport quotidien pour viser environ ${target} kcal.`,
  recovery: 'Priorise le sommeil et gère ton stress pour mieux récupérer.',
  logMoreData: 'Enregistre plus de données pour obtenir des recommandations.',
};

export default FRENCH_STRINGS;

/**
 * Map deterministic signals to an ordered list of advisory lines.
 *
 * Fixed order:
 *   1. one `ready_to_add_load` per `addLoad` entry,
 *   2. one `stagnation` per `stagnationGroups` entry,
 *   3. `deload` when `regressionOrDeload`,
 *   4. `increase_calories` when month avg calories is below the resolved target,
 *   5. `recovery` when avg sleep is low OR avg stress is high.
 * If nothing fires, a single `log_more_data` line is emitted.
 *
 * @param {object} signals
 * @param {Array<{exercise:string}>} [signals.addLoad]
 * @param {Array<string>} [signals.stagnationGroups]
 * @param {boolean} [signals.regressionOrDeload]
 * @param {number|null} [signals.monthAvgCalories]
 * @param {number|null} [signals.targetKcal]
 * @param {number|null} [signals.avgSleepHours]
 * @param {number|null} [signals.avgStress]
 * @param {number} signals.sleepLowHours
 * @param {number} signals.stressHigh
 * @param {{strings?: object}} [opts]
 * @returns {Array<{key:string, message:string, context?:object}>}
 */
export function buildRecommendations(signals = {}, { strings = FRENCH_STRINGS } = {}) {
  const {
    addLoad = [],
    stagnationGroups = [],
    regressionOrDeload = false,
    monthAvgCalories = null,
    targetKcal = null,
    avgSleepHours = null,
    avgStress = null,
    sleepLowHours,
    stressHigh,
  } = signals;

  const out = [];

  // (1) Ready to add load — one line per flagged exercise.
  for (const entry of addLoad) {
    const exercise = entry?.exercise;
    out.push({
      key: 'ready_to_add_load',
      message: strings.readyToAddLoad(exercise),
      context: { exercise },
    });
  }

  // (2) Stagnation — one line per stagnating muscle group.
  for (const group of stagnationGroups) {
    out.push({
      key: 'stagnation',
      message: strings.stagnation(group),
      context: { group },
    });
  }

  // (3) Deload — regression or an explicit deload signal.
  if (regressionOrDeload) {
    out.push({ key: 'deload', message: strings.deload });
  }

  // (4) Increase calories — month average below the resolved target.
  if (monthAvgCalories != null && targetKcal != null && monthAvgCalories < targetKcal) {
    out.push({
      key: 'increase_calories',
      message: strings.increaseCalories(targetKcal),
      context: { target: targetKcal },
    });
  }

  // (5) Recovery — low sleep or high stress.
  if (
    (avgSleepHours != null && avgSleepHours <= sleepLowHours) ||
    (avgStress != null && avgStress >= stressHigh)
  ) {
    out.push({ key: 'recovery', message: strings.recovery });
  }

  if (out.length === 0) {
    out.push({ key: 'log_more_data', message: strings.logMoreData });
  }

  return out;
}
