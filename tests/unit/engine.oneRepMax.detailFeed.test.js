import { describe, it, expect } from 'vitest';
import { oneRepMax } from '../../services/engine/oneRepMax.js';
import { heaviestCompletedSet } from '../../services/engine/exerciseHistory.js';
import { DEFAULTS } from '../../services/engine/constants.js';

// FR-017 / research D-1: the exercise-detail "estimated 1RM" is the engine's
// primary_estimate_kg (4-formula blend), fed by the heaviest completed set —
// NOT an Epley-only path and NOT a read of one_rep_max_records.
describe('engine 1RM detail feed (FR-017, D-1)', () => {
  const sessionSets = [
    { weight_kg: 60, reps: 10, completed: true },
    { weight_kg: 80, reps: 5, completed: true },
    { weight_kg: 100, reps: 1, completed: false }, // not completed → excluded
  ];

  it('feeds the heaviest completed set into oneRepMax and surfaces primary_estimate_kg', () => {
    const top = heaviestCompletedSet(sessionSets);
    expect(top.weight_kg).toBe(80);

    const expected = oneRepMax({
      weight_kg: top.weight_kg,
      reps: top.reps,
      constants: DEFAULTS,
    }).primary_estimate_kg;

    // The detail estimate is the blended primary estimate, not Epley alone.
    const epleyOnly = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS }).epley_kg;
    expect(expected).not.toBeCloseTo(epleyOnly, 1);
    expect(expected).toBeGreaterThan(80);
  });
});
