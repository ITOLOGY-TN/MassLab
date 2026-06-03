// Pure presenter — compose the nutrition day view from a day's logged entries,
// resolved targets, and the hydration counter (Phase 7, FR-006/FR-007/FR-009/FR-013).
// Always emits ALL FIVE meal slots in order, even on an empty day (FR-027). No I/O.
import { dayTotals, progress } from '../engine/nutritionMath.js';

const SLOT_ORDER = ['breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack'];

/**
 * @param {object} args
 * @param {Array<{ slot, kcal, protein_g, carbs_g, fat_g, ... }>} args.entries  the day's logged foods
 * @param {{ kcal, protein_g, carbs_g, fat_g }} args.targets  resolved daily targets (any may be null)
 * @param {{ total_ml, goal_ml }} args.hydration  the day's hydration counter + goal
 * @param {string} args.date  the day in YYYY-MM-DD
 * @returns {{ date, slots, totals, bars, hydration }}
 */
export function build({ entries = [], targets = {}, hydration = null, date = null } = {}) {
  const slots = SLOT_ORDER.map((slot) => {
    const slotEntries = entries.filter((e) => e?.slot === slot);
    return { slot, entries: slotEntries, subtotal: dayTotals(slotEntries) };
  });

  const totals = dayTotals(entries);

  return {
    date,
    slots,
    totals,
    bars: progress(totals, targets),
    hydration,
  };
}
