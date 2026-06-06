// Phase 11 (US3) — attendanceTab presenter passes its grade output through verbatim
// (the AttendanceTab contract shape). Pure, no frontend / layout concern.
import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/attendanceTab.js';

describe('statistics attendanceTab.build', () => {
  it('returns the gradeByVolume shape with from/to/levels/days', () => {
    const out = build({
      dailyVolumes: [{ ended_at: '2026-06-02T10:00:00.000Z', total_volume_kg: 1000 }],
      from: '2026-06-01',
      to: '2026-06-03',
      levels: 4,
    });
    expect(out.from).toBe('2026-06-01');
    expect(out.to).toBe('2026-06-03');
    expect(out.levels).toBe(4);
    expect(out.days).toHaveLength(3);
    expect(out.days.every((d) => 'date' in d && 'volume_kg' in d && 'level' in d)).toBe(true);
  });

  it('cold-start: still carries from/to/levels with all-zero days', () => {
    const out = build({ dailyVolumes: [], from: '2026-06-01', to: '2026-06-02', levels: 4 });
    expect(out.days.map((d) => d.level)).toEqual([0, 0]);
    expect(out.levels).toBe(4);
  });
});
