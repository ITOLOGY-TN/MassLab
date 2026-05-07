// Le plan hebdomadaire est dérivé du programGenerator (services/programGenerator.js)
// à partir du profil athlète (seed/athlete.seed.js). Ce fichier ne contient aucune
// donnée athlète en dur — il importe le générateur pur et l’appelle à l’exécution.
import { generateProgram } from '../services/programGenerator.js';

export function buildWeeklyPlanFor(profile) {
  const program = generateProgram(profile);
  return program.training.weeklyPlan;
}
