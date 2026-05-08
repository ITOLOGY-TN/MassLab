// Phase 2 US4 (T054): kg <-> lbs round-trip drift bound (SC-006).
import { describe, it, expect } from 'vitest';
import { kgToLbs, lbsToKg, formatWeight } from '../../frontend/src/lib/units.js';

describe('lib/units', () => {
  it('round-trip kg → lbs → kg drift ≤ 0.05 kg across plausible range', () => {
    for (let kg = 30; kg <= 250; kg += 0.5) {
      const back = lbsToKg(kgToLbs(kg));
      expect(Math.abs(back - kg)).toBeLessThanOrEqual(0.05);
    }
  });

  it('formatWeight returns kg by default', () => {
    expect(formatWeight(58.4, 'kg')).toMatch(/58\.4 kg/);
  });

  it('formatWeight converts to lbs when requested', () => {
    expect(formatWeight(58, 'lbs')).toMatch(/lbs$/);
  });

  it('null/NaN inputs are rendered as a placeholder', () => {
    expect(formatWeight(null, 'kg')).toBe('—');
    expect(formatWeight(Number.NaN, 'kg')).toBe('—');
  });
});
