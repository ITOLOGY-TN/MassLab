import { describe, it, expect } from 'vitest';
import { evaluateForAthlete } from '../../services/progressionEngine.js';
import { DEFAULTS } from '../../services/engine/constants.js';

const exerciseBench = { id: 1, slug: 'bench-press', muscle_group: 'chest_triceps', body_segment: 'upper' };
const exerciseSquat = { id: 2, slug: 'back-squat', muscle_group: 'legs', body_segment: 'lower' };

const weeklyPlan = [
  {
    muscle_group: 'chest_triceps',
    exercises: [{ exercise_id: 1, target_sets: 3, target_reps_low: 6, target_reps_high: 10 }],
  },
  {
    muscle_group: 'legs',
    exercises: [{ exercise_id: 2, target_sets: 3, target_reps_low: 6, target_reps_high: 10 }],
  },
];

function dt(daysAgo) {
  return new Date(Date.UTC(2026, 4, 7) - daysAgo * 86400_000).toISOString();
}

const NOW = new Date(Date.UTC(2026, 4, 7));

describe('progressionEngine', () => {
  it('emits add_load when every working set hit top of range across two consecutive sessions', () => {
    const sessions = [
      { id: 10, started_at: dt(7) },
      { id: 11, started_at: dt(0) },
    ];
    const sets = [
      { session_id: 10, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 10 },
      { session_id: 10, exercise_id: 1, set_number: 2, weight_kg: 80, reps: 10 },
      { session_id: 10, exercise_id: 1, set_number: 3, weight_kg: 80, reps: 10 },
      { session_id: 11, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 10 },
      { session_id: 11, exercise_id: 1, set_number: 2, weight_kg: 80, reps: 10 },
      { session_id: 11, exercise_id: 1, set_number: 3, weight_kg: 80, reps: 10 },
    ];
    const out = evaluateForAthlete({
      sessions,
      sets,
      weeklyPlan,
      exercisesById: { 1: exerciseBench, 2: exerciseSquat },
      constants: DEFAULTS,
      now: NOW,
    });
    const benchFlag = out.find((c) => c.scope_kind === 'exercise' && c.scope_ref === '1');
    expect(benchFlag.flag).not.toBeNull();
    expect(benchFlag.flag.flag_type).toBe('add_load');
    expect(benchFlag.flag.suggested_adjustment.delta_kg).toBe(DEFAULTS.load_increment_upper_kg);
  });

  it('emits regression when most recent load is lower than two weeks earlier', () => {
    const sessions = [
      { id: 20, started_at: dt(15) },
      { id: 21, started_at: dt(0) },
    ];
    const sets = [
      { session_id: 20, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 8 },
      { session_id: 21, exercise_id: 1, set_number: 1, weight_kg: 70, reps: 8 },
    ];
    const out = evaluateForAthlete({
      sessions,
      sets,
      weeklyPlan,
      exercisesById: { 1: exerciseBench },
      constants: DEFAULTS,
      now: NOW,
    });
    const benchFlag = out.find((c) => c.scope_kind === 'exercise' && c.scope_ref === '1');
    expect(benchFlag.flag.flag_type).toBe('regression');
  });

  it('emits stagnation when weekly volume is unchanged for three weeks', () => {
    const sessions = [
      { id: 30, started_at: dt(15) },
      { id: 31, started_at: dt(8) },
      { id: 32, started_at: dt(1) },
    ];
    const sets = [
      { session_id: 30, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 8 },
      { session_id: 30, exercise_id: 1, set_number: 2, weight_kg: 80, reps: 8 },
      { session_id: 31, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 8 },
      { session_id: 31, exercise_id: 1, set_number: 2, weight_kg: 80, reps: 8 },
      { session_id: 32, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 8 },
      { session_id: 32, exercise_id: 1, set_number: 2, weight_kg: 80, reps: 8 },
    ];
    const out = evaluateForAthlete({
      sessions,
      sets,
      weeklyPlan,
      exercisesById: { 1: exerciseBench },
      constants: DEFAULTS,
      now: NOW,
    });
    const muscleFlag = out.find(
      (c) => c.scope_kind === 'muscle_group' && c.scope_ref === 'chest_triceps',
    );
    expect(muscleFlag.flag.flag_type).toBe('stagnation');
  });

  it('emits deload_suggested when week average RPE >= threshold and coverage >= minimum', () => {
    const sessions = [
      { id: 40, started_at: dt(3) },
      { id: 41, started_at: dt(1) },
    ];
    const sets = [];
    for (let i = 1; i <= 10; i++) {
      sets.push({ session_id: 40, exercise_id: 1, set_number: i, weight_kg: 80, reps: 5, rpe: 9 });
    }
    for (let i = 1; i <= 10; i++) {
      sets.push({ session_id: 41, exercise_id: 1, set_number: i, weight_kg: 80, reps: 5, rpe: 9 });
    }
    const out = evaluateForAthlete({
      sessions,
      sets,
      weeklyPlan,
      exercisesById: { 1: exerciseBench },
      constants: DEFAULTS,
      now: NOW,
    });
    const muscleFlag = out.find(
      (c) => c.scope_kind === 'muscle_group' && c.scope_ref === 'chest_triceps',
    );
    expect(muscleFlag.flag.flag_type).toBe('deload_suggested');
  });

  it('suppresses flags when history is insufficient', () => {
    const sessions = [{ id: 50, started_at: dt(0) }];
    const sets = [{ session_id: 50, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 10 }];
    const out = evaluateForAthlete({
      sessions,
      sets,
      weeklyPlan,
      exercisesById: { 1: exerciseBench },
      constants: DEFAULTS,
      now: NOW,
    });
    const benchFlag = out.find((c) => c.scope_kind === 'exercise' && c.scope_ref === '1');
    expect(benchFlag.flag).toBeNull();
  });

  it('is deterministic — same input ⇒ same output', () => {
    const sessions = [{ id: 60, started_at: dt(7) }, { id: 61, started_at: dt(0) }];
    const sets = [
      { session_id: 60, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 10 },
      { session_id: 61, exercise_id: 1, set_number: 1, weight_kg: 80, reps: 10 },
    ];
    const args = { sessions, sets, weeklyPlan, exercisesById: { 1: exerciseBench }, constants: DEFAULTS, now: NOW };
    expect(JSON.stringify(evaluateForAthlete(args))).toBe(JSON.stringify(evaluateForAthlete(args)));
  });
});
