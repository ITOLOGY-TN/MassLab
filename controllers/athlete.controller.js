import { HttpError } from '../middleware/errorHandler.js';
import {
  profilePatchSchema,
  PROFILE_OUTPUT_AFFECTING_FIELDS,
  validate,
} from '../services/engine/inputSchemas.js';
import { programController } from './program.controller.js';

// Phase 0 schema uses `starting_weight_kg`, `weekly_session_count`,
// `available_equipment`. The Phase 2 contract uses `current_weight_kg`,
// `sessions_per_week`, `equipment`. Both forms are accepted on PATCH and
// translated to DB columns here.
const FIELD_TRANSLATIONS = Object.freeze({
  weight_kg: 'starting_weight_kg',
  current_weight_kg: 'starting_weight_kg',
  sessions_per_week: 'weekly_session_count',
  equipment: 'available_equipment',
});

const TWELVE_MONTHS_MS = 365 * 24 * 60 * 60 * 1000;

function crossFieldValidate(body, current) {
  const next = { ...current, ...body };
  const newCurrentWeight = next.current_weight_kg ?? next.weight_kg ?? next.starting_weight_kg;
  const newTarget = next.target_weight_kg;
  if (newCurrentWeight != null && newTarget != null) {
    if (Math.abs(newTarget - newCurrentWeight) > 50) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'target_weight_kg cannot differ from current_weight_kg by more than 50 kg',
      );
    }
  }
  if (body.program_start_date) {
    const ts = Date.parse(body.program_start_date);
    if (Number.isNaN(ts)) {
      throw new HttpError(400, 'VALIDATION_FAILED', 'program_start_date is not a valid ISO date');
    }
    const drift = Math.abs(ts - Date.now());
    if (drift > TWELVE_MONTHS_MS) {
      throw new HttpError(
        400,
        'VALIDATION_FAILED',
        'program_start_date must be within ±12 months of today',
      );
    }
  }
}

export function athleteController({ daos }) {
  const programCtrl = programController({ daos });

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
        let body;
        try {
          body = validate(profilePatchSchema, req.body);
        } catch (err) {
          // Re-emit zod failures as the Phase 2 canonical 400 envelope.
          throw new HttpError(
            400,
            'VALIDATION_FAILED',
            err?.message ?? 'Profile patch failed validation',
          );
        }

        const current = await daos.athletes.findById(req.athleteId);
        if (!current) throw new HttpError(404, 'NOT_FOUND', 'Athlete not found');

        crossFieldValidate(body, current);

        // Detect output-affecting changes BEFORE translating column names so the
        // alias comparison works against the input keys.
        let triggerRegenerate = false;
        const update = {};
        for (const [k, v] of Object.entries(body)) {
          const dbCol = FIELD_TRANSLATIONS[k] ?? k;
          update[dbCol] = v;
          if (PROFILE_OUTPUT_AFFECTING_FIELDS.includes(k)) triggerRegenerate = true;
        }

        const updated = await daos.athletes.updateProfile(req.athleteId, update);

        let recompute = null;
        if (triggerRegenerate) {
          const program = await programCtrl.regenerateForAthlete(req.athleteId, {
            reason: 'profile_save',
          });
          recompute = {
            calculation_audit_id: program.calculation_audit_id ?? null,
            engine_version: program.engine_version ?? null,
            program_id: program.id ?? null,
          };
        }

        res.json({
          data: {
            // Keep the Phase 0/1 `athlete` envelope key for backward compatibility
            // and add the Phase 2 contract `profile` alias.
            athlete: updated,
            profile: updated,
            program_id: recompute?.program_id ?? null,
            recompute,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
