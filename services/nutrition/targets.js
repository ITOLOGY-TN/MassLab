import { HttpError } from '../../middleware/errorHandler.js';
import { resolveConstants } from '../engine/resolveConstants.js';
import { generateProgram } from '../programGenerator.js';
import { macros } from '../engine/macros.js';

export async function resolveTargets({ daos, athleteId }) {
  const profile = await daos.athletes.findById(athleteId);
  if (!profile) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');
  const overrides = await daos.appConfig.getOverridesFor(athleteId);
  const constants = resolveConstants(overrides);
  // generateProgram already runs the macros calculator with the right inputs;
  // we re-derive here to avoid the full program write path.
  const lbm = (() => {
    return undefined; // let macros derive from morphotype default
  })();
  const program = generateProgram(profile, { constants, lean_body_mass_kg: lbm });
  // Apply override at the macros layer.
  const overrideNutrition = overrides?.nutrition ?? {};
  const result = macros({
    weight_kg: profile.starting_weight_kg ?? profile.weight_kg,
    morphotype: profile.morphotype,
    goal: profile.goal,
    tdee_kcal: program.nutrition.tdee_kcal,
    constants,
    override: Object.keys(overrideNutrition).length ? overrideNutrition : undefined,
  });
  return {
    targets: {
      daily_kcal: result.daily_kcal,
      daily_protein_g: result.protein_g,
      daily_carbs_g: result.carbs_g,
      daily_fat_g: result.fat_g,
      source: result.source,
    },
    constants,
    profile,
  };
}
