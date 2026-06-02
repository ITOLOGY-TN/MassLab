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
  override,
}) {
  const c = constants;
  const engine_kcal = adjustForGoal(tdee_kcal, goal, c);
  const lbm = lean_body_mass_kg ?? leanMassFromMorphotype(weight_kg, morphotype, c);

  // FR-017a: a calorie override re-runs the macro split on the new total.
  const daily_kcal = override?.daily_kcal != null ? override.daily_kcal : engine_kcal;

  const engine_protein_g = Math.round(lbm * c.protein_g_per_kg_lbm);
  const morphFatBoost = morphotype === 'endomorph' ? 1.18 : morphotype === 'ectomorph' ? 0.95 : 1.0;
  const fatPct = Math.max(c.fat_floor_pct, c.fat_floor_pct * morphFatBoost);
  const engine_fat_g = Math.round((daily_kcal * fatPct) / 9);

  // FR-017b: each macro override pins independently; the others auto-derive
  // from the resulting calorie/protein/fat budget.
  const protein_g = override?.daily_protein_g != null ? override.daily_protein_g : engine_protein_g;
  const fat_g = override?.daily_fat_g != null ? override.daily_fat_g : engine_fat_g;
  const remainingKcal = daily_kcal - protein_g * 4 - fat_g * 9;
  const carbs_g =
    override?.daily_carbs_g != null
      ? override.daily_carbs_g
      : Math.max(0, Math.round(remainingKcal / 4));

  // `source` lets the controller surface which path each value came from.
  // A value is `auto-derived` ONLY when the override path actually moved it
  // away from its engine baseline. Protein is independent of `daily_kcal`
  // (protein_g_per_kg_lbm × LBM), so a calorie-only override leaves it at
  // its engine value — the label was misleading users (Pass 3 H-1).
  const source = {
    daily_kcal: override?.daily_kcal != null ? 'override' : 'engine',
    daily_protein_g: override?.daily_protein_g != null ? 'override' : 'engine',
    daily_fat_g:
      override?.daily_fat_g != null
        ? 'override'
        : override?.daily_kcal != null
          ? 'auto-derived'
          : 'engine',
    daily_carbs_g:
      override?.daily_carbs_g != null
        ? 'override'
        : override?.daily_kcal != null ||
            override?.daily_protein_g != null ||
            override?.daily_fat_g != null
          ? 'auto-derived'
          : 'engine',
  };

  return { daily_kcal, protein_g, carbs_g, fat_g, source };
}
