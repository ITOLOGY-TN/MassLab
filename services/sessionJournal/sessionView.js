// Pure presenter — compose the SessionView (start/resume) from DAO data + the
// shared engine helpers (research D-9, D-13). Reuses the Phase 3 last-weight +
// load-recommendation logic so the journal and the program views never disagree.
// No I/O, no clock, no globals (Constitution II + V).
import { lastWeightUsed } from '../engine/exerciseHistory.js';
import { recommendWorkingLoad } from '../engine/loadRecommendation.js';
import { bodySegmentFor } from '../engine/bodySegment.js';

function mapLoggedSet(s) {
  return {
    set_id: s.id,
    set_number: s.set_number,
    weight_kg: Number(s.weight_kg),
    reps: s.reps,
    rpe: s.rpe ?? null,
    completed: Boolean(s.completed),
  };
}

/**
 * @param {object} args
 * @param {{ id, day_of_week, started_at, sets: Array }} args.session
 * @param {Array<{ exercise_id, position, target_sets, target_reps_low, target_reps_high }>} args.plannedExercises
 * @param {Map<number, { slug, name, is_active, targeted_muscles }>} args.exercisesById
 * @param {{ name, color }|null} args.muscleGroup
 * @param {Map<number, Array>} args.historyByExerciseId  exercise_id → prior sessions (for last weight / suggested target)
 * @param {Map<number, object>} args.activeFlagByExerciseId
 * @param {number} args.restSeconds
 * @param {object} args.constants
 * @param {boolean} args.stale
 */
export function buildSessionView({
  session,
  plannedExercises = [],
  exercisesById = new Map(),
  muscleGroup = null,
  historyByExerciseId = new Map(),
  activeFlagByExerciseId = new Map(),
  restSeconds = 0,
  constants,
  stale = false,
}) {
  const setsByExerciseId = new Map();
  for (const s of session.sets ?? []) {
    if (!setsByExerciseId.has(s.exercise_id)) setsByExerciseId.set(s.exercise_id, []);
    setsByExerciseId.get(s.exercise_id).push(s);
  }

  const buildRow = (exercise_id, planned) => {
    const meta = exercisesById.get(exercise_id) || {};
    const history = historyByExerciseId.get(exercise_id) || [];
    const lw = lastWeightUsed(history);
    const activeFlag = activeFlagByExerciseId.get(exercise_id) || null;
    const segment = bodySegmentFor({
      slug: meta.slug,
      targeted_muscles: meta.targeted_muscles,
      // The day's muscle group applies to planned rows only; an ad-hoc exercise
      // (no `planned`) must fall back to its own slug/muscles, not inherit the day.
      muscle_group: planned ? muscleGroup?.name : null,
    });
    return {
      exercise_id,
      slug: meta.slug ?? null,
      name: meta.name ?? null,
      position: planned?.position ?? null,
      is_active: meta.is_active !== false,
      target_sets: planned?.target_sets ?? null,
      target_reps_low: planned?.target_reps_low ?? null,
      target_reps_high: planned?.target_reps_high ?? null,
      previous_weight_kg: lw,
      suggested_target_kg: recommendWorkingLoad({
        lastWeightKg: lw,
        activeFlag,
        bodySegment: segment,
        constants,
      }),
      sets: (setsByExerciseId.get(exercise_id) || [])
        .slice()
        .sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0))
        .map(mapLoggedSet),
    };
  };

  const exercises = plannedExercises
    .slice()
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((pe) => buildRow(pe.exercise_id, pe));

  // Ad-hoc exercises: logged this session but not on the plan (FR-011a).
  const plannedIds = new Set(plannedExercises.map((pe) => pe.exercise_id));
  for (const exId of setsByExerciseId.keys()) {
    if (!plannedIds.has(exId)) exercises.push(buildRow(exId, null));
  }

  return {
    session_id: session.id,
    day_of_week: session.day_of_week ?? null,
    started_at: session.started_at,
    stale: Boolean(stale),
    rest_seconds: restSeconds,
    muscle_group: muscleGroup,
    exercises,
  };
}
