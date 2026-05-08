// US6 ad-hoc calculators (FR-028 / FR-029): pure passes through the engine.
// MUST NOT write to calculation_results or any typed table.
import { bmr } from '../services/engine/bmr.js';
import { tdee } from '../services/engine/tdee.js';
import { macros } from '../services/engine/macros.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import {
  bmrSchema,
  tdeeSchema,
  macrosSchema,
  oneRepMaxSchema,
  bodyCompositionSchema,
  validate,
} from '../services/engine/inputSchemas.js';
import { oneRepMax } from '../services/engine/oneRepMax.js';
import { bodyComposition } from '../services/engine/bodyComposition.js';

export function calculatorsController({ daos }) {
  async function constantsFor(req) {
    const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
    return resolveConstants(overrides);
  }

  return {
    async bmr(req, res, next) {
      try {
        const body = validate(bmrSchema, req.body);
        const bmr_kcal = bmr(body);
        res.json({ data: { bmr_kcal } });
      } catch (err) {
        next(err);
      }
    },

    async tdee(req, res, next) {
      try {
        const body = validate(tdeeSchema, req.body);
        const constants = await constantsFor(req);
        const bmr_kcal = bmr(body);
        const tdee_kcal = tdee({ bmr_kcal, activity_level: body.activity_level, constants });
        res.json({ data: { bmr_kcal, tdee_kcal } });
      } catch (err) {
        next(err);
      }
    },

    async macros(req, res, next) {
      try {
        const body = validate(macrosSchema, req.body);
        const constants = await constantsFor(req);
        const bmr_kcal = bmr(body);
        const tdee_kcal = tdee({ bmr_kcal, activity_level: body.activity_level, constants });
        const m = macros({
          weight_kg: body.weight_kg,
          morphotype: body.morphotype,
          goal: body.goal,
          tdee_kcal,
          lean_body_mass_kg: body.lean_body_mass_kg,
          constants,
        });
        res.json({
          data: {
            bmr_kcal,
            tdee_kcal,
            daily_kcal: m.daily_kcal,
            macros: { protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g },
          },
        });
      } catch (err) {
        next(err);
      }
    },

    async oneRepMax(req, res, next) {
      try {
        const body = validate(oneRepMaxSchema, req.body);
        const constants = await constantsFor(req);
        const result = oneRepMax({ ...body, constants });
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    },

    async bodyComposition(req, res, next) {
      try {
        const body = validate(bodyCompositionSchema, req.body);
        const result = bodyComposition(body);
        res.json({ data: result });
      } catch (err) {
        next(err);
      }
    },
  };
}
