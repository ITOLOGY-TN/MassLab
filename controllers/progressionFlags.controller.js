import { evaluateForAthlete } from '../services/progressionEngine.js';
import { resolveConstants } from '../services/engine/resolveConstants.js';
import { writeAudit } from '../services/engine/auditWriter.js';
import { ENGINE_VERSION } from '../services/engine/constants.js';
import { bodySegmentFor } from '../services/engine/bodySegment.js';

export function progressionFlagsController({ daos }) {
  return {
    async listActive(req, res, next) {
      try {
        const data = await daos.progressionFlags.findActiveForAthlete(req.athleteId);
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async listHistory(req, res, next) {
      try {
        const limit = Math.min(Number(req.query.limit) || 100, 1000);
        const data = await daos.progressionFlags.listHistoryForAthlete(req.athleteId, { limit });
        res.json({ data });
      } catch (err) {
        next(err);
      }
    },

    async evaluate(req, res, next) {
      try {
        // Pull everything the engine needs from existing Phase 0 DAOs.
        const overrides = await daos.appConfig.getOverridesFor(req.athleteId);
        const constants = resolveConstants(overrides);

        const exercises = await daos.exercises.listForAthlete({ athleteId: req.athleteId });
        const exercisesById = {};
        for (const e of exercises) {
          // Body segment derivation is shared with Phase 4 session finish + the
          // suggested-target load recommendation (research D-6).
          exercisesById[e.id] = {
            id: e.id,
            slug: e.slug,
            muscle_group: null,
            body_segment: bodySegmentFor(e),
          };
        }

        const slots = await daos.weeklyPlan.listSlotsWithExercises(req.athleteId);
        for (const slot of slots) {
          for (const ex of slot.exercises) {
            if (exercisesById[ex.exercise_id]) {
              exercisesById[ex.exercise_id].muscle_group = slot.muscle_group;
              if (['legs'].includes(slot.muscle_group)) {
                exercisesById[ex.exercise_id].body_segment = 'lower';
              }
            }
          }
        }

        // Phase 4 wires session_journal_entries / session_sets persistence; in
        // Phase 1 those tables exist (Phase 0 schema) but are empty for the
        // seeded athlete. The engine returns "no flag" for every scope, which
        // the DAO supersede call handles gracefully.
        const sessions = []; // TODO Phase 4: read from session_journal_entries DAO
        const sets = []; // TODO Phase 4: read from session_sets DAO

        const candidates = evaluateForAthlete({
          sessions,
          sets,
          weeklyPlan: slots,
          exercisesById,
          constants,
          now: new Date(),
        });

        const results = [];
        for (const c of candidates) {
          const row = await daos.progressionFlags.supersedeAndInsert(
            { athleteId: req.athleteId, scopeKind: c.scope_kind, scopeRef: c.scope_ref },
            c.flag,
          );
          if (row) results.push(row);
        }

        await writeAudit({
          daos,
          athleteId: req.athleteId,
          calculator: 'progression_eval',
          inputs: { session_count: sessions.length, set_count: sets.length },
          outputs: { active_flag_count: results.length },
          resolvedConstants: constants,
          engineVersion: ENGINE_VERSION,
        });

        res.json({ data: results });
      } catch (err) {
        next(err);
      }
    },
  };
}
