import { HttpError } from '../middleware/errorHandler.js';
import { bodyComposition } from '../services/engine/bodyComposition.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { bodyMeasurementSchema, validate } from '../services/engine/inputSchemas.js';
import { programController } from './program.controller.js';

// Format a Date as a YYYY-MM-DD calendar day in UTC, matching the ISO
// `measured_on` strings the schema accepts. The caller injects `now` so the
// comparison is deterministic (Constitution: no wall-clock inside pure logic;
// the controller reads the clock once at the request boundary).
function isoDay(date) {
  return date.toISOString().slice(0, 10);
}

export function bodyMeasurementsController({ daos, now = () => new Date() }) {
  const programCtrl = programController({ daos });

  return {
    // Phase 6 T012 [US1] — weigh-in history (date-descending) for the chart/table.
    async list(req, res, next) {
      try {
        const limit = Number.parseInt(req.query?.limit, 10);
        const rows = await daos.bodyMeasurements.listForAthlete(req.athleteId, {
          limit: Number.isFinite(limit) && limit > 0 ? limit : 365,
        });
        res.json({ data: rows });
      } catch (err) {
        next(err);
      }
    },

    async create(req, res, next) {
      try {
        const body = validate(bodyMeasurementSchema, req.body);

        // FR-005: reject a weigh-in dated in the future (compared to server today).
        if (body.measured_on > isoDay(now())) {
          throw new HttpError(400, 'VALIDATION_FAILED', 'measured_on must not be in the future');
        }

        // M1/FR-002/FR-006: merge before upsert. Fetch the existing row for this
        // (athlete, date) and overlay ONLY the provided fields, so a partial
        // re-save never nulls out previously-stored circumferences. A new date
        // with no stored row persists exactly the provided fields.
        const existing = await daos.bodyMeasurements.findByDate(req.athleteId, body.measured_on);
        const merged = existing
          ? (() => {
              const { id: _omitId, ...storedFields } = existing;
              void _omitId;
              return { ...storedFields, ...body };
            })()
          : body;
        const measurement = await daos.bodyMeasurements.insert({
          athlete_id: req.athleteId,
          ...merged,
        });

        const profile = await daos.athletes.findById(req.athleteId);
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);

        // Compute body composition from the persisted (merged) row so a partial
        // re-save still sees previously-stored circumferences (M1/FR-006).
        const compInputs = {
          weight_kg: measurement.weight_kg ?? profile.starting_weight_kg,
          height_cm: profile.height_cm,
          age: profile.age,
          biological_sex: profile.biological_sex,
          waist_cm: measurement.waist_cm ?? null,
          neck_cm: measurement.neck_cm ?? null,
          hip_cm: measurement.hip_cm ?? null,
        };
        const compResult = bodyComposition(compInputs);
        const compRow = await daos.bodyComposition.insert({
          athlete_id: req.athleteId,
          source_measurement_id: measurement.id,
          method: compResult.method,
          body_fat_pct: compResult.body_fat_pct,
          lean_body_mass_kg: compResult.lean_body_mass_kg,
          inputs: compResult.inputs,
          engine_version: ENGINE_VERSION,
          resolved_constants: constants,
        });
        await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'body_composition',
          inputs: compInputs,
          outputs: compResult,
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
          producedRecord: { kind: 'body_composition_results', id: compRow.id },
        });

        // Cascade: regenerate the active program so the protein target picks up
        // the new lean body mass (FR-021 / SC-006).
        const program = await programCtrl.regenerateForAthlete(req.athleteId);

        res.status(201).json({
          data: {
            measurement,
            body_composition: compRow,
            program_id: program.id,
          },
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
