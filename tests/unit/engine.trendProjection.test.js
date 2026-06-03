import { describe, it, expect } from 'vitest';
import { oneRmSeries, trendDirection } from '../../services/engine/trendProjection.js';

function rec(date, weight, est) {
  return {
    created_at: `${date}T08:00:00Z`,
    source_weight_kg: weight,
    source_reps: 5,
    primary_estimate_kg: est,
  };
}

describe('oneRmSeries', () => {
  it('sorts ascending and drops non-positive estimates', () => {
    const s = oneRmSeries([
      rec('2026-05-10', 80, 93),
      rec('2026-05-01', 75, 88),
      { created_at: 'x', primary_estimate_kg: 0 },
    ]);
    expect(s.map((p) => p.date)).toEqual(['2026-05-01', '2026-05-10']);
    expect(s[1].working_load_kg).toBe(80);
  });
});

describe('trendDirection (D-3: 30-day window, 1% flat band)', () => {
  const now = new Date('2026-05-31T00:00:00Z');
  it('up when estimate rose > 1% within the window', () => {
    const series = oneRmSeries([rec('2026-05-05', 80, 90), rec('2026-05-28', 85, 96)]);
    expect(trendDirection({ series, now })).toMatchObject({ direction: 'up' });
  });
  it('flat when change is within ±1%', () => {
    const series = oneRmSeries([rec('2026-05-05', 80, 90), rec('2026-05-28', 80, 90.5)]);
    expect(trendDirection({ series, now }).direction).toBe('flat'); // 0.56% ≤ 1%
  });
  it('down when estimate fell', () => {
    const series = oneRmSeries([rec('2026-05-05', 85, 96), rec('2026-05-28', 80, 90)]);
    expect(trendDirection({ series, now }).direction).toBe('down');
  });
  it('neutral (null) with < 2 points in the window', () => {
    const series = oneRmSeries([rec('2026-03-01', 80, 90), rec('2026-05-28', 85, 96)]); // only one in last 30d
    expect(trendDirection({ series, now })).toBeNull();
    expect(trendDirection({ series: [], now })).toBeNull();
  });
});
