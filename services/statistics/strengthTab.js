// Phase 11 (014-phase11-statistics) — pure Strength-tab presenter (data-model §2.3).
// Composes: top progressions (abs working-weight gain since start, D-4), weekly training
// volume bucketed into ISO weeks, and the progress-% muscle radar (D-5). No I/O, no clock
// — the controller injects the resolved `programStart`/`asOf` strings and the muscle-group
// maps (Constitution II + V).
import {
  buildWorkingWeightSeries,
  rankByWorkingWeightGain,
} from '../engine/exerciseImprovements.js';
import { progressByGroup } from '../engine/muscleGroupProgress.js';
import { isoWeekStart } from '../supplements/week.js';

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} args
 * @param {Array}  args.records              one_rep_max_records rows (seriesForAthlete)
 * @param {Map<number,string>} args.names    exercise_id → name
 * @param {Map<number,string>} args.exerciseMuscleGroup  exercise_id → group name
 * @param {Array}  args.muscleGroups         ordered [{ name, display_color }]
 * @param {Array}  args.dailyVolumes         [{ ended_at, total_volume_kg }] finished sessions
 * @param {string} args.programStart         YYYY-MM-DD
 * @param {string} args.asOf                 YYYY-MM-DD
 * @param {number} args.topN                 STATISTICS_TOP_EXERCISES
 */
export function build({
  records = [],
  names = new Map(),
  exerciseMuscleGroup = new Map(),
  muscleGroups = [],
  dailyVolumes = [],
  programStart,
  asOf,
  topN,
} = {}) {
  const seriesByExercise = buildWorkingWeightSeries(records, { programStart, asOf });

  const top_progressions = rankByWorkingWeightGain({ seriesByExercise, names, topN });

  // Bucket finished-session volumes into ISO weeks (Monday-anchored), ascending.
  const weekTotals = new Map();
  for (const v of dailyVolumes) {
    if (!v || v.ended_at == null) continue;
    const week = isoWeekStart(String(v.ended_at).slice(0, 10));
    weekTotals.set(week, (weekTotals.get(week) ?? 0) + (Number(v.total_volume_kg) || 0));
  }
  const weekly_volume = [...weekTotals.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([week_start, volume_kg]) => ({ week_start, volume_kg: round2(volume_kg) }));

  const muscle_radar = progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups });

  return { top_progressions, weekly_volume, muscle_radar };
}
