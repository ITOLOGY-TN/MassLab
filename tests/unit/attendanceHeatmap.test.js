// Phase 11 (US3) — pure attendance heatmap grading (D-6). Verifies: every date in
// [from,to] inclusive is present (ascending); level 0 for no-session / rest / future
// days; quantile buckets 1..levels for days with positive volume.
import { describe, it, expect } from 'vitest';
import { gradeByVolume } from '../../services/engine/attendanceHeatmap.js';

describe('gradeByVolume', () => {
  it('emits one entry for every date in [from,to] inclusive, ascending', () => {
    const out = gradeByVolume({ dailyVolumes: [], from: '2026-06-01', to: '2026-06-05', levels: 4 });
    expect(out.from).toBe('2026-06-01');
    expect(out.to).toBe('2026-06-05');
    expect(out.levels).toBe(4);
    expect(out.days.map((d) => d.date)).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
    ]);
  });

  it('assigns level 0 and volume 0 to days with no completed session (rest/future)', () => {
    const out = gradeByVolume({
      dailyVolumes: [{ ended_at: '2026-06-02T10:00:00.000Z', total_volume_kg: 1000 }],
      from: '2026-06-01',
      to: '2026-06-03',
      levels: 4,
    });
    const byDate = Object.fromEntries(out.days.map((d) => [d.date, d]));
    expect(byDate['2026-06-01']).toEqual({ date: '2026-06-01', volume_kg: 0, level: 0 });
    expect(byDate['2026-06-03']).toEqual({ date: '2026-06-03', volume_kg: 0, level: 0 });
    expect(byDate['2026-06-02'].volume_kg).toBe(1000);
    expect(byDate['2026-06-02'].level).toBeGreaterThanOrEqual(1);
  });

  it('sums multiple sessions on the same UTC day', () => {
    const out = gradeByVolume({
      dailyVolumes: [
        { ended_at: '2026-06-02T08:00:00.000Z', total_volume_kg: 1000 },
        { ended_at: '2026-06-02T20:00:00.000Z', total_volume_kg: 500 },
      ],
      from: '2026-06-02',
      to: '2026-06-02',
      levels: 4,
    });
    expect(out.days[0].volume_kg).toBe(1500);
  });

  it('grades positive volumes into quantile buckets 1..levels', () => {
    const dailyVolumes = [
      { ended_at: '2026-06-01T10:00:00.000Z', total_volume_kg: 100 },
      { ended_at: '2026-06-02T10:00:00.000Z', total_volume_kg: 200 },
      { ended_at: '2026-06-03T10:00:00.000Z', total_volume_kg: 300 },
      { ended_at: '2026-06-04T10:00:00.000Z', total_volume_kg: 400 },
    ];
    const out = gradeByVolume({ dailyVolumes, from: '2026-06-01', to: '2026-06-04', levels: 4 });
    const levels = out.days.map((d) => d.level);
    expect(levels).toEqual([1, 2, 3, 4]);
    // The top day lands at the max level; all positive days >= 1.
    expect(Math.max(...levels)).toBe(4);
    expect(Math.min(...levels)).toBe(1);
  });

  it('keeps levels within 1..levels even with duplicate volumes', () => {
    const dailyVolumes = [
      { ended_at: '2026-06-01T10:00:00.000Z', total_volume_kg: 500 },
      { ended_at: '2026-06-02T10:00:00.000Z', total_volume_kg: 500 },
    ];
    const out = gradeByVolume({ dailyVolumes, from: '2026-06-01', to: '2026-06-02', levels: 3 });
    for (const d of out.days) {
      expect(d.level).toBeGreaterThanOrEqual(1);
      expect(d.level).toBeLessThanOrEqual(3);
    }
  });
});
