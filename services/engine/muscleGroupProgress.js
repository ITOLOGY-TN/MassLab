// Phase 11 (014-phase11-statistics) — pure radar: progress % per muscle group, now vs
// start (research D-5). For each group, sum the FIRST working weight and the LATEST
// working weight across the group's exercises that have ≥ 2 points, then express the
// latest as a % gain over the start. Clamped to ≥ 0 (the radar shows progress, never
// regression) and rounded to 2 decimals; origin (0) when a group has insufficient data.
// Axes/values are aligned to the supplied muscleGroups order. No clock/I/O/globals.

function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * @param {object} args
 * @param {Map<number, Array<{ date:string, working_weight_kg:number }>>} args.seriesByExercise
 *   exercise_id → ascending working-weight series (output of buildWorkingWeightSeries).
 * @param {Map<number, string>} args.exerciseMuscleGroup  exercise_id → group name
 * @param {Array<{ name:string, display_color:string }>} args.muscleGroups  ordered groups
 * @returns {{ axes: Array<{ muscle_group:string, color:string }>, values: number[] }}
 */
export function progressByGroup({
  seriesByExercise = new Map(),
  exerciseMuscleGroup = new Map(),
  muscleGroups = [],
} = {}) {
  // Accumulate per group the summed first/latest working weights of qualifying exercises.
  const sums = new Map(); // groupName → { start, latest }

  for (const [exerciseId, series] of seriesByExercise) {
    if (!series || series.length < 2) continue;
    const groupName = exerciseMuscleGroup.get(exerciseId);
    if (groupName == null) continue;
    const acc = sums.get(groupName) ?? { start: 0, latest: 0 };
    acc.start += series[0].working_weight_kg;
    acc.latest += series[series.length - 1].working_weight_kg;
    sums.set(groupName, acc);
  }

  const axes = muscleGroups.map((g) => ({ muscle_group: g.name, color: g.display_color }));
  const values = muscleGroups.map((g) => {
    const acc = sums.get(g.name);
    if (!acc || acc.start <= 0) return 0; // origin when insufficient
    return round2(Math.max(0, ((acc.latest - acc.start) / acc.start) * 100));
  });

  return { axes, values };
}
