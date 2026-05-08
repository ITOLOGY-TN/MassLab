// Pure rule engine — emits one candidate flag per scope (athlete + exercise OR
// athlete + muscle_group) based on session/set history. The DAO reconciles each
// candidate against the currently-active flag and supersedes if needed.
//
// Rules (FR-012..FR-016):
//   add_load          — every set hit top-of-range × double-progression-window sessions (per-exercise)
//   regression        — latest load < load `regression_window_weeks` weeks ago (per-exercise)
//   stagnation        — weekly muscle-group volume unchanged for `stagnation_window_weeks` weeks
//   deload_suggested  — week's avg RPE ≥ threshold (with ≥ coverage), OR ≥ 2 regressions in week
//   maintain          — none of the above; emitted ONLY when there is enough history to know
//
// Time-dependent inputs (sessions/sets timestamps + `now`) are passed in by the
// caller — the engine itself does no `Date.now()` reads.

import { ENGINE_VERSION } from './engine/constants.js';

const ONE_WEEK_MS = 7 * 86_400_000;

function isoWeekStart(d, weeksAgo = 0) {
  const date = new Date(d);
  const day = date.getUTCDay() || 7;
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - (day - 1) - weeksAgo * 7);
  return date.getTime();
}

function setsForSession(sets, sessionId) {
  return sets.filter((s) => s.session_id === sessionId);
}

function evaluateExerciseAddLoad(exercise, sessions, sets, weeklyPlanSlot, constants) {
  const window = constants.double_progression_window_sessions;
  const exSessions = sessions
    .filter((s) => sets.some((x) => x.session_id === s.id && x.exercise_id === exercise.id))
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

  if (exSessions.length < window) return null;

  const candidates = exSessions.slice(0, window);
  const targetSlot = weeklyPlanSlot?.exercises?.find((e) => e.exercise_id === exercise.id);
  if (!targetSlot) return null;

  const everyTopOfRange = candidates.every((session) => {
    const exSets = sets.filter(
      (x) => x.session_id === session.id && x.exercise_id === exercise.id,
    );
    if (exSets.length < targetSlot.target_sets) return false;
    return exSets.every((set) => set.reps >= targetSlot.target_reps_high);
  });

  if (!everyTopOfRange) return null;

  const delta_kg =
    exercise.body_segment === 'upper'
      ? constants.load_increment_upper_kg
      : constants.load_increment_lower_kg;

  return {
    flag_type: 'add_load',
    rule: 'double_progression',
    suggested_adjustment: { delta_kg },
  };
}

function evaluateExerciseRegression(exercise, sessions, sets, constants) {
  const cutoff = constants.regression_window_weeks * ONE_WEEK_MS;
  const exSets = sets.filter((s) => s.exercise_id === exercise.id);
  if (exSets.length < 2) return null;

  const sessionTime = new Map(sessions.map((s) => [s.id, new Date(s.started_at).getTime()]));
  const enriched = exSets
    .map((s) => ({ ...s, t: sessionTime.get(s.session_id) ?? 0 }))
    .filter((s) => s.t)
    .sort((a, b) => b.t - a.t);

  const latest = enriched[0];
  const earlier = enriched.find((s) => latest.t - s.t >= cutoff);
  if (!earlier) return null;

  if (latest.weight_kg < earlier.weight_kg) {
    return {
      flag_type: 'regression',
      rule: 'load_drop',
      suggested_adjustment: {
        from_kg: Number(earlier.weight_kg),
        to_kg: Number(latest.weight_kg),
      },
    };
  }
  return null;
}

function muscleGroupVolume(weeklyVolumes) {
  // Simple sum of all weekly volumes for a muscle group across the window.
  return weeklyVolumes.reduce((acc, v) => acc + v, 0);
}

