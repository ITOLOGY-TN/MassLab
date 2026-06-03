import { describe, it, expect } from 'vitest';
import { entryMacros, dayTotals, progress } from '../../services/engine/nutritionMath.js';

describe('entryMacros', () => {
  const food = {
    kcal_per_100g: 165,
    protein_per_100g: 31,
    carbs_per_100g: 0,
    fat_per_100g: 3.6,
  };

  it('scales per-100g reference macros by quantityG / 100', () => {
    expect(entryMacros({ food, quantityG: 80 })).toEqual({
      kcal: 132,
      protein_g: 24.8,
      carbs_g: 0,
      fat_g: 2.88,
    });
  });

  it('returns the reference macros unchanged at 100 g', () => {
    expect(entryMacros({ food, quantityG: 100 })).toEqual({
      kcal: 165,
      protein_g: 31,
      carbs_g: 0,
      fat_g: 3.6,
    });
  });

  it('rounds each macro to 2 decimals', () => {
    const f = {
      kcal_per_100g: 333,
      protein_per_100g: 10,
      carbs_per_100g: 7,
      fat_per_100g: 1,
    };
    expect(entryMacros({ food: f, quantityG: 33 })).toEqual({
      kcal: 109.89,
      protein_g: 3.3,
      carbs_g: 2.31,
      fat_g: 0.33,
    });
  });

  it('treats missing reference macros as zero', () => {
    expect(entryMacros({ food: { kcal_per_100g: 200 }, quantityG: 50 })).toEqual({
      kcal: 100,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
    });
  });
});

describe('dayTotals', () => {
  it('sums the snapshot fields over entries', () => {
    const entries = [
      { kcal: 300, protein_g: 10, carbs_g: 54, fat_g: 6 },
      { kcal: 132, protein_g: 24.8, carbs_g: 0, fat_g: 2.88 },
    ];
    expect(dayTotals(entries)).toEqual({
      kcal: 432,
      protein_g: 34.8,
      carbs_g: 54,
      fat_g: 8.88,
    });
  });

  it('returns all zeros for an empty list', () => {
    expect(dayTotals([])).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });

  it('defaults missing entries argument to all zeros', () => {
    expect(dayTotals()).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
  });
});

describe('progress', () => {
  it('computes value/target/pct/state per macro', () => {
    const totals = { kcal: 300, protein_g: 10, carbs_g: 54, fat_g: 6 };
    const targets = { kcal: 3300, protein_g: 175, carbs_g: 430, fat_g: 90 };
    const out = progress(totals, targets);
    expect(out.kcal).toEqual({ value: 300, target: 3300, pct: 300 / 3300, state: 'under' });
    expect(out.protein_g).toEqual({ value: 10, target: 175, pct: 10 / 175, state: 'under' });
    expect(out.carbs_g).toEqual({ value: 54, target: 430, pct: 54 / 430, state: 'under' });
    expect(out.fat_g).toEqual({ value: 6, target: 90, pct: 6 / 90, state: 'under' });
  });

  it('flags state over when value exceeds target', () => {
    const out = progress({ kcal: 3400 }, { kcal: 3300 });
    expect(out.kcal.state).toBe('over');
    expect(out.kcal.pct).toBeCloseTo(3400 / 3300);
  });

  it('flags state at when value is within epsilon of target', () => {
    const out = progress({ kcal: 3300 }, { kcal: 3300 });
    expect(out.kcal.state).toBe('at');
    expect(out.kcal.pct).toBe(1);
  });

  it('is null-safe when a target is null', () => {
    const out = progress({ kcal: 300 }, { kcal: null });
    expect(out.kcal).toEqual({ value: 300, target: null, pct: null, state: 'under' });
  });

  it('treats a falsy (zero) target as pct 0', () => {
    const out = progress({ kcal: 300 }, { kcal: 0 });
    expect(out.kcal.pct).toBe(0);
  });

  it('covers all four macros even when totals are missing', () => {
    const out = progress({}, { kcal: 3300, protein_g: 175, carbs_g: 430, fat_g: 90 });
    expect(out.kcal).toEqual({ value: 0, target: 3300, pct: 0, state: 'under' });
    expect(out.protein_g.value).toBe(0);
    expect(out.carbs_g.value).toBe(0);
    expect(out.fat_g.value).toBe(0);
  });
});
