// Pure presenter — compose the per-exercise progression detail from the 1RM
// series + per-session volume rollup (Phase 5, research D-1/D-4/D-11). The
// primary chart line is the estimated-1RM series (the projection extends it,
// I1); working load is the secondary line and the record a working-load marker.
// No I/O, no globals (Constitution II + V).
import { projectOneRm } from '../engine/trendProjection.js';

/**
 * @param {object} args
 * @param {{ id, slug, name, is_active }} args.exercise
 * @param {Array} args.series  normalized series (oneRmSeries), ascending
 * @param {Array} args.recentSessionVolumes  per-session rollup, newest first (≤10)
 */
export function buildExerciseProgress({ exercise, series = [], recentSessionVolumes = [] }) {
  const latest = series.length ? series[series.length - 1] : null;
  const record = series.length ? Math.max(...series.map((p) => p.working_load_kg)) : null;

  return {
    exercise_id: exercise.id,
    slug: exercise.slug ?? null,
    name: exercise.name ?? null,
    is_active: exercise.is_active !== false,
    current_estimate_1rm_kg: latest ? latest.estimate_1rm_kg : null,
    all_time_record_kg: record,
    load_series: series.map((p) => ({
      date: p.date,
      working_load_kg: p.working_load_kg,
      estimate_1rm_kg: p.estimate_1rm_kg,
    })),
    // ascending by date for the bar chart (rollup arrives newest-first)
    volume_series: [...recentSessionVolumes]
      .reverse()
      .map((r) => ({ date: r.date, session_id: r.session_id, total_volume_kg: r.total_volume_kg })),
    recent_sessions: recentSessionVolumes,
    projection: projectOneRm({ series }),
  };
}
