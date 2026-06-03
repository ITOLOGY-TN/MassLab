// Pure — nutrition macro math (Phase 7, FR-003/FR-006/FR-007/FR-009).
// No I/O, no clock, no globals (Constitution II + V). Callers supply all data.

const EPSILON = 1e-6;

function round2(n) {
  return Math.round(n * 100) / 100;
}

function num(n) {
  return Number(n) || 0;
}

/**
 * Scale a food's per-100g reference macros by the logged portion (D-4).
 * @param {{ food: object, quantityG: number }} args
 * @returns {{ kcal, protein_g, carbs_g, fat_g }} the snapshot, each rounded to 2 dp.
 */
export function entryMacros({ food, quantityG }) {
  const factor = num(quantityG) / 100;
  return {
    kcal: round2(num(food?.kcal_per_100g) * factor),
    protein_g: round2(num(food?.protein_per_100g) * factor),
    carbs_g: round2(num(food?.carbs_per_100g) * factor),
    fat_g: round2(num(food?.fat_per_100g) * factor),
  };
}

/**
 * Sum the snapshot fields across a day's entries.
 * @param {Array<{ kcal, protein_g, carbs_g, fat_g }>} entries
 * @returns {{ kcal, protein_g, carbs_g, fat_g }} all zeros when empty.
 */
export function dayTotals(entries = []) {
  return entries.reduce(
    (acc, e) => ({
      kcal: round2(acc.kcal + num(e?.kcal)),
      protein_g: round2(acc.protein_g + num(e?.protein_g)),
      carbs_g: round2(acc.carbs_g + num(e?.carbs_g)),
      fat_g: round2(acc.fat_g + num(e?.fat_g)),
    }),
    { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
  );
}

/**
 * Compare a day's totals against resolved targets per macro (FR-009 null-safe).
 * @param {object} totals { kcal, protein_g, carbs_g, fat_g }
 * @param {object} targets { kcal, protein_g, carbs_g, fat_g } (any may be null)
 * @returns {object} per-macro { value, target, pct, state } where
 *   state ∈ {under, at, over}; an unset target yields { target:null, pct:null, state:'under' }.
 */
export function progress(totals = {}, targets = {}) {
  const bar = (value, target) => {
    if (target == null) {
      return { value, target: null, pct: null, state: 'under' };
    }
    const pct = target ? value / target : 0;
    let state = 'under';
    if (value > target + EPSILON) state = 'over';
    else if (Math.abs(value - target) <= EPSILON) state = 'at';
    return { value, target, pct, state };
  };

  return {
    kcal: bar(num(totals.kcal), targets.kcal),
    protein_g: bar(num(totals.protein_g), targets.protein_g),
    carbs_g: bar(num(totals.carbs_g), targets.carbs_g),
    fat_g: bar(num(totals.fat_g), targets.fat_g),
  };
}
