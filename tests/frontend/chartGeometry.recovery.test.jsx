import { describe, it, expect } from 'vitest';
import { calendarMonth, scatterPoints, linearScale } from '../../frontend/src/lib/chartGeometry.js';

// Phase 9 (012-phase9-recovery-wellbeing) T028+T034 — pure geometry for the recovery
// trends charts: a Monday-start month grid (CalendarHeatmap) and pixel-mapped scatter
// points (ScatterPlot). Test-first (Constitution V); no DOM, no React.

describe('calendarMonth', () => {
  it('lays June 2026 into a Monday-start 7-column grid', () => {
    // June 1, 2026 is a Monday → first cell sits at col 0, row 0.
    const cells = calendarMonth({ year: 2026, month: 6 });
    const inMonth = cells.filter((c) => c.inMonth);
    expect(inMonth).toHaveLength(30);

    const first = cells.find((c) => c.date === '2026-06-01');
    expect(first).toMatchObject({ row: 0, col: 0, inMonth: true });

    // June 7 is a Sunday → last column of the first row.
    const sunday = cells.find((c) => c.date === '2026-06-07');
    expect(sunday).toMatchObject({ row: 0, col: 6 });

    // June 8 wraps to the next row, first column.
    const nextMon = cells.find((c) => c.date === '2026-06-08');
    expect(nextMon).toMatchObject({ row: 1, col: 0 });
  });

  it('pads the leading days when the month does not start on Monday', () => {
    // May 1, 2026 is a Friday → col 4 in a Monday-start grid (Mon=0 … Sun=6).
    const cells = calendarMonth({ year: 2026, month: 5 });
    const first = cells.find((c) => c.date === '2026-05-01');
    expect(first).toMatchObject({ row: 0, col: 4 });

    // Leading pad cells precede it on row 0, flagged out-of-month.
    const pad = cells.filter((c) => !c.inMonth && c.row === 0);
    expect(pad.length).toBeGreaterThanOrEqual(4);
    for (const p of pad) expect(p.col).toBeLessThan(4);
  });

  it('honours weekStartsOn=0 (Sunday-start)', () => {
    // With a Sunday-start grid, June 1 2026 (a Monday) sits at col 1.
    const cells = calendarMonth({ year: 2026, month: 6, weekStartsOn: 0 });
    const first = cells.find((c) => c.date === '2026-06-01');
    expect(first.col).toBe(1);
  });

  it('emits x/y derived from row/col so cells tile without overlap', () => {
    const cells = calendarMonth({ year: 2026, month: 6 });
    const a = cells.find((c) => c.date === '2026-06-01'); // row 0 col 0
    const b = cells.find((c) => c.date === '2026-06-02'); // row 0 col 1
    const c = cells.find((c) => c.date === '2026-06-08'); // row 1 col 0
    // Same row → same y, advancing x.
    expect(a.y).toBe(b.y);
    expect(b.x).toBeGreaterThan(a.x);
    // Next row → same x as col 0, advancing y.
    expect(c.x).toBe(a.x);
    expect(c.y).toBeGreaterThan(a.y);
  });
});

describe('scatterPoints', () => {
  it('maps each datum to a pixel position via the supplied scales', () => {
    const xScale = linearScale({ domainMin: 0, domainMax: 10, rangeMin: 0, rangeMax: 100 });
    const yScale = linearScale({ domainMin: 0, domainMax: 5000, rangeMin: 200, rangeMax: 0 });
    const points = [
      { x: 5, y: 2500, date: '2026-06-02' },
      { x: 8, y: 4000, date: '2026-06-03' },
    ];
    const out = scatterPoints({ points, xScale, yScale });
    expect(out).toHaveLength(2);
    expect(out[0].cx).toBe(50);
    expect(out[0].cy).toBe(100); // inverted axis: mid-domain → mid-range
    expect(out[0].datum).toBe(points[0]);
    expect(out[1].cx).toBe(80);
  });

  it('returns an empty array for no points', () => {
    const scale = linearScale({ domainMin: 0, domainMax: 1, rangeMin: 0, rangeMax: 1 });
    expect(scatterPoints({ points: [], xScale: scale, yScale: scale })).toEqual([]);
  });
});
