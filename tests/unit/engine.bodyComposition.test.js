import { describe, it, expect } from 'vitest';
import { bodyComposition } from '../../services/engine/bodyComposition.js';

describe('engine.bodyComposition', () => {
  it('uses U.S. Navy formula when waist + neck (and hip for female) are present', () => {
    const out = bodyComposition({
      weight_kg: 80,
      height_cm: 178,
      age: 30,
      biological_sex: 'male',
      waist_cm: 85,
      neck_cm: 38,
    });
    expect(out.method).toBe('us_navy');
    expect(out.body_fat_pct).toBeGreaterThan(5);
    expect(out.body_fat_pct).toBeLessThan(40);
    expect(out.lean_body_mass_kg).toBeCloseTo(80 * (1 - out.body_fat_pct / 100), 1);
  });

  it('uses BMI-based fallback when neck is missing', () => {
    const out = bodyComposition({
      weight_kg: 70,
      height_cm: 170,
      age: 30,
      biological_sex: 'male',
      waist_cm: 80,
    });
    expect(out.method).toBe('bmi_fallback');
    expect(out.body_fat_pct).toBeGreaterThan(5);
    expect(out.body_fat_pct).toBeLessThan(50);
  });

  it('uses BMI-based fallback when waist is missing', () => {
    const out = bodyComposition({
      weight_kg: 70,
      height_cm: 170,
      age: 30,
      biological_sex: 'male',
      neck_cm: 38,
    });
    expect(out.method).toBe('bmi_fallback');
  });

  it('female multi-measurement requires hip; falls back to BMI without it', () => {
    const out = bodyComposition({
      weight_kg: 60,
      height_cm: 165,
      age: 28,
      biological_sex: 'female',
      waist_cm: 70,
      neck_cm: 32,
    });
    expect(out.method).toBe('bmi_fallback');
  });

  it('female multi-measurement uses U.S. Navy when hip is provided', () => {
    const out = bodyComposition({
      weight_kg: 60,
      height_cm: 165,
      age: 28,
      biological_sex: 'female',
      waist_cm: 70,
      neck_cm: 32,
      hip_cm: 95,
    });
    expect(out.method).toBe('us_navy');
  });

  it('lean_body_mass_kg = weight_kg × (1 − body_fat_pct/100)', () => {
    const out = bodyComposition({
      weight_kg: 80,
      height_cm: 178,
      age: 30,
      biological_sex: 'male',
      waist_cm: 85,
      neck_cm: 38,
    });
    expect(out.lean_body_mass_kg).toBeCloseTo(80 * (1 - out.body_fat_pct / 100), 1);
  });

  it('is deterministic across calls', () => {
    const a = bodyComposition({
      weight_kg: 80,
      height_cm: 178,
      age: 30,
      biological_sex: 'male',
      waist_cm: 85,
      neck_cm: 38,
    });
    const b = bodyComposition({
      weight_kg: 80,
      height_cm: 178,
      age: 30,
      biological_sex: 'male',
      waist_cm: 85,
      neck_cm: 38,
    });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
