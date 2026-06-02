import { describe, it, expect } from 'vitest';
import { tdee } from '../../services/engine/tdee.js';
import { DEFAULTS } from '../../services/engine/constants.js';

describe('engine.tdee', () => {
  it.each([
    ['sedentary', 1.2],
    ['lightly_active', 1.375],
    ['moderately_active', 1.55],
    ['very_active', 1.725],
    ['extremely_active', 1.9],
  ])('multiplies BMR by the documented factor for %s', (level, factor) => {
    const bmrKcal = 2000;
    expect(tdee({ bmr_kcal: bmrKcal, activity_level: level, constants: DEFAULTS })).toBe(
      Math.round(bmrKcal * factor),
    );
  });

  it('throws on an unknown activity level', () => {
    expect(() => tdee({ bmr_kcal: 2000, activity_level: 'olympian', constants: DEFAULTS })).toThrow(
      /unknown activity_level/,
    );
  });

  it('returns an integer', () => {
    const v = tdee({ bmr_kcal: 1521, activity_level: 'moderately_active', constants: DEFAULTS });
    expect(Number.isInteger(v)).toBe(true);
  });
});