function weeklyVolumeForMuscleGroup(muscle, weekStartMs, sessions, sets, weeklyPlan) {
  const planSlot = weeklyPlan.find((p) => p.muscle_group === muscle);
  if (!planSlot) return 0;
  const exerciseIds = planSlot.exercises.map((e) => e.exercise_id);
  const sessionsInWeek = sessions.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return t >= weekStartMs && t < weekStartMs + ONE_WEEK_MS;
  });
  const sessionIds = new Set(sessionsInWeek.map((s) => s.id));
  return sets
    .filter((s) => sessionIds.has(s.session_id) && exerciseIds.includes(s.exercise_id))
    .reduce((acc, s) => acc + Number(s.weight_kg) * s.reps, 0);
}

function evaluateMuscleStagnation(muscle, sessions, sets, weeklyPlan, constants, now) {
  const window = constants.stagnation_window_weeks;
  const volumes = [];
  for (let i = 0; i < window; i++) {
    const ws = isoWeekStart(now, i);
    volumes.push(weeklyVolumeForMuscleGroup(muscle, ws, sessions, sets, weeklyPlan));
  }
  if (volumes.some((v) => v === 0)) return null; // insufficient history
  if (muscleGroupVolume(volumes) === 0) return null;
  const allEqual = volumes.every((v) => v === volumes[0]);
  if (!allEqual) return null;
  return {
    flag_type: 'stagnation',
    rule: 'flat_weekly_volume',
    suggested_adjustment: { volume_cut_pct: 0, increase_volume: true },
  };
}

function evaluateMuscleDeload(muscle, sessions, sets, weeklyPlan, constants, now) {
  const ws = isoWeekStart(now, 0);
  const planSlot = weeklyPlan.find((p) => p.muscle_group === muscle);
  if (!planSlot) return null;
  const exerciseIds = planSlot.exercises.map((e) => e.exercise_id);
  const sessionsInWeek = sessions.filter((s) => {
    const t = new Date(s.started_at).getTime();
    return t >= ws && t < ws + ONE_WEEK_MS;
  });
  const sessionIds = new Set(sessionsInWeek.map((s) => s.id));
  const weekSets = sets.filter(
    (s) => sessionIds.has(s.session_id) && exerciseIds.includes(s.exercise_id),
  );
  if (weekSets.length === 0) return null;
  const withRpe = weekSets.filter((s) => s.rpe != null);
  const coverage = withRpe.length / weekSets.length;
  if (coverage < constants.rpe_coverage_minimum_pct / 100) return null;

  const avgRpe = withRpe.reduce((acc, s) => acc + s.rpe, 0) / withRpe.length;
  if (avgRpe >= constants.deload_rpe_threshold) {
    return {
      flag_type: 'deload_suggested',
      rule: 'high_avg_rpe',
      suggested_adjustment: { volume_cut_pct: constants.deload_volume_cut_pct },
    };
  }
  return null;
}

export function evaluateForAthlete({
  sessions = [],
  sets = [],
  weeklyPlan = [],
  exercisesById = {},
  constants,
  now = new Date(),
}) {
  if (!constants) throw new Error('constants is required');
  const candidates = [];

  const exerciseIds = new Set(sets.map((s) => s.exercise_id));
  for (const exId of exerciseIds) {
    const exercise = exercisesById[exId];
    if (!exercise) continue;
    const planSlot = weeklyPlan.find((p) => p.muscle_group === exercise.muscle_group);
    const flag =
      evaluateExerciseAddLoad(exercise, sessions, sets, planSlot, constants) ??
      evaluateExerciseRegression(exercise, sessions, sets, constants);
    candidates.push({
      scope_kind: 'exercise',
      scope_ref: String(exId),
      flag: flag
        ? {
            ...flag,
            engine_version: ENGINE_VERSION,
            resolved_constants: constants,
          }
        : null,
    });
  }

  const muscleGroups = new Set(weeklyPlan.map((p) => p.muscle_group));
  for (const muscle of muscleGroups) {
    const flag =
      evaluateMuscleDeload(muscle, sessions, sets, weeklyPlan, constants, now) ??
      evaluateMuscleStagnation(muscle, sessions, sets, weeklyPlan, constants, now);
    candidates.push({
      scope_kind: 'muscle_group',
      scope_ref: muscle,
      flag: flag
        ? {
            ...flag,
            engine_version: ENGINE_VERSION,
            resolved_constants: constants,
          }
        : null,
    });
  }

  return candidates;
}
