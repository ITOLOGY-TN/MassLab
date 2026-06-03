import { describe, it, expect } from 'vitest';
import {
  overviewStatus,
  deloadMuscleGroups,
  STATUS,
} from '../../services/loadTracking/statusMap.js';

describe('overviewStatus', () => {
  it('privileges the exercise own flag', () => {
    expect(overviewStatus({ exerciseFlagType: 'add_load' })).toBe(STATUS.READY);
    expect(overviewStatus({ exerciseFlagType: 'regression' })).toBe(STATUS.REGRESSING);
  });

  it('falls back to muscle-group stagnation only without an actionable own flag', () => {
    expect(overviewStatus({ exerciseFlagType: null, muscleGroupFlagType: 'stagnation' })).toBe(
      STATUS.STAGNATION,
    );
    // own add_load wins over muscle-group stagnation
    expect(
      overviewStatus({ exerciseFlagType: 'add_load', muscleGroupFlagType: 'stagnation' }),
    ).toBe(STATUS.READY);
  });

  it('defaults to maintain', () => {
    expect(overviewStatus({})).toBe(STATUS.MAINTAIN);
    expect(overviewStatus({ exerciseFlagType: 'maintain' })).toBe(STATUS.MAINTAIN);
    // deload is NOT one of the four badges
    expect(overviewStatus({ muscleGroupFlagType: 'deload_suggested' })).toBe(STATUS.MAINTAIN);
  });
});

describe('deloadMuscleGroups', () => {
  it('lists muscle-group scope refs with an active deload flag', () => {
    const flags = [
      { scope_kind: 'muscle_group', flag_type: 'deload_suggested', scope_ref: 'Legs Quads' },
      { scope_kind: 'muscle_group', flag_type: 'stagnation', scope_ref: 'Back' },
      { scope_kind: 'exercise', flag_type: 'add_load', scope_ref: '101' },
    ];
    expect(deloadMuscleGroups(flags)).toEqual(['Legs Quads']);
  });
});
