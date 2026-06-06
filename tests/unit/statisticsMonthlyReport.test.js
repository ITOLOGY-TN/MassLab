import { describe, it, expect } from 'vitest';

// Phase 11 (014-phase11-statistics) US4 — the month-scoped report assembler.
// Pure: it RECEIVES lifetime/topProgressions/weightSeries/recommendations as
// injected inputs (decoupled from US1/US2) and computes only the month summary.
// No I/O, no clock, no globals.
import { build } from '../../services/statistics/monthlyReport.js';

const PERIOD = { month: '2026-05', from: '2026-05-01', to: '2026-05-31', label: 'mai 2026' };

const LIFETIME = {
  total_weight_gained_kg: 4.5,
  total_volume_kg: 123456.78,
  session_completion_pct: 82.3,
  avg_weekly_calories: 18200,
};

const TOP_PROGRESSIONS = [
  { exercise_id: 12, name: 'Développé couché', gain_kg: 10 },
  { exercise_id: 5, name: 'Squat', gain_kg: 7.5 },
];

const WEIGHT_SERIES = [
  { date: '2026-05-02', weight_kg: 80.1 },
  { date: '2026-05-20', weight_kg: 81.4 },
];

const RECOMMENDATIONS = [
  { key: 'ready_to_add_load', message: 'Augmente la charge sur Développé couché.', context: { exercise: 'Développé couché' } },
];

describe('monthlyReport.build — summary computation', () => {
  it('passes through period/lifetime/topProgressions/weightSeries/recommendations unchanged', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [],
      monthMeasurements: [],
      monthNutritionEntries: [],
      monthCheckins: [],
      lifetime: LIFETIME,
      topProgressions: TOP_PROGRESSIONS,
      weightSeries: WEIGHT_SERIES,
      recommendations: RECOMMENDATIONS,
    });
    expect(report.period).toEqual(PERIOD);
    expect(report.lifetime).toEqual(LIFETIME);
    expect(report.topProgressions).toEqual(TOP_PROGRESSIONS);
    expect(report.weightSeries).toEqual(WEIGHT_SERIES);
    expect(report.recommendations).toEqual(RECOMMENDATIONS);
  });

  it('computes the month summary from injected month data', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [
        { ended_at: '2026-05-02T10:00:00.000Z', total_volume_kg: 1000.5 },
        { ended_at: '2026-05-05T10:00:00.000Z', total_volume_kg: 2000.25 },
        { ended_at: '2026-05-09T10:00:00.000Z', total_volume_kg: 500 },
      ],
      // weight_change = last(non-null) - first(non-null) = 82 - 80 = 2
      monthMeasurements: [
        { measured_on: '2026-05-01', weight_kg: 80 },
        { measured_on: '2026-05-15', weight_kg: 81 },
        { measured_on: '2026-05-28', weight_kg: 82 },
      ],
      // two logged days: 2026-05-03 (2000) and 2026-05-04 (2400+? ) → mean of per-day kcal
      monthNutritionEntries: [
        { logged_on: '2026-05-03', kcal: 1200 },
        { logged_on: '2026-05-03', kcal: 800 }, // day1 total 2000
        { logged_on: '2026-05-04', kcal: 2400 }, // day2 total 2400
      ],
      monthCheckins: [
        { logged_on: '2026-05-03', sleep_hours: 7 },
        { logged_on: '2026-05-04', sleep_hours: 8 },
        { logged_on: '2026-05-05', sleep_hours: null },
      ],
      lifetime: LIFETIME,
      topProgressions: TOP_PROGRESSIONS,
      weightSeries: WEIGHT_SERIES,
      recommendations: RECOMMENDATIONS,
    });

    expect(report.summary.volume_kg).toBe(3500.75);
    expect(report.summary.sessions_completed).toBe(3);
    expect(report.summary.weight_change_kg).toBe(2);
    expect(report.summary.avg_daily_calories).toBe(2200); // (2000 + 2400) / 2
    expect(report.summary.avg_sleep_hours).toBe(7.5); // (7 + 8) / 2, null ignored
  });

  it('rounds numeric summary values to 2 decimals', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [{ ended_at: '2026-05-02T10:00:00.000Z', total_volume_kg: 100.123 }],
      monthMeasurements: [],
      monthNutritionEntries: [
        { logged_on: '2026-05-03', kcal: 1000 },
        { logged_on: '2026-05-04', kcal: 1001 },
        { logged_on: '2026-05-05', kcal: 1001 },
      ],
      monthCheckins: [
        { logged_on: '2026-05-03', sleep_hours: 7.1 },
        { logged_on: '2026-05-04', sleep_hours: 7.2 },
        { logged_on: '2026-05-05', sleep_hours: 7.4 },
      ],
      lifetime: LIFETIME,
      topProgressions: [],
      weightSeries: [],
      recommendations: [],
    });
    expect(report.summary.volume_kg).toBe(100.12);
    expect(report.summary.avg_daily_calories).toBe(1000.67); // 3002/3
    expect(report.summary.avg_sleep_hours).toBe(7.23); // 21.7/3
  });

  it('returns null weight_change_kg with fewer than 2 weight points', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [],
      monthMeasurements: [{ measured_on: '2026-05-01', weight_kg: 80 }],
      monthNutritionEntries: [],
      monthCheckins: [],
      lifetime: LIFETIME,
      topProgressions: [],
      weightSeries: [],
      recommendations: [],
    });
    expect(report.summary.weight_change_kg).toBeNull();
  });

  it('ignores null-weight measurement rows when computing weight_change', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [],
      monthMeasurements: [
        { measured_on: '2026-05-01', weight_kg: null, chest_cm: 100 },
        { measured_on: '2026-05-10', weight_kg: 79 },
        { measured_on: '2026-05-20', weight_kg: 81 },
        { measured_on: '2026-05-25', weight_kg: null },
      ],
      monthNutritionEntries: [],
      monthCheckins: [],
      lifetime: LIFETIME,
      topProgressions: [],
      weightSeries: [],
      recommendations: [],
    });
    expect(report.summary.weight_change_kg).toBe(2); // 81 - 79
  });

  it('emits the valid empty-month shape when month data is empty', () => {
    const report = build({
      period: PERIOD,
      monthDailyVolumes: [],
      monthMeasurements: [],
      monthNutritionEntries: [],
      monthCheckins: [],
      lifetime: {
        total_weight_gained_kg: null,
        total_volume_kg: 0,
        session_completion_pct: null,
        avg_weekly_calories: null,
      },
      topProgressions: [],
      weightSeries: [],
      recommendations: [{ key: 'log_more_data', message: 'Enregistre plus de données.' }],
    });
    expect(report.summary).toEqual({
      volume_kg: 0,
      sessions_completed: 0,
      weight_change_kg: null,
      avg_daily_calories: null,
      avg_sleep_hours: null,
    });
    expect(report.topProgressions).toEqual([]);
    expect(report.weightSeries).toEqual([]);
    expect(report.recommendations).toEqual([
      { key: 'log_more_data', message: 'Enregistre plus de données.' },
    ]);
  });
});
