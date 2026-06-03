import { describe, it, expect } from 'vitest';
import { build, DIMENSIONS } from '../../services/supplements/assessmentView.js';

// Phase 8 (011-phase8-supplements) T032 — pure assessment presenter (FR-012/FR-015/
// FR-016). Returns { current|null, editable, trend } in chronological order and
// handles the no-data shape without error. The four fixed dimensions live here as a
// tested constant (research D-9), not env config.

const ROW = (week, e, r, s, st) => ({
  week_start: week,
  energy: e,
  recovery: r,
  sleep_quality: s,
  strength: st,
});

describe('assessmentView.build', () => {
  it('exposes the four fixed dimensions', () => {
    expect(DIMENSIONS).toEqual(['energy', 'recovery', 'sleep_quality', 'strength']);
  });

  it('returns the current week (editable) and the chronological trend', () => {
    const view = build({
      currentRow: ROW('2026-06-01', 4, 3, 4, 4),
      trendRows: [ROW('2026-05-18', 3, 3, 3, 3), ROW('2026-06-01', 4, 3, 4, 4)],
      weekStart: '2026-06-01',
    });
    expect(view.current).toMatchObject({ week_start: '2026-06-01', energy: 4, strength: 4 });
    expect(view.editable).toBe(true);
    expect(view.trend.map((t) => t.week_start)).toEqual(['2026-05-18', '2026-06-01']);
  });

  it('returns current=null and an empty trend when nothing is recorded', () => {
    const view = build({ currentRow: null, trendRows: [], weekStart: '2026-06-01' });
    expect(view.current).toBeNull();
    expect(view.editable).toBe(true);
    expect(view.trend).toEqual([]);
  });
});
