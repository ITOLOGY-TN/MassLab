// Phase 5 (008-load-tracking) — the Load Tracking read surface. Thin
// orchestration: read DAOs, hand plain data to the pure loadTracking/* + engine
// helpers, return the `{ data }` envelope. READ-ONLY — never writes, never
// re-runs the engine (FR-022). research D-10.
import { HttpError } from '../middleware/errorHandler.js';
import { oneRmSeries } from '../services/engine/trendProjection.js';
import { buildOverview } from '../services/loadTracking/overviewView.js';
import { buildExerciseProgress } from '../services/loadTracking/exerciseProgressView.js';
import { buildPhaseRadar } from '../services/loadTracking/phaseRadarView.js';
import { deloadMuscleGroups } from '../services/loadTracking/statusMap.js';

export function loadTrackingController({ daos }) {
  // exercise_id → muscle-group ref + name (first slot wins), plus the group list.
  async function muscleGroupMaps(athleteId) {
    const [slots, groups] = await Promise.all([
      daos.weeklyPlan.listSlotsWithExercises(athleteId),
      daos.muscleGroups.listForAthlete(athleteId, { includeArchived: true }),
    ]);
    const groupById = new Map(groups.map((g) => [g.id, g]));
    const exMg = new Map(); // exercise_id → { name, color }
    const exMgName = new Map(); // exercise_id → name
    for (const slot of slots) {
      const g = groupById.get(slot.muscle_group_id);
      const ref = {
        name: g?.name ?? 'Unassigned',
        color: slot.display_color ?? g?.display_color ?? '#6b7280',
      };
      for (const ex of slot.exercises ?? []) {
        if (!exMg.has(ex.exercise_id)) {
          exMg.set(ex.exercise_id, ref);
          exMgName.set(ex.exercise_id, ref.name);
        }
      }
    }
    return { groups, exMg, exMgName };
  }

  function seriesByExercise(records) {
    const byEx = new Map();
    for (const r of records) {
      if (!byEx.has(r.exercise_id)) byEx.set(r.exercise_id, []);
      byEx.get(r.exercise_id).push(r);
    }
    const out = new Map();
    for (const [exId, recs] of byEx) out.set(exId, oneRmSeries(recs));
    return out;
  }

  return {
    // GET /api/v1/load-tracking/overview
    async overview(req, res, next) {
      try {
        const athleteId = req.athleteId;
        const now = new Date();
        const [records, activeFlags, exercises, mg] = await Promise.all([
          daos.oneRepMaxRecords.seriesForAthlete(athleteId),
          daos.progressionFlags.findActiveForAthlete(athleteId),
          daos.exercises.listForAthlete({ athleteId, includeArchived: true }),
          muscleGroupMaps(athleteId),
        ]);

        const exerciseFlagByExerciseId = new Map();
        const mgFlagTypeByName = new Map();
        for (const f of activeFlags) {
          if (f.scope_kind === 'exercise') exerciseFlagByExerciseId.set(Number(f.scope_ref), f);
          else if (f.scope_kind === 'muscle_group') mgFlagTypeByName.set(f.scope_ref, f.flag_type);
        }
        const muscleGroupFlagTypeByExerciseId = new Map();
        for (const ex of exercises) {
          const name = mg.exMgName.get(ex.id);
          if (name && mgFlagTypeByName.has(name)) {
            muscleGroupFlagTypeByExerciseId.set(ex.id, mgFlagTypeByName.get(name));
          }
        }

        // One batched read for every exercise's last finished-session volume.
        const volumeByEx = await daos.sessions.latestSessionVolumeByExercise(athleteId);
        const lastSessionVolumeByExerciseId = new Map(
          exercises.map((ex) => [ex.id, volumeByEx[ex.id] ?? null]),
        );

        const groupByName = new Map(mg.groups.map((g) => [g.name, g]));
        const deloadNotices = deloadMuscleGroups(activeFlags).map((ref) => {
          const g = groupByName.get(ref);
          return { name: g?.name ?? ref, color: g?.display_color ?? '#6b7280' };
        });

        res.json({
          data: buildOverview({
            exercises: exercises.map((e) => ({
              id: e.id,
              slug: e.slug,
              name: e.name,
              is_active: e.is_active,
            })),
            seriesByExerciseId: seriesByExercise(records),
            lastSessionVolumeByExerciseId,
            exerciseFlagByExerciseId,
            muscleGroupFlagTypeByExerciseId,
            muscleGroupByExerciseId: mg.exMg,
            deloadNotices,
            now,
          }),
        });
      } catch (err) {
        next(err);
      }
    },

    // GET /api/v1/load-tracking/exercises/:id
    async getExercise(req, res, next) {
      try {
        const id = Number(req.params.id);
        if (!Number.isInteger(id)) {
          throw new HttpError(404, 'NOT_FOUND', 'Exercise id must be an integer.');
        }
        const exercise = await daos.exercises.findById(req.athleteId, id);
        if (!exercise) throw new HttpError(404, 'NOT_FOUND', `Exercise ${id} not found.`);

        const [records, recentSessionVolumes] = await Promise.all([
          daos.oneRepMaxRecords.listForAthlete({ athleteId: req.athleteId, exerciseId: id }),
          daos.sessions.recentSessionVolumesForExercise(req.athleteId, id, { limit: 10 }),
        ]);

        res.json({
          data: buildExerciseProgress({
            exercise: {
              id: exercise.id,
              slug: exercise.slug,
              name: exercise.name,
              is_active: exercise.is_active,
            },
            series: oneRmSeries(records),
            recentSessionVolumes,
          }),
        });
      } catch (err) {
        next(err);
      }
    },

    // GET /api/v1/load-tracking/phase-comparison
    async getPhaseComparison(req, res, next) {
      try {
        const athleteId = req.athleteId;
        const [records, mg, phases, athlete] = await Promise.all([
          daos.oneRepMaxRecords.seriesForAthlete(athleteId),
          muscleGroupMaps(athleteId),
          daos.trainingPhases.listForAthlete({ athleteId }),
          daos.athletes.findById(athleteId),
        ]);

        res.json({
          data: buildPhaseRadar({
            records,
            exerciseMuscleGroup: mg.exMgName,
            muscleGroups: mg.groups.map((g) => ({ name: g.name, color: g.display_color })),
            phases,
            programStartDate: athlete?.program_start_date,
          }),
        });
      } catch (err) {
        next(err);
      }
    },
  };
}
