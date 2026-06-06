import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/metricsView.js';

// Phase 11 (014-phase11-statistics) US1 — metricsView.build packs the four pure
// metrics into the exact contract `Metrics` shape (contracts/openapi.yaml) and
// renders the cold-start shape for a brand-new athlete with no data.

const ASOF = '2026-06-06';
const PROGRAM_START = '2026-05-04'; // Monday

describe('statistics/metricsView.build', () => {
  it('returns the exact contract Metrics shape from populated inputs', () => {
    const result = build({
      measurements: [
        { measured_on: '2026-05-04', weight_kg: 70 },
        { measured_on: '2026-06-01', weight_kg: 73 },
      ],
      startingWeightKg: 70,
      dailyVolumes: [
        { total_volume_kg: 1000 },
        { total_volume_kg: 1500 },
      ],
      trainingWeekdays: [1], // Mondays only
      finishedDays: ['2026-05-04', '2026-05-11'],
      nutritionEntries: [{ logged_on: '2026-05-04', kcal: 2000 }],
      programStart: PROGRAM_START,
      asOf: ASOF,
    });

    expect(Object.keys(result).sort()).toEqual(
      [
        'avg_weekly_calories',
        'session_completion_rate',
        'total_volume_kg',
        'total_weight_gained_kg',
      ].sort(),
    );
    expect(result.total_weight_gained_kg).toBe(3);
    expect(result.total_volume_kg).toBe(2500);
    expect(result.session_completion_rate).toEqual({ completed: 2, scheduled: 5, pct: 40 });
    expect(result.avg_weekly_calories).toBe(2000);
  });

  it('returns the cold-start shape for a brand-new athlete (no data)', () => {
    const result = build({
      measurements: [],
      startingWeightKg: 70,
      dailyVolumes: [],
      trainingWeekdays: [],
      finishedDays: [],
      nutritionEntries: [],
      programStart: PROGRAM_START,
      asOf: ASOF,
    });

    expect(result).toEqual({
      total_weight_gained_kg: null,
      total_volume_kg: 0,
      session_completion_rate: { completed: 0, scheduled: 0, pct: null },
      avg_weekly_calories: null,
    });
  });

  it('tolerates an empty args object (defensive cold-start)', () => {
    const result = build({});
    expect(result.total_weight_gained_kg).toBeNull();
    expect(result.total_volume_kg).toBe(0);
    expect(result.session_completion_rate).toEqual({ completed: 0, scheduled: 0, pct: null });
    expect(result.avg_weekly_calories).toBeNull();
  });
});
