import { describe, it, expect } from 'vitest';
import { totalVolume, topPerformance } from '../../services/engine/sessionTotals.js';

const sets = [
  { exercise_id: 1, weight_kg: 70, reps: 8, completed: true },
  { exercise_id: 1, weight_kg: 80, reps: 5, completed: true },
  { exercise_id: 1, weight_kg: 90, reps: 3, completed: false }, // incomplete → ignored
  { exercise_id: 2, weight_kg: 0, reps: 0, completed: true }, // invalid → ignored
];

describe('totalVolume', () => {
  it('sums weight × reps over completed sets only', () => {
    expect(totalVolume(sets)).toBe(70 * 8 + 80 * 5); // 560 + 400 = 960
  });
  it('returns 0 for no completed sets', () => {
    expect(totalVolume([{ weight_kg: 50, reps: 5, completed: false }])).toBe(0);
    expect(totalVolume([])).toBe(0);
  });
});

describe('topPerformance', () => {
  it('returns the heaviest completed set', () => {
    expect(topPerformance(sets)).toMatchObject({ weight_kg: 80, reps: 5 });
  });
  it('breaks ties on weight by higher reps', () => {
    const tie = [
      { weight_kg: 100, reps: 3, completed: true },
      { weight_kg: 100, reps: 5, completed: true },
    ];
    expect(topPerformance(tie)).toMatchObject({ weight_kg: 100, reps: 5 });
  });
  it('returns null when no completed sets', () => {
    expect(topPerformance([{ weight_kg: 50, reps: 5, completed: false }])).toBeNull();
  });
});
