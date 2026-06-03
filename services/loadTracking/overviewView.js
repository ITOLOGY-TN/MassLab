// Pure presenter — compose the load-tracking overview rows from the per-exercise
// 1RM series + active flags (Phase 5, research D-1/D-4/D-5/D-6). Current load and
// the all-time record derive from the series' `working_load_kg` (the feed set =
// the heaviest completed set), so they agree with the other screens. No I/O.
import { trendDirection } from '../engine/trendProjection.js';
import { overviewStatus, STATUS } from './statusMap.js';

/**
 * @param {object} args
 * @param {Array<{ id, slug, name, is_active }>} args.exercises
 * @param {Map<number, Array>} args.seriesByExerciseId  normalized series (oneRmSeries) per exercise
 * @param {Map<number, number|null>} args.lastSessionVolumeByExerciseId
 * @param {Map<number, object|null>} args.exerciseFlagByExerciseId  active exercise-scope flag row
 * @param {Map<number, string|null>} args.muscleGroupFlagTypeByExerciseId
 * @param {Map<number, { name, color }|null>} args.muscleGroupByExerciseId
 * @param {Array<{ name, color }>} args.deloadNotices
 * @param {Date|string|number} args.now
 */
export function buildOverview({
  exercises = [],
  seriesByExerciseId = new Map(),
  lastSessionVolumeByExerciseId = new Map(),
  exerciseFlagByExerciseId = new Map(),
  muscleGroupFlagTypeByExerciseId = new Map(),
  muscleGroupByExerciseId = new Map(),
  deloadNotices = [],
  now,
} = {}) {
  let anyHistory = false;

  const rows = exercises.map((ex) => {
    const series = seriesByExerciseId.get(ex.id) || [];
    if (series.length) anyHistory = true;
    const latest = series.length ? series[series.length - 1] : null;
    const record = series.length ? Math.max(...series.map((p) => p.working_load_kg)) : null;
    const flag = exerciseFlagByExerciseId.get(ex.id) || null;
    const status = overviewStatus({
      exerciseFlagType: flag?.flag_type ?? null,
      muscleGroupFlagType: muscleGroupFlagTypeByExerciseId.get(ex.id) ?? null,
    });
    return {
      exercise_id: ex.id,
      slug: ex.slug ?? null,
      name: ex.name ?? null,
      muscle_group: muscleGroupByExerciseId.get(ex.id) ?? null,
      is_active: ex.is_active !== false,
      current_load_kg: latest ? latest.working_load_kg : null,
      all_time_record_kg: record,
      last_session_volume_kg: lastSessionVolumeByExerciseId.get(ex.id) ?? null,
      trend: trendDirection({ series, now }),
      status,
      status_increment_kg:
        status === STATUS.READY ? (flag?.suggested_adjustment?.delta_kg ?? null) : null,
    };
  });

  return { exercises: rows, deload_notices: deloadNotices, empty: !anyHistory };
}
