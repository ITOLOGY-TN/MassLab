import { describe, it, expect } from 'vitest';
import { progressByGroup } from '../../services/engine/muscleGroupProgress.js';

// Phase 11 (014-phase11-statistics) — pure radar: progress % per muscle group, now vs
// start (D-5). Aligned to the supplied muscleGroups order; ≥ 0; origin (0) when a group
// has insufficient data. No clock/IO/globals.

function seriesOf(...weights) {
  return weights.map((w, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}`,
    working_weight_kg: w,
  }));
}

describe('progressByGroup', () => {
  it('computes progress % per group aligned to the muscleGroups order', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(40, 60)], // chest +50%
      [2, seriesOf(60, 60)], // legs flat
    ]);
    const exerciseMuscleGroup = new Map([
      [1, 'Pectoraux'],
      [2, 'Jambes'],
    ]);
    const muscleGroups = [
      { name: 'Pectoraux', display_color: '#f00' },
      { name: 'Jambes', display_color: '#0f0' },
    ];
    const out = progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups });
    expect(out).toEqual({
      axes: [
        { muscle_group: 'Pectoraux', color: '#f00' },
        { muscle_group: 'Jambes', color: '#0f0' },
      ],
      values: [50, 0],
    });
  });

  it('sums multiple exercises per group before computing the ratio', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(40, 50)],
      [2, seriesOf(60, 90)],
    ]);
    const exerciseMuscleGroup = new Map([
      [1, 'Dos'],
      [2, 'Dos'],
    ]);
    const muscleGroups = [{ name: 'Dos', display_color: '#00f' }];
    const out = progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups });
    // sumStart = 100, sumLatest = 140 -> +40%
    expect(out.values).toEqual([40]);
  });

  it('emits origin (0) when a group has no qualifying (>=2 point) exercise', () => {
    const seriesByExercise = new Map([[1, seriesOf(40)]]); // single point -> not counted
    const exerciseMuscleGroup = new Map([[1, 'Biceps']]);
    const muscleGroups = [{ name: 'Biceps', display_color: '#abc' }];
    const out = progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups });
    expect(out.values).toEqual([0]);
  });

  it('clamps negative progress to 0 and rounds to 2 decimals', () => {
    const seriesByExercise = new Map([
      [1, seriesOf(100, 90)], // regression -> clamp 0
      [2, seriesOf(30, 31)], // +3.333% -> 3.33
    ]);
    const exerciseMuscleGroup = new Map([
      [1, 'A'],
      [2, 'B'],
    ]);
    const muscleGroups = [
      { name: 'A', display_color: '#1' },
      { name: 'B', display_color: '#2' },
    ];
    const out = progressByGroup({ seriesByExercise, exerciseMuscleGroup, muscleGroups });
    expect(out.values).toEqual([0, 3.33]);
  });
});
