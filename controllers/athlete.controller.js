import { HttpError } from '../middleware/errorHandler.js';
import {
  profilePatchSchema,
  PROFILE_OUTPUT_AFFECTING_FIELDS,
  validate,
} from '../services/engine/inputSchemas.js';
import { programController } from './program.controller.js';

export function athleteController({ daos }) {
  const programCtrl = programController({ daos });

  // Phase 0 schema uses `starting_weight_kg` for the profile weight; the
  // engine schema uses `weight_kg`. We accept either on PATCH and translate.
  const FIELD_TRANSLATIONS = {
    weight_kg: 'starting_weight_kg',
  };

  return {
    async getMe(req, res, next) {
      try {
        const a = await daos.athletes.findById(req.athleteId);
        if (!a) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');
        res.json({ data: a });
      } catch (err) {
        next(err);
      }
    },

    async patchMe(req, res, next) {
      try {
        const body = validate(profilePatchSchema, req.body);
        const current = await daos.athletes.findById(req.athleteId);
        if (!current) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');

        // Build the update object using DB-side column names.
        const update = {};
        let triggerRegenerate = false;
        for (const [k, v] of Object.entries(body)) {
          const dbCol = FIELD_TRANSLATIONS[k] ?? k;
          update[dbCol] = v;
          if (PROFILE_OUTPUT_AFFECTING_FIELDS.includes(k)) triggerRegenerate = true;
        }

        const updated = await daos.athletes.upsertProfile({ ...current, ...update });
        let program = null;
        if (triggerRegenerate) {
          program = await programCtrl.regenerateForAthlete(req.athleteId);
        }
        res.json({ data: { athlete: updated, program_id: program?.id ?? null } });
      } catch (err) {
        next(err);
      }
    },
  };
}
