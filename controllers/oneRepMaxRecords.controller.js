import { oneRepMax } from '../services/engine/oneRepMax.js';
import { oneRepMaxTrend } from '../services/engine/oneRepMaxTrend.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { oneRepMaxRecordSchema, validate } from '../services/engine/inputSchemas.js';

export function oneRepMaxRecordsController({ daos }) {
  return {
    async create(req, res, next) {
      try {
        const body = validate(oneRepMaxRecordSchema, req.body);
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);
        const result = oneRepMax({ weight_kg: body.weight_kg, reps: body.reps, constants });
        const row = await daos.oneRepMaxRecords.insert({
          athlete_id: req.athleteId,
          exercise_id: body.exercise_id,
          source_weight_kg: body.weight_kg,
          source_reps: body.reps,
          primary_estimate_kg: result.primary_estimate_kg,
          epley_kg: result.epley_kg,
          brzycki_kg: result.brzycki_kg,
          lander_kg: result.lander_kg,
          lombardi_kg: result.lombardi_kg,
          percentage_table: result.percentage_table,
          reduced_confidence: result.reduced_confidence,
          engine_version: ENGINE_VERSION,
          resolved_constants: constants,
        });
        await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'one_rep_max',
          inputs: body,
          outputs: result,
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
          producedRecord: { kind: 'one_rep_max_records', id: row.id },
        });
        res.status(201).json({ data: row });
      } catch (err) {
        next(err);
      }
    },

    async list(req, res, next) {
      try {
        const data = await daos.oneRepMaxRecords.listForAthlete({
          athleteId: req.athleteId,
          exerciseId: req.query.exercise_id ? Number(req.query.exercise_id) : undefined,
        });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async latest(req, res, next) {
      try {
        const data = await daos.oneRepMaxRecords.latestForAthletePerExercise(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async trend(req, res, next) {
      try {
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);
        const all = await daos.oneRepMaxRecords.listForAthlete({
          athleteId: req.athleteId,
          exerciseId: req.query.exercise_id ? Number(req.query.exercise_id) : undefined,
        });
        const byExercise = new Map();
        for (const r of all) {
          if (!byExercise.has(r.exercise_id)) byExercise.set(r.exercise_id, []);
          byExercise.get(r.exercise_id).push(r);
        }
        const data = [];
        for (const [exerciseId, records] of byExercise.entries()) {
          const t = oneRepMaxTrend({ records, now: new Date(), constants });
          const latest = records[0];
          data.push({
            exercise_id: exerciseId,
            primary_estimate_kg: latest.primary_estimate_kg,
            delta_pct: t.delta_pct,
            on_pace: t.on_pace,
          });
        }
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },
  };
}
