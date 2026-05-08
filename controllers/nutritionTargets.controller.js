import { z } from 'zod';
import { HttpError } from '../middleware/errorHandler.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { generateProgram } from '../services/programGenerator.js';

const putSchema = z
  .object({
    daily_kcal: z.number().int().min(800).max(6000).nullable().optional(),
    daily_protein_g: z.number().int().min(30).max(400).nullable().optional(),
    daily_carbs_g: z.number().int().min(0).max(800).nullable().optional(),
    daily_fat_g: z.number().int().min(20).max(250).nullable().optional(),
  })
  .strict();

function parse(schema, body) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new HttpError(
      400,
      'VALIDATION_FAILED',
      `${issue.path.join('.') || '<root>'}: ${issue.message}`,
    );
  }
  return parsed.data;
}

async function resolveTargets({ daos, athleteId }) {
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
  // Re-import macros directly for FR-017a/b paths.
  const { macros } = await import('../services/engine/macros.js');
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

export function nutritionTargetsController({ daos }) {
  return {
    async get(req, res, next) {
      try {
        const { targets } = await resolveTargets({ daos, athleteId: req.athleteId });
        res.json({ data: targets });
      } catch (err) {
        next(err);
      }
    },

    async put(req, res, next) {
      try {
        const body = parse(putSchema, req.body);
        await daos.appConfig.setNutritionOverride(req.athleteId, body);
        const { targets, constants } = await resolveTargets({ daos, athleteId: req.athleteId });
        const audit = await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'macros',
          reason: 'override_set',
          inputs: body,
          outputs: targets,
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
        });
        res.json({
          data: {
            targets,
            calculation_audit_id: audit?.id ?? null,
            reason: 'override_set',
          },
        });
      } catch (err) {
        next(err);
      }
    },

    async destroy(req, res, next) {
      try {
        await daos.appConfig.clearAllNutritionOverrides(req.athleteId);
        const { targets, constants } = await resolveTargets({ daos, athleteId: req.athleteId });
        const audit = await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'macros',
          reason: 'override_cleared',
          inputs: {},
          outputs: targets,
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
        });
        res.json({
          data: {
            targets,
            calculation_audit_id: audit?.id ?? null,
            reason: 'override_cleared',
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
