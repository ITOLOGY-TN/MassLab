// Pure function — daily kcal + macro split.
// Order of constraints (FR-004 / FR-005):
//   1. Compute daily_kcal from tdee + goal adjustment.
//   2. Compute protein floor from LBM × protein_g_per_kg_lbm.
//   3. Compute fat floor at 25 % of daily_kcal (morphotype skew applied within the floor).
//   4. Carbs absorb the remainder (also skewed by morphotype).
import { DEFAULTS } from './constants.js';

function adjustForGoal(tdee_kcal, goal, c) {
  if (goal === 'cut') return tdee_kcal - c.cut_deficit_kcal;
  if (goal === 'maintain') return tdee_kcal;
  return tdee_kcal + c.bulk_surplus_kcal;
}

function leanMassFromMorphotype(weight_kg, morphotype, c) {
  const bf = c.default_body_fat_pct?.[morphotype] ?? c.default_body_fat_pct.mesomorph;
  return weight_kg * (1 - bf);
}

export function macros({
  weight_kg,
  morphotype,
  goal,
  tdee_kcal,
  lean_body_mass_kg,
  constants = DEFAULTS,
}) {
  const c = constants;
  const daily_kcal = adjustForGoal(tdee_kcal, goal, c);
  const lbm = lean_body_mass_kg ?? leanMassFromMorphotype(weight_kg, morphotype, c);

  const protein_g = Math.round(lbm * c.protein_g_per_kg_lbm);

  // Fat floor at 25 % of kcal; morphotype skew nudges it up for endomorphs.
  const morphFatBoost = morphotype === 'endomorph' ? 1.18 : morphotype === 'ectomorph' ? 0.95 : 1.0;
  const fatPct = Math.max(c.fat_floor_pct, c.fat_floor_pct * morphFatBoost);
  const fat_g = Math.round((daily_kcal * fatPct) / 9);

  // Carbs absorb the remainder.
  const remainingKcal = daily_kcal - protein_g * 4 - fat_g * 9;
  const carbs_g = Math.max(0, Math.round(remainingKcal / 4));

  return { daily_kcal, protein_g, carbs_g, fat_g };
}
