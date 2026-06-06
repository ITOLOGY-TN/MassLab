// Pure — Nutrition tab presenter (Phase 11, data-model §3). Groups logged-food calories
// into per-ISO-week totals (ascending) and resolves the weekly kcal target as the
// athlete's daily target × 7. The daily target is resolved upstream (nutrition/targets.js
// does the I/O in the controller) and the number is injected here. No I/O, no clock,
// no @supabase import.
import { isoWeekStart } from '../supplements/week.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} args
 * @param {Array<{ logged_on: string, kcal: number }>} args.nutritionEntries
 * @param {number|null} args.dailyTargetKcal  resolved daily kcal target, or null
 * @returns {{ weekly: Array<{ week_start: string, kcal: number }>,
 *            weekly_target_kcal: number|null }}
 */
export function build({ nutritionEntries = [], dailyTargetKcal }) {
  const byWeek = new Map();
  for (const e of nutritionEntries) {
    if (!e || e.logged_on == null) continue;
    const week = isoWeekStart(String(e.logged_on));
    byWeek.set(week, (byWeek.get(week) ?? 0) + Number(e.kcal ?? 0));
  }

  const weekly = [...byWeek.entries()]
    .map(([week_start, kcal]) => ({ week_start, kcal: round2(kcal) }))
    .sort((a, b) => (a.week_start < b.week_start ? -1 : a.week_start > b.week_start ? 1 : 0));

  return {
    weekly,
    weekly_target_kcal: dailyTargetKcal == null ? null : round2(dailyTargetKcal * 7),
  };
}
