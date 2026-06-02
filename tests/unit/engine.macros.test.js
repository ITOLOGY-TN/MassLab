import { describe, it, expect } from 'vitest';
import { macros } from '../../services/engine/macros.js';
import { DEFAULTS } from '../../services/engine/constants.js';

const baseProfile = {
  weight_kg: 58,
  morphotype: 'ectomorph',
  goal: 'bulk',
  tdee_kcal: 2358,
};

describe('engine.macros', () => {
  // Phase 2 US4 (T050) — calorie-only override path (FR-017a) and per-macro
  // override (FR-017b).
  it('FR-017a: a calorie override re-runs the macro split on the new total', () => {
    const out = macros({
      ...baseProfile,
      goal: 'bulk',
      constants: DEFAULTS,
      override: { daily_kcal: 3500 },
    });
    expect(out.daily_kcal).toBe(3500);
    // Carbs absorb the difference between override total and protein/fat budgets.
    expect(out.carbs_g).toBeGreaterThan(0);
    expect(out.source.daily_kcal).toBe('override');
    expect(out.source.daily_carbs_g).toBe('auto-derived');
  });

  // Pass 3 H-1: protein is independent of daily_kcal (protein_g_per_kg_lbm × LBM),
  // so a calorie-only override must leave the protein source labelled `engine`.
  // Fat does depend on daily_kcal and is correctly tagged `auto-derived`.
  it('source.daily_protein_g stays "engine" under a calorie-only override', () => {
    const baseline = macros({ ...baseProfile, goal: 'bulk', constants: DEFAULTS });
    const overridden = macros({
      ...baseProfile,
      goal: 'bulk',
      constants: DEFAULTS,
      override: { daily_kcal: 3500 },
    });
    expect(overridden.protein_g).toBe(baseline.protein_g);
    expect(overridden.source.daily_protein_g).toBe('engine');
    expect(overridden.source.daily_fat_g).toBe('auto-derived');
  });

  it('FR-017b: a per-macro override pins that macro and the others auto-derive', () => {
    const out = macros({
      ...baseProfile,
      goal: 'bulk',
      constants: DEFAULTS,
      override: { daily_protein_g: 250 },
    });
    expect(out.protein_g).toBe(250);
    expect(out.source.daily_protein_g).toBe('override');
    expect(out.source.daily_carbs_g).toBe('auto-derived');
  });

  it('clearing all overrides returns engine values', () => {
    const out = macros({ ...baseProfile, goal: 'bulk', constants: DEFAULTS, override: {} });
    expect(out.source.daily_kcal).toBe('engine');
    expect(out.source.daily_protein_g).toBe('engine');
  });

  it('returns daily_kcal = tdee + bulk_surplus on goal=bulk', () => {
    const out = macros({ ...baseProfile, goal: 'bulk', constants: DEFAULTS });
    expect(out.daily_kcal).toBe(2358 + DEFAULTS.bulk_surplus_kcal);
  });

  it('returns daily_kcal = tdee − cut_deficit on goal=cut', () => {
    const out = macros({ ...baseProfile, goal: 'cut', constants: DEFAULTS });
    expect(out.daily_kcal).toBe(2358 - DEFAULTS.cut_deficit_kcal);
  });

  it('returns daily_kcal = tdee on goal=maintain', () => {
    const out = macros({ ...baseProfile, goal: 'maintain', constants: DEFAULTS });
    expect(out.daily_kcal).toBe(2358);
  });

  it('protein floor uses LBM × protein_g_per_kg_lbm when LBM provided', () => {
    const out = macros({ ...baseProfile, lean_body_mass_kg: 50, constants: DEFAULTS });
    expect(out.protein_g).toBeGreaterThanOrEqual(Math.round(50 * DEFAULTS.protein_g_per_kg_lbm));
  });

  it('falls back to weight × (1 − default_body_fat_pct[morphotype]) for LBM when omitted', () => {
    const out = macros({ ...baseProfile, constants: DEFAULTS });
    const expectedLbm = 58 * (1 - DEFAULTS.default_body_fat_pct.ectomorph);
    expect(out.protein_g).toBeGreaterThanOrEqual(
      Math.round(expectedLbm * DEFAULTS.protein_g_per_kg_lbm),
    );
  });

  it('fat covers at least 25 % of total calories', () => {
    const out = macros({ ...baseProfile, constants: DEFAULTS });
    expect(out.fat_g * 9).toBeGreaterThanOrEqual(out.daily_kcal * DEFAULTS.fat_floor_pct);
  });

  it('endomorph carbs are skewed lower than mesomorph at fixed LBM and kcal', () => {
    // The hard 25 % fat floor prevents ectomorph fat from dropping below floor;
    // the morphotype carb differentiation comes from the endomorph fat skew up,
    // which reduces carbs. Mesomorph and ectomorph share the floor.
    const endo = macros({
      ...baseProfile,
      morphotype: 'endomorph',
      lean_body_mass_kg: 50,
      constants: DEFAULTS,
    });
    const meso = macros({
      ...baseProfile,
      morphotype: 'mesomorph',
      lean_body_mass_kg: 50,
      constants: DEFAULTS,
    });
    expect(endo.carbs_g).toBeLessThan(meso.carbs_g);
  });

  it('ectomorph carbs reach ≥ 50 % of total kcal at the seeded profile (FR-005 spirit)', () => {
    const ecto = macros({ ...baseProfile, morphotype: 'ectomorph', constants: DEFAULTS });
    const carbsPct = (ecto.carbs_g * 4) / ecto.daily_kcal;
    expect(carbsPct).toBeGreaterThanOrEqual(0.5);
  });

  it('endomorph fat is skewed higher than mesomorph at fixed LBM and kcal', () => {
    const endo = macros({
      ...baseProfile,
      morphotype: 'endomorph',
      lean_body_mass_kg: 50,
      constants: DEFAULTS,
    });
    const meso = macros({
      ...baseProfile,
      morphotype: 'mesomorph',
      lean_body_mass_kg: 50,
      constants: DEFAULTS,
    });
    expect(endo.fat_g).toBeGreaterThan(meso.fat_g);
  });

  it('macro grams sum within ±2 % of daily kcal', () => {
    const out = macros({ ...baseProfile, constants: DEFAULTS });
    const fromMacros = out.protein_g * 4 + out.carbs_g * 4 + out.fat_g * 9;
    const drift = Math.abs(fromMacros - out.daily_kcal) / out.daily_kcal;
    expect(drift).toBeLessThanOrEqual(0.02);
  });

  it('is deterministic across calls', () => {
    const a = macros({ ...baseProfile, constants: DEFAULTS });
    const b = macros({ ...baseProfile, constants: DEFAULTS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
