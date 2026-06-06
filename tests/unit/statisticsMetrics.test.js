import { describe, it, expect } from 'vitest';
import {
  totalWeightGained,
  totalVolumeSinceStart,
  sessionCompletionRate,
  averageWeeklyCalories,
} from '../../services/engine/statisticsMetrics.js';

// Phase 11 (014-phase11-statistics) US1 — the four headline metrics (research D-7).
// Pure: every fn takes injected data + an explicit `asOf`/`programStart` anchor.
// No clock, no I/O. `ASOF` is the fixed server "today" the controller would inject.

const ASOF = '2026-06-06'; // a Saturday
const PROGRAM_START = '2026-05-04'; // a Monday

describe('statisticsMetrics.totalWeightGained', () => {
  it('returns latest body weight minus starting weight, signed, 2dp', () => {
    const measurements = [
      { measured_on: '2026-05-04', weight_kg: 70 },
      { measured_on: '2026-06-01', weight_kg: 72.555 },
    ];
    expect(totalWeightGained({ measurements, startingWeightKg: 70 })).toBe(2.56);
  });

  it('uses the most recent measured_on that has a non-null weight, ignoring order', () => {
    const measurements = [
      { measured_on: '2026-06-01', weight_kg: 72 },
      { measured_on: '2026-05-04', weight_kg: 70 },
      { measured_on: '2026-06-03', weight_kg: null }, // newer date but no weight
    ];
    expect(totalWeightGained({ measurements, startingWeightKg: 70 })).toBe(2);
  });

  it('can be negative (weight loss)', () => {
    const measurements = [{ measured_on: '2026-06-01', weight_kg: 68 }];
    expect(totalWeightGained({ measurements, startingWeightKg: 70 })).toBe(-2);
  });

  it('returns null when no body weight has been logged (cold-start)', () => {
    expect(totalWeightGained({ measurements: [], startingWeightKg: 70 })).toBeNull();
    expect(
      totalWeightGained({
        measurements: [{ measured_on: '2026-06-01', weight_kg: null }],
        startingWeightKg: 70,
      }),
    ).toBeNull();
  });
});

describe('statisticsMetrics.totalVolumeSinceStart', () => {
  it('sums total_volume_kg over rows, 2dp', () => {
    const dailyVolumes = [
      { ended_at: '2026-05-05T10:00:00.000Z', total_volume_kg: 1000.1 },
      { ended_at: '2026-05-07T10:00:00.000Z', total_volume_kg: 2000.22 },
    ];
    expect(totalVolumeSinceStart({ dailyVolumes })).toBe(3000.32);
  });

  it('treats null volume as 0', () => {
    const dailyVolumes = [
      { ended_at: '2026-05-05T10:00:00.000Z', total_volume_kg: null },
      { ended_at: '2026-05-07T10:00:00.000Z', total_volume_kg: 500 },
    ];
    expect(totalVolumeSinceStart({ dailyVolumes })).toBe(500);
  });

  it('returns 0 when empty (cold-start)', () => {
    expect(totalVolumeSinceStart({ dailyVolumes: [] })).toBe(0);
  });
});

describe('statisticsMetrics.sessionCompletionRate', () => {
  it('counts scheduled training weekdays in [programStart, asOf] and distinct completed days', () => {
    // Mon (1) + Thu (4). Window 2026-05-04 (Mon) .. 2026-06-06 (Sat).
    // Mondays: 05-04, 05-11, 05-18, 05-25, 06-01 = 5
    // Thursdays: 05-07, 05-14, 05-21, 05-28, 06-04 = 5 => scheduled 10
    const trainingWeekdays = [1, 4];
    const finishedDays = ['2026-05-04', '2026-05-07', '2026-05-11'];
    const result = sessionCompletionRate({
      trainingWeekdays,
      finishedDays,
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result.scheduled).toBe(10);
    expect(result.completed).toBe(3);
    expect(result.pct).toBe(30);
  });

  it('excludes finished days before programStart (program-start anchor)', () => {
    const trainingWeekdays = [1];
    const finishedDays = [
      '2026-04-27', // before start — excluded
      '2026-05-04', // counts
    ];
    const result = sessionCompletionRate({
      trainingWeekdays,
      finishedDays,
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result.completed).toBe(1);
  });

  it('excludes finished days after asOf', () => {
    const trainingWeekdays = [1];
    const finishedDays = ['2026-05-04', '2026-12-31'];
    const result = sessionCompletionRate({
      trainingWeekdays,
      finishedDays,
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result.completed).toBe(1);
  });

  it('counts distinct dates only', () => {
    const result = sessionCompletionRate({
      trainingWeekdays: [1],
      finishedDays: ['2026-05-04', '2026-05-04'],
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result.completed).toBe(1);
  });

  it('accepts Sets for weekdays and finishedDays', () => {
    const result = sessionCompletionRate({
      trainingWeekdays: new Set([1]),
      finishedDays: new Set(['2026-05-04']),
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result.completed).toBe(1);
    expect(result.scheduled).toBe(5);
  });

  it('returns pct null when nothing is scheduled (cold-start)', () => {
    const result = sessionCompletionRate({
      trainingWeekdays: [],
      finishedDays: [],
      programStart: PROGRAM_START,
      asOf: ASOF,
    });
    expect(result).toEqual({ completed: 0, scheduled: 0, pct: null });
  });

  it('rounds pct to 2dp', () => {
    // 1 of 3 = 33.333... => 33.33
    const result = sessionCompletionRate({
      trainingWeekdays: [1],
      finishedDays: ['2026-05-04'],
      programStart: '2026-05-04',
      asOf: '2026-05-18', // Mondays 05-04, 05-11, 05-18 => 3 scheduled
    });
    expect(result.scheduled).toBe(3);
    expect(result.completed).toBe(1);
    expect(result.pct).toBe(33.33);
  });
});

describe('statisticsMetrics.averageWeeklyCalories', () => {
  it('groups by ISO week, sums kcal per week, returns the mean of weekly sums (2dp)', () => {
    // Week of 05-04 (Mon..Sun): 05-04 + 05-05 => 2000 + 2200 = 4200
    // Week of 05-11: 05-11 => 1800
    // mean = (4200 + 1800) / 2 = 3000
    const nutritionEntries = [
      { logged_on: '2026-05-04', kcal: 2000 },
      { logged_on: '2026-05-05', kcal: 2200 },
      { logged_on: '2026-05-11', kcal: 1800 },
    ];
    expect(averageWeeklyCalories({ nutritionEntries })).toBe(3000);
  });

  it('rounds the mean to 2dp', () => {
    const nutritionEntries = [
      { logged_on: '2026-05-04', kcal: 1000 },
      { logged_on: '2026-05-11', kcal: 1001 },
    ];
    // mean = (1000 + 1001) / 2 = 1000.5
    expect(averageWeeklyCalories({ nutritionEntries })).toBe(1000.5);
  });

  it('returns null when no entries (cold-start)', () => {
    expect(averageWeeklyCalories({ nutritionEntries: [] })).toBeNull();
  });
});
