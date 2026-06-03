import { describe, it, expect } from 'vitest';
import { oneRmSeries, projectOneRm } from '../../services/engine/trendProjection.js';

function rec(date, est) {
  return {
    created_at: `${date}T08:00:00Z`,
    source_weight_kg: 80,
    source_reps: 5,
    primary_estimate_kg: est,
  };
}

describe('projectOneRm (D-2: least-squares, ≥3 points, 8 weeks)', () => {
  it('returns null below the 3-point floor', () => {
    expect(
      projectOneRm({ series: oneRmSeries([rec('2026-05-01', 90), rec('2026-05-08', 91)]) }),
    ).toBeNull();
  });

  it('fits a rising line and projects 8 weekly points forward', () => {
    // +1 kg/week, 4 points → slope ≈ 1/7 per day; projection continues upward.
    const series = oneRmSeries([
      rec('2026-05-01', 90),
      rec('2026-05-08', 91),
      rec('2026-05-15', 92),
      rec('2026-05-22', 93),
    ]);
    const proj = projectOneRm({ series });
    expect(proj.method).toBe('least_squares_linear');
    expect(proj.weeks_ahead).toBe(8);
    expect(proj.points).toHaveLength(8);
    // monotonically increasing dates, and the last point > the last observed (93)
    expect(proj.points[7].estimate_1rm_kg).toBeGreaterThan(93);
    const dates = proj.points.map((p) => p.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it('returns null when all points share a day (degenerate fit)', () => {
    const series = oneRmSeries([
      rec('2026-05-01', 90),
      rec('2026-05-01', 91),
      rec('2026-05-01', 92),
    ]);
    expect(projectOneRm({ series })).toBeNull();
  });
});
