import { describe, it, expect } from 'vitest';
import { oneRepMax } from '../../services/engine/oneRepMax.js';
import { DEFAULTS } from '../../services/engine/constants.js';

describe('engine.oneRepMax', () => {
  it('reps = 1 → primary_estimate equals input weight', () => {
    const out = oneRepMax({ weight_kg: 80, reps: 1, constants: DEFAULTS });
    expect(out.primary_estimate_kg).toBeCloseTo(80, 0);
    expect(out.epley_kg).toBeCloseTo(80, 1);
    expect(out.brzycki_kg).toBeCloseTo(80, 1);
    expect(out.lander_kg).toBeCloseTo(80, 1);
    expect(out.lombardi_kg).toBeCloseTo(80, 1);
    expect(out.reduced_confidence).toBe(false);
  });

  it('returns four formula values + their average for reps > 1', () => {
    const out = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS });
    // Epley: 80 × (1 + 5/30) = 93.33
    expect(out.epley_kg).toBeCloseTo(93.33, 1);
    // Brzycki: 80 × 36 / (37 − 5) = 90
    expect(out.brzycki_kg).toBeCloseTo(90, 1);
    // Lander: 100 × 80 / (101.3 − 2.67123 × 5) = 100 × 80 / 87.94 ≈ 90.97
    expect(out.lander_kg).toBeCloseTo(90.97, 1);
    // Lombardi: 80 × 5^0.10 = 80 × 1.1746 ≈ 93.97
    expect(out.lombardi_kg).toBeCloseTo(93.97, 1);

    const avg = (out.epley_kg + out.brzycki_kg + out.lander_kg + out.lombardi_kg) / 4;
    expect(out.primary_estimate_kg).toBeCloseTo(avg, 1);
  });

  it('primary_estimate lies within [min, max] of the four formula values (SC-005)', () => {
    const out = oneRepMax({ weight_kg: 100, reps: 8, constants: DEFAULTS });
    const values = [out.epley_kg, out.brzycki_kg, out.lander_kg, out.lombardi_kg];
    const min = Math.min(...values);
    const max = Math.max(...values);
    expect(out.primary_estimate_kg).toBeGreaterThanOrEqual(min);
    expect(out.primary_estimate_kg).toBeLessThanOrEqual(max);
  });

  it('reps > 10 sets reduced_confidence = true', () => {
    const out = oneRepMax({ weight_kg: 60, reps: 12, constants: DEFAULTS });
    expect(out.reduced_confidence).toBe(true);
  });

  it('reps ≤ 10 sets reduced_confidence = false', () => {
    const out = oneRepMax({ weight_kg: 80, reps: 10, constants: DEFAULTS });
    expect(out.reduced_confidence).toBe(false);
  });

  it('produces six rows in the percentage table (60/70/75/80/85/90)', () => {
    const out = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS });
    expect(out.percentage_table.map((r) => r.pct)).toEqual([60, 70, 75, 80, 85, 90]);
    for (const row of out.percentage_table) {
      expect(row.load_kg).toBeCloseTo((row.pct / 100) * out.primary_estimate_kg, 1);
      expect(row.reps_low).toBeGreaterThan(0);
      expect(row.reps_high).toBeGreaterThanOrEqual(row.reps_low);
    }
  });

  it('percentage table load increases monotonically as pct increases', () => {
    const out = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS });
    for (let i = 1; i < out.percentage_table.length; i++) {
      expect(out.percentage_table[i].load_kg).toBeGreaterThan(out.percentage_table[i - 1].load_kg);
    }
  });

  it('is deterministic across calls', () => {
    const a = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS });
    const b = oneRepMax({ weight_kg: 80, reps: 5, constants: DEFAULTS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
