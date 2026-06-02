import { describe, it, expect } from 'vitest';
import { recommendWorkingLoad } from '../../services/engine/loadRecommendation.js';
import { DEFAULTS } from '../../services/engine/constants.js';

describe('engine.loadRecommendation — recommendWorkingLoad (FR-018, D-3)', () => {
  it('returns null when there is no last weight', () => {
    expect(recommendWorkingLoad({ lastWeightKg: null })).toBeNull();
    expect(recommendWorkingLoad({ lastWeightKg: 0 })).toBeNull();
  });

  it('add_load → last weight + the flag\'s snapshotted delta', () => {
    const out = recommendWorkingLoad({
      lastWeightKg: 70,
      activeFlag: { flag_type: 'add_load', suggested_adjustment: { delta_kg: 2.5 } },
    });
    expect(out).toBe(72.5);
  });

  it('add_load with no snapshot falls back to the upper-segment increment', () => {
    const out = recommendWorkingLoad({
      lastWeightKg: 60,
      activeFlag: { flag_type: 'add_load' },
      bodySegment: 'upper',
      constants: DEFAULTS,
    });
    expect(out).toBe(60 + DEFAULTS.load_increment_upper_kg); // 62.5
  });

  it('add_load with no snapshot uses the lower-segment increment for legs', () => {
    const out = recommendWorkingLoad({
      lastWeightKg: 100,
      activeFlag: { flag_type: 'add_load' },
      bodySegment: 'lower',
      constants: DEFAULTS,
    });
    expect(out).toBe(100 + DEFAULTS.load_increment_lower_kg); // 105
  });

  it.each(['maintain', 'stagnation', 'regression', 'deload_suggested'])(
    '%s → holds the last weight',
    (flag_type) => {
      expect(recommendWorkingLoad({ lastWeightKg: 80, activeFlag: { flag_type } })).toBe(80);
    },
  );

  it('no active flag → holds the last weight', () => {
    expect(recommendWorkingLoad({ lastWeightKg: 82.5, activeFlag: null })).toBe(82.5);
  });
});
