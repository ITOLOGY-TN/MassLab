import { describe, it, expect } from 'vitest';
import { buildDayView, mapProgression } from '../../services/trainingProgram/dayView.js';

const exerciseById = new Map([
  [101, { slug: 'bench-press', name: 'Bench Press', is_active: true }],
  [102, { slug: 'incline-db', name: 'Incline DB Press', is_active: true }],
  [103, { slug: 'old-flye', name: 'Cable Flye (retiré)', is_active: false }],
]);

const slot = {
  exercises: [
    { exercise_id: 102, position: 2, target_sets: 3, target_reps_low: 8, target_reps_high: 12 },
    { exercise_id: 101, position: 1, target_sets: 4, target_reps_low: 6, target_reps_high: 8 },
    { exercise_id: 103, position: 3, target_sets: 3, target_reps_low: 12, target_reps_high: 15 },
  ],
};

describe('trainingProgram.dayView — mapProgression (D-4)', () => {
  it('maps engine flags to the three UI states', () => {
    expect(mapProgression('add_load')).toBe('ready_to_increase');
    expect(mapProgression('regression')).toBe('regressing');
    expect(mapProgression('maintain')).toBe('stable');
    expect(mapProgression('stagnation')).toBe('stable');
    expect(mapProgression('deload_suggested')).toBe('stable');
    expect(mapProgression(null)).toBe('stable');
  });
});

describe('trainingProgram.dayView — buildDayView (FR-007..FR-012)', () => {
  it('orders exercises by position and carries target sets/reps', () => {
    const out = buildDayView({ dayOfWeek: 1, slot, muscleGroup: { name: 'Chest', color: '#E54D2E' }, exerciseById });
    expect(out.exercises.map((e) => e.exercise_id)).toEqual([101, 102, 103]);
    expect(out.exercises[0]).toMatchObject({
      name: 'Bench Press',
      position: 1,
      target_sets: 4,
      target_reps_low: 6,
      target_reps_high: 8,
    });
  });

  it('surfaces last weight + progression when present, neutral when absent', () => {
    const out = buildDayView({
      dayOfWeek: 1,
      slot,
      muscleGroup: { name: 'Chest', color: '#E54D2E' },
      exerciseById,
      lastWeightByExerciseId: new Map([[101, 75]]),
      flagTypeByExerciseId: new Map([[101, 'add_load']]),
    });
    const bench = out.exercises.find((e) => e.exercise_id === 101);
    const incline = out.exercises.find((e) => e.exercise_id === 102);
    expect(bench).toMatchObject({ last_weight_kg: 75, progression: 'ready_to_increase' });
    expect(incline).toMatchObject({ last_weight_kg: null, progression: 'stable' });
  });

  it('marks archived exercises but still includes them', () => {
    const out = buildDayView({ dayOfWeek: 1, slot, muscleGroup: { name: 'Chest', color: '#fff' }, exerciseById });
    const archived = out.exercises.find((e) => e.exercise_id === 103);
    expect(archived.is_active).toBe(false);
    expect(out.exercises).toHaveLength(3);
  });

  it('flags empty_exercises for a day with no assigned exercises (FR-012)', () => {
    const out = buildDayView({
      dayOfWeek: 4,
      slot: { exercises: [] },
      muscleGroup: { name: 'Legs', color: '#000' },
      exerciseById,
    });
    expect(out.exercises).toEqual([]);
    expect(out.empty_exercises).toBe(true);
  });
});
