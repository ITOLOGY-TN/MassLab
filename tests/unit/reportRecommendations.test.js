import { describe, it, expect } from 'vitest';

// Phase 11 (014-phase11-statistics) US4 — deterministic, rule-based report
// recommendations (D-11, FR-020/SC-009). NO AI, NO free-form text: every line is
// produced from the injected French `strings` map. Pure: no clock/random/globals.
import {
  buildRecommendations,
  default as FRENCH_STRINGS,
} from '../../services/engine/reportRecommendations.js';

const T = {
  sleepLowHours: 6,
  stressHigh: 7,
};

describe('reportRecommendations — buildRecommendations', () => {
  it('exports a French strings map (default export) with every template', () => {
    expect(FRENCH_STRINGS).toBeTypeOf('object');
    expect(FRENCH_STRINGS.readyToAddLoad).toBeTypeOf('function');
    expect(FRENCH_STRINGS.stagnation).toBeTypeOf('function');
    expect(FRENCH_STRINGS.increaseCalories).toBeTypeOf('function');
    expect(FRENCH_STRINGS.deload).toBeTypeOf('string');
    expect(FRENCH_STRINGS.recovery).toBeTypeOf('string');
    expect(FRENCH_STRINGS.logMoreData).toBeTypeOf('string');
  });

  it('fires each rule in the fixed order with the templated messages', () => {
    const out = buildRecommendations(
      {
        addLoad: [{ exercise: 'Développé couché' }, { exercise: 'Squat' }],
        stagnationGroups: ['Dos'],
        regressionOrDeload: true,
        monthAvgCalories: 2200,
        targetKcal: 2800,
        avgSleepHours: 5.2,
        avgStress: 4,
        sleepLowHours: T.sleepLowHours,
        stressHigh: T.stressHigh,
      },
      { strings: FRENCH_STRINGS },
    );

    expect(out.map((r) => r.key)).toEqual([
      'ready_to_add_load',
      'ready_to_add_load',
      'stagnation',
      'deload',
      'increase_calories',
      'recovery',
    ]);

    // ready_to_add_load: one per addLoad entry, with exercise context + message.
    expect(out[0]).toEqual({
      key: 'ready_to_add_load',
      message: FRENCH_STRINGS.readyToAddLoad('Développé couché'),
      context: { exercise: 'Développé couché' },
    });
    expect(out[1].context).toEqual({ exercise: 'Squat' });

    // stagnation: one per group.
    expect(out[2]).toEqual({
      key: 'stagnation',
      message: FRENCH_STRINGS.stagnation('Dos'),
      context: { group: 'Dos' },
    });

    // deload: no context.
    expect(out[3]).toEqual({ key: 'deload', message: FRENCH_STRINGS.deload });

    // increase_calories: target context.
    expect(out[4]).toEqual({
      key: 'increase_calories',
      message: FRENCH_STRINGS.increaseCalories(2800),
      context: { target: 2800 },
    });

    // recovery: no context.
    expect(out[5]).toEqual({ key: 'recovery', message: FRENCH_STRINGS.recovery });
  });

  it('triggers recovery on high stress alone (avgStress >= stressHigh)', () => {
    const out = buildRecommendations(
      {
        addLoad: [],
        stagnationGroups: [],
        regressionOrDeload: false,
        monthAvgCalories: null,
        targetKcal: null,
        avgSleepHours: 8,
        avgStress: 8,
        sleepLowHours: T.sleepLowHours,
        stressHigh: T.stressHigh,
      },
      { strings: FRENCH_STRINGS },
    );
    expect(out.map((r) => r.key)).toEqual(['recovery']);
  });

  it('does NOT fire increase_calories when calories or target is null, or when above target', () => {
    const base = {
      addLoad: [],
      stagnationGroups: [],
      regressionOrDeload: false,
      avgSleepHours: 8,
      avgStress: 3,
      sleepLowHours: T.sleepLowHours,
      stressHigh: T.stressHigh,
    };
    expect(
      buildRecommendations(
        { ...base, monthAvgCalories: null, targetKcal: 2800 },
        { strings: FRENCH_STRINGS },
      ).some((r) => r.key === 'increase_calories'),
    ).toBe(false);
    expect(
      buildRecommendations(
        { ...base, monthAvgCalories: 2200, targetKcal: null },
        { strings: FRENCH_STRINGS },
      ).some((r) => r.key === 'increase_calories'),
    ).toBe(false);
    expect(
      buildRecommendations(
        { ...base, monthAvgCalories: 3000, targetKcal: 2800 },
        { strings: FRENCH_STRINGS },
      ).some((r) => r.key === 'increase_calories'),
    ).toBe(false);
  });

  it('emits a single log_more_data line when no rule fires', () => {
    const out = buildRecommendations(
      {
        addLoad: [],
        stagnationGroups: [],
        regressionOrDeload: false,
        monthAvgCalories: null,
        targetKcal: null,
        avgSleepHours: null,
        avgStress: null,
        sleepLowHours: T.sleepLowHours,
        stressHigh: T.stressHigh,
      },
      { strings: FRENCH_STRINGS },
    );
    expect(out).toEqual([{ key: 'log_more_data', message: FRENCH_STRINGS.logMoreData }]);
  });

  it('defaults to the French strings map when none injected (no free-form text)', () => {
    const out = buildRecommendations({
      addLoad: [{ exercise: 'Curl' }],
      stagnationGroups: [],
      regressionOrDeload: false,
      monthAvgCalories: null,
      targetKcal: null,
      avgSleepHours: null,
      avgStress: null,
      sleepLowHours: T.sleepLowHours,
      stressHigh: T.stressHigh,
    });
    // Every message must be exactly one of the templated strings — nothing else.
    expect(out).toEqual([
      {
        key: 'ready_to_add_load',
        message: FRENCH_STRINGS.readyToAddLoad('Curl'),
        context: { exercise: 'Curl' },
      },
    ]);
  });

  it('is pure — same inputs give identical output across calls', () => {
    const signals = {
      addLoad: [{ exercise: 'Squat' }],
      stagnationGroups: ['Jambes'],
      regressionOrDeload: false,
      monthAvgCalories: 2000,
      targetKcal: 2500,
      avgSleepHours: 7,
      avgStress: 2,
      sleepLowHours: T.sleepLowHours,
      stressHigh: T.stressHigh,
    };
    const a = buildRecommendations(signals, { strings: FRENCH_STRINGS });
    const b = buildRecommendations(signals, { strings: FRENCH_STRINGS });
    expect(a).toEqual(b);
  });
});
