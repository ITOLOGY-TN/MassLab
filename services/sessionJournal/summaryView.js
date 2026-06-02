// Pure presenter — compose the PostSessionSummary from the finished session, its
// completed sets, and the controller-supplied PRs + engine counts (research
// D-11). Numbers come from the pure sessionTotals helpers. No I/O, no clock, no
// globals (Constitution II + V).
import { totalVolume, topPerformance } from '../engine/sessionTotals.js';

/**
 * @param {object} args
 * @param {{ id, started_at, ended_at, note, energy_rating }} args.session
 * @param {Array} args.completedSets  Completed sets across the session (with exercise_id).
 * @param {Map<number, { name }>} args.exercisesById
 * @param {Array} args.personalRecords  From detectPersonalRecords (already computed in the controller).
 * @param {{ progression_flags_updated, one_rep_max_records_created }} args.engineCounts
 */
export function buildPostSessionSummary({
  session,
  completedSets = [],
  exercisesById = new Map(),
  personalRecords = [],
  engineCounts = { progression_flags_updated: 0, one_rep_max_records_created: 0 },
}) {
  const top = topPerformance(completedSets);
  const durationSeconds =
    session.started_at && session.ended_at
      ? Math.max(
          0,
          Math.round(
            (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000,
          ),
        )
      : 0;

  return {
    session_id: session.id,
    duration_seconds: durationSeconds,
    total_volume_kg: totalVolume(completedSets),
    top_performance: top
      ? {
          exercise_id: top.exercise_id,
          name: exercisesById.get(top.exercise_id)?.name ?? null,
          weight_kg: Number(top.weight_kg),
          reps: top.reps,
        }
      : null,
    personal_records: personalRecords,
    energy_rating: session.energy_rating ?? null,
    note: session.note ?? null,
    engine: engineCounts,
  };
}
