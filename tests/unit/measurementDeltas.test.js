import { describe, it, expect } from 'vitest';
import { monthlyLatest, monthOverMonthDeltas } from '../../services/engine/measurementDeltas.js';

describe('measurementDeltas.monthlyLatest', () => {
  it('picks, per field, the value from the latest measured_on in the month (D-5)', () => {
    const entries = [
      { measured_on: '2026-05-03', arm_cm: 38.0, waist_cm: 80.0 },
      { measured_on: '2026-05-20', arm_cm: 38.5, waist_cm: 79.0 },
      { measured_on: '2026-05-12', arm_cm: 38.2, waist_cm: 79.5 },
    ];
    const monthly = monthlyLatest(entries);
    expect(monthly['2026-05'].arm_cm).toBe(38.5);
    expect(monthly['2026-05'].waist_cm).toBe(79.0);
  });

  it('falls back per field to the latest non-null value when the most recent entry is null for that field', () => {
    const entries = [
      { measured_on: '2026-05-05', arm_cm: 37.5, chest_cm: 100.0 },
      // most recent date has a null chest → chest must fall back to the 05-05 value
      { measured_on: '2026-05-25', arm_cm: 38.0, chest_cm: null },
    ];
    const monthly = monthlyLatest(entries);
    expect(monthly['2026-05'].arm_cm).toBe(38.0);
    expect(monthly['2026-05'].chest_cm).toBe(100.0);
  });

  it('omits a field entirely when it is null/absent across the whole month', () => {
    const entries = [
      { measured_on: '2026-05-05', arm_cm: 37.5 },
      { measured_on: '2026-05-25', arm_cm: 38.0 },
    ];
    const monthly = monthlyLatest(entries);
    expect(monthly['2026-05'].arm_cm).toBe(38.0);
    expect('waist_cm' in monthly['2026-05']).toBe(false);
  });

  it('buckets entries into the correct YYYY-MM keys', () => {
    const entries = [
      { measured_on: '2026-04-30', weight_kg: 58.0 },
      { measured_on: '2026-05-01', weight_kg: 59.0 },
      { measured_on: '2026-06-15', weight_kg: 61.0 },
    ];
    const monthly = monthlyLatest(entries);
    expect(Object.keys(monthly).sort()).toEqual(['2026-04', '2026-05', '2026-06']);
    expect(monthly['2026-04'].weight_kg).toBe(58.0);
    expect(monthly['2026-05'].weight_kg).toBe(59.0);
    expect(monthly['2026-06'].weight_kg).toBe(61.0);
  });

  it('handles all eight tracked fields', () => {
    const entries = [
      {
        measured_on: '2026-05-10',
        weight_kg: 60,
        arm_cm: 38,
        chest_cm: 100,
        thigh_cm: 55,
        shoulder_cm: 120,
        waist_cm: 78,
        neck_cm: 40,
        hip_cm: 95,
      },
    ];
    const m = monthlyLatest(entries)['2026-05'];
    expect(m).toEqual({
      weight_kg: 60,
      arm_cm: 38,
      chest_cm: 100,
      thigh_cm: 55,
      shoulder_cm: 120,
      waist_cm: 78,
      neck_cm: 40,
      hip_cm: 95,
    });
  });

  it('returns an empty object for no entries', () => {
    expect(monthlyLatest([])).toEqual({});
    expect(monthlyLatest()).toEqual({});
  });
});

describe('measurementDeltas.monthOverMonthDeltas', () => {
  it('computes a signed delta versus the previous month with the value present', () => {
    const monthly = {
      '2026-04': { arm_cm: 37.0, waist_cm: 81.0 },
      '2026-05': { arm_cm: 38.5, waist_cm: 79.0 },
    };
    const deltas = monthOverMonthDeltas(monthly);
    expect(deltas['2026-05'].arm_cm).toBeCloseTo(1.5, 5);
    expect(deltas['2026-05'].waist_cm).toBeCloseTo(-2.0, 5);
  });

  it('yields null for the first month (no previous month to compare)', () => {
    const monthly = { '2026-04': { arm_cm: 37.0 }, '2026-05': { arm_cm: 38.0 } };
    const deltas = monthOverMonthDeltas(monthly);
    expect(deltas['2026-04'].arm_cm).toBeNull();
    expect(deltas['2026-05'].arm_cm).toBeCloseTo(1.0, 5);
  });

  it('yields null when the current side is missing the field (FR-023)', () => {
    const monthly = {
      '2026-04': { arm_cm: 37.0 },
      '2026-05': { waist_cm: 79.0 },
    };
    const deltas = monthOverMonthDeltas(monthly);
    expect(deltas['2026-05'].arm_cm ?? null).toBeNull();
    expect(deltas['2026-05'].waist_cm).toBeNull(); // no prior waist
  });

  it('yields null when the prior side is missing the field (FR-023)', () => {
    const monthly = {
      '2026-04': { arm_cm: 37.0 },
      '2026-05': { arm_cm: 38.0 },
      '2026-06': { arm_cm: 39.0, chest_cm: 101.0 },
    };
    const deltas = monthOverMonthDeltas(monthly);
    // chest first appears in 2026-06 → no prior chest value → null
    expect(deltas['2026-06'].chest_cm).toBeNull();
    expect(deltas['2026-06'].arm_cm).toBeCloseTo(1.0, 5);
  });

  it('compares against the immediately preceding present month, in chronological order', () => {
    const monthly = {
      '2026-06': { weight_kg: 62 },
      '2026-04': { weight_kg: 58 },
      '2026-05': { weight_kg: 60 },
    };
    const deltas = monthOverMonthDeltas(monthly);
    expect(deltas['2026-04'].weight_kg).toBeNull();
    expect(deltas['2026-05'].weight_kg).toBeCloseTo(2, 5);
    expect(deltas['2026-06'].weight_kg).toBeCloseTo(2, 5);
  });

  it('does not bridge a gap month: present → absent → present yields null on return (FR-023/SC-005)', () => {
    const monthly = {
      '2026-04': { arm_cm: 37.0 },
      '2026-05': { waist_cm: 79.0 }, // arm absent this month
      '2026-06': { arm_cm: 40.0 }, // arm returns — but May (its prior month) had no arm
    };
    const deltas = monthOverMonthDeltas(monthly);
    // June's immediately-preceding month (May) lacks arm → no prior-month value → null.
    // Must NOT reach back to April for a +3 delta.
    expect(deltas['2026-06'].arm_cm).toBeNull();
    // May's waist is its first appearance (April had none) → null.
    expect(deltas['2026-05'].waist_cm).toBeNull();
    // April is the first month → null.
    expect(deltas['2026-04'].arm_cm).toBeNull();
  });

  it('returns an empty object for empty monthly input', () => {
    expect(monthOverMonthDeltas({})).toEqual({});
    expect(monthOverMonthDeltas()).toEqual({});
  });
});
