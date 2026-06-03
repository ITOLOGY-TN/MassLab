// Phase 2 US4 (T054): kg <-> lbs round-trip drift bound (SC-006).
// Phase 6 (T043, FR-028): length (cm/in) display-only conversion helpers.
import { describe, it, expect } from 'vitest';
import {
  kgToLbs,
  lbsToKg,
  formatWeight,
  cmToIn,
  formatLength,
  displayLength,
  displayWeight,
  lengthSuffix,
  weightSuffix,
} from '../../frontend/src/lib/units.js';

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

  // Phase 6 (T043, FR-028) — length display-only conversion.
  it('cmToIn converts centimetres to inches', () => {
    expect(cmToIn(2.54)).toBeCloseTo(1.0, 5);
    expect(cmToIn(100)).toBeCloseTo(39.4, 1);
    expect(cmToIn(null)).toBeNull();
  });

  it('formatLength shows cm by default and in when the unit is lbs', () => {
    expect(formatLength(38, 'kg')).toBe('38 cm');
    expect(formatLength(2.54, 'lbs')).toBe('1 in');
    expect(formatLength(null, 'kg')).toBe('—');
  });

  it('suffix helpers track a single kg/lbs preference', () => {
    expect(weightSuffix('kg')).toBe('kg');
    expect(weightSuffix('lbs')).toBe('lbs');
    expect(lengthSuffix('kg')).toBe('cm');
    expect(lengthSuffix('lbs')).toBe('in');
  });

  it('display helpers preserve the sign of a delta (colour-coding stays correct)', () => {
    // A negative cm delta stays negative after conversion to inches.
    expect(displayLength(-2.54, 'lbs')).toBeCloseTo(-1.0, 5);
    expect(displayLength(-2, 'kg')).toBe(-2);
    expect(displayWeight(-1, 'lbs')).toBeLessThan(0);
  });
});
