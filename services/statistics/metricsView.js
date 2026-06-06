// Pure — assembles the four Phase 11 headline metric cards into the exact
// contract `Metrics` shape (contracts/openapi.yaml, data-model §2/§4). The
// controller injects already-read rows + the resolved `asOf`/`programStart`
// anchor; this module only calls the pure engine and packs the result. Empty
// inputs naturally yield the cold-start shape (null/0/pct:null) — no special
// casing needed. No I/O, no clock, no globals (Constitution II + V).

import {
  totalWeightGained,
  totalVolumeSinceStart,
  sessionCompletionRate,
  averageWeeklyCalories,
} from '../engine/statisticsMetrics.js';

/**
 * @param {object} args
 * @param {Array<{ measured_on, weight_kg }>} args.measurements
 * @param {number} args.startingWeightKg
 * @param {Array<{ total_volume_kg }>} args.dailyVolumes
 * @param {Array<number>|Set<number>} args.trainingWeekdays  ISO weekdays 1..7
 * @param {Array<string>|Set<string>} args.finishedDays      YYYY-MM-DD
 * @param {Array<{ logged_on, kcal }>} args.nutritionEntries
 * @param {string} args.programStart  YYYY-MM-DD
 * @param {string} args.asOf          YYYY-MM-DD
 * @returns {{
 *   total_weight_gained_kg: number|null,
 *   total_volume_kg: number,
 *   session_completion_rate: { completed: number, scheduled: number, pct: number|null },
 *   avg_weekly_calories: number|null
 * }}
 */
export function build({
  measurements = [],
  startingWeightKg,
  dailyVolumes = [],
  trainingWeekdays = [],
  finishedDays = [],
  nutritionEntries = [],
  programStart,
  asOf,
} = {}) {
  return {
    total_weight_gained_kg: totalWeightGained({ measurements, startingWeightKg }),
    total_volume_kg: totalVolumeSinceStart({ dailyVolumes }),
    session_completion_rate: sessionCompletionRate({
      trainingWeekdays,
      finishedDays,
      programStart,
      asOf,
    }),
    avg_weekly_calories: averageWeeklyCalories({ nutritionEntries }),
  };
}
