import { describe, it, expect } from 'vitest';
import { bmr } from '../../services/engine/bmr.js';

describe('engine.bmr (Mifflin–St Jeor)', () => {
  it('computes male BMR per the published formula', () => {
    // 10×58 + 6.25×173 − 5×29 + 5 = 580 + 1081.25 − 145 + 5 = 1521.25 → 1521
    expect(bmr({ weight_kg: 58, height_cm: 173, age: 29, biological_sex: 'male' })).toBe(1521);
  });

  it('computes female BMR per the published formula', () => {
    // 10×60 + 6.25×165 − 5×30 − 161 = 600 + 1031.25 − 150 − 161 = 1320.25 → 1320
    expect(bmr({ weight_kg: 60, height_cm: 165, age: 30, biological_sex: 'female' })).toBe(1320);
  });

  it('returns an integer', () => {
    const v = bmr({ weight_kg: 70.5, height_cm: 175.5, age: 25, biological_sex: 'male' });
    expect(Number.isInteger(v)).toBe(true);
  });

  it('is pure — same input ⇒ same output', () => {
    const a = bmr({ weight_kg: 75, height_cm: 180, age: 35, biological_sex: 'male' });
    const b = bmr({ weight_kg: 75, height_cm: 180, age: 35, biological_sex: 'male' });
    expect(a).toBe(b);
  });
});
