import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/bodyTab.js';

// Phase 11 (014-phase11-statistics) — pure Body-tab presenter. Maps the reused
// weightChartView output (points[].kg, goalKg) to the contract (weight_kg, goal_kg)
// and builds one per-measurement series from the raw rows, including only fields
// that have data. No clock/IO/globals.

const profile = { program_start_date: '2026-01-01', target_weight_kg: 75 };

describe('bodyTab.build — weight', () => {
  it('maps weightChartView points to { date, weight_kg } and goalKg to goal_kg', () => {
    const measurements = [
      { measured_on: '2026-01-10', weight_kg: 70, chest_cm: null },
      { measured_on: '2026-01-20', weight_kg: 72, chest_cm: null },
    ];
    const out = build({ measurements, profile, phases: [], asOf: '2026-02-01' });
    expect(out.weight).toEqual({
      points: [
        { date: '2026-01-10', weight_kg: 70 },
        { date: '2026-01-20', weight_kg: 72 },
      ],
      goal_kg: 75,
      has_data: true,
    });
  });

  it('has_data false and goal_kg null cold-start', () => {
    const out = build({ measurements: [], profile: {}, phases: [], asOf: '2026-02-01' });
    expect(out.weight).toEqual({ points: [], goal_kg: null, has_data: false });
    expect(out.measurements).toEqual([]);
  });
});

describe('bodyTab.build — measurements', () => {
  it('builds an ascending series only for fields that have at least one value', () => {
    const measurements = [
      { measured_on: '2026-01-10', weight_kg: 70, chest_cm: 100, arm_cm: null },
      { measured_on: '2026-01-20', weight_kg: 72, chest_cm: 102, arm_cm: 35 },
    ];
    const out = build({ measurements, profile, phases: [], asOf: '2026-02-01' });
    const chest = out.measurements.find((m) => m.key === 'chest');
    const arm = out.measurements.find((m) => m.key === 'arm');
    expect(chest).toEqual({
      key: 'chest',
      label: 'Poitrine',
      unit: 'cm',
      points: [
        { date: '2026-01-10', value: 100 },
        { date: '2026-01-20', value: 102 },
      ],
    });
    expect(arm).toEqual({
      key: 'arm',
      label: 'Bras',
      unit: 'cm',
      points: [{ date: '2026-01-20', value: 35 }],
    });
    // weight_kg never appears as a measurement series.
    expect(out.measurements.some((m) => m.key === 'weight')).toBe(false);
  });

  it('omits a measurement entirely when it has no values', () => {
    const measurements = [{ measured_on: '2026-01-10', weight_kg: 70, waist_cm: null }];
    const out = build({ measurements, profile, phases: [], asOf: '2026-02-01' });
    expect(out.measurements.some((m) => m.key === 'waist')).toBe(false);
  });
});
