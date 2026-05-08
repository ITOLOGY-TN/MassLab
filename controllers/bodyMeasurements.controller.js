import { bodyComposition } from '../services/engine/bodyComposition.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { bodyMeasurementSchema, validate } from '../services/engine/inputSchemas.js';
import { programController } from './program.controller.js';

export function bodyMeasurementsController({ daos }) {
  const programCtrl = programController({ daos });

  return {
    async create(req, res, next) {
      try {
        const body = validate(bodyMeasurementSchema, req.body);
        const measurement = await daos.bodyMeasurements.insert({
          athlete_id: req.athleteId,
          ...body,
        });

        const profile = await daos.athletes.findById(req.athleteId);
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);

        // Compute body composition using profile + the new measurement when present.
        const compInputs = {
          weight_kg: body.weight_kg ?? profile.starting_weight_kg,
          height_cm: profile.height_cm,
          age: profile.age,
          biological_sex: profile.biological_sex,
          waist_cm: body.waist_cm ?? null,
          neck_cm: body.neck_cm ?? null,
          hip_cm: body.hip_cm ?? null,
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
