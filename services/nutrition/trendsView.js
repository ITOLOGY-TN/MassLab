// Pure presenter — compose the three nutrition trend chart view models
// (Phase 7, FR-017/FR-018/FR-019/FR-020). Assembles from injected DAO output:
// `rangeEntries` feed the calories window + weekly protein; `dayEntries` feed the
// macro breakdown. The caller supplies `goalKcal` (resolved target, may be null),
// `days`, and `asOf`. No I/O, no clock, no globals (Constitution II).
import { caloriesByDay, macroBreakdown, weeklyAvgProtein } from '../engine/nutritionTrends.js';

/**
 * @param {object} args
 * @param {Array<{ logged_on, kcal, protein_g }>} args.rangeEntries  entries over the window
 * @param {Array<{ protein_g, carbs_g, fat_g }>} args.dayEntries  the anchor day's entries
 * @param {number|null} args.goalKcal  resolved daily kcal target (pass-through; may be null)
 * @param {number} args.days  calories-window length
 * @param {string} args.asOf  anchor day (YYYY-MM-DD)
 * @returns {{ calories: { points, goalKcal }, macroBreakdown, weeklyProtein }}
 */
export function build({ rangeEntries = [], dayEntries = [], goalKcal = null, days, asOf } = {}) {
  return {
    calories: {
      points: caloriesByDay(rangeEntries, { days, asOf }),
      goalKcal: goalKcal ?? null,
    },
    macroBreakdown: macroBreakdown(dayEntries),
    weeklyProtein: weeklyAvgProtein(rangeEntries, { asOf }),
  };
}
