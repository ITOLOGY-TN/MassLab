import { describe, it, expect } from 'vitest';
import { resolveConstants } from '../../services/engine/resolveConstants.js';
import { DEFAULTS } from '../../services/engine/constants.js';

describe('resolveConstants', () => {
  it('returns the defaults verbatim when no override is given', () => {
    const out = resolveConstants();
    expect(out.bulk_surplus_kcal).toBe(DEFAULTS.bulk_surplus_kcal);
    expect(out.activity_factors.moderately_active).toBe(1.55);
    expect(out.default_body_fat_pct.ectomorph).toBe(0.12);
  });

  it('returns the defaults verbatim for an empty override object', () => {
    const out = resolveConstants({});
    expect(out.protein_g_per_kg_lbm).toBe(DEFAULTS.protein_g_per_kg_lbm);
  });

  it('shallow-merges scalar overrides', () => {
    const out = resolveConstants({ bulk_surplus_kcal: 350, cut_deficit_kcal: 350 });
    expect(out.bulk_surplus_kcal).toBe(350);
    expect(out.cut_deficit_kcal).toBe(350);
    expect(out.protein_g_per_kg_lbm).toBe(DEFAULTS.protein_g_per_kg_lbm);
  });

  it('deep-merges object-valued overrides (activity_factors)', () => {
    const out = resolveConstants({ activity_factors: { sedentary: 1.25 } });
    expect(out.activity_factors.sedentary).toBe(1.25);
    expect(out.activity_factors.moderately_active).toBe(1.55);
  });

  it('drops unknown keys silently', () => {
    const out = resolveConstants({ totally_unknown_key: 999, bulk_surplus_kcal: 350 });
    expect(out.bulk_surplus_kcal).toBe(350);
    expect(out.totally_unknown_key).toBeUndefined();
  });

  it('returns a frozen object', () => {
    const out = resolveConstants({ bulk_surplus_kcal: 350 });
    expect(Object.isFrozen(out)).toBe(true);
    expect(() => {
      out.bulk_surplus_kcal = 999;
    }).toThrow();
  });
});
