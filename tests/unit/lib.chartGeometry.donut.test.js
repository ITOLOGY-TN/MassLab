import { describe, it, expect } from 'vitest';
import { donutSegments } from '../../frontend/src/lib/chartGeometry.js';

const GEO = { radius: 50, innerRadius: 30, cx: 60, cy: 60 };

describe('donutSegments', () => {
  it('splits the values proportionally and spans a full turn', () => {
    const segs = donutSegments({ values: [50, 30, 20], ...GEO });
    expect(segs).toHaveLength(3);
    expect(segs.map((s) => s.fraction)).toEqual([0.5, 0.3, 0.2]);

    // First segment starts at 12 o'clock; the last ends a full turn later.
    // (angles are rounded to 2 decimals in the output)
    expect(segs[0].startAngle).toBeCloseTo(-Math.PI / 2, 2);
    expect(segs[2].endAngle).toBeCloseTo(-Math.PI / 2 + 2 * Math.PI, 1);

    // Total swept angle is exactly one revolution.
    const swept = segs.reduce((sum, s) => sum + (s.endAngle - s.startAngle), 0);
    expect(swept).toBeCloseTo(2 * Math.PI, 2);

    // Each non-empty slice yields a drawable path.
    for (const s of segs) expect(s.path).toMatch(/^M/);
  });

  it('flags the large-arc on a slice past a half turn', () => {
    const segs = donutSegments({ values: [80, 20], ...GEO });
    // 80% slice > 50% → large-arc-flag set on its outer arc.
    expect(segs[0].path).toContain('A50,50 0 1 1');
    // 20% slice < 50% → large-arc-flag clear.
    expect(segs[1].path).toContain('A50,50 0 0 1');
  });

  it('is NaN-safe for a zero total', () => {
    const segs = donutSegments({ values: [0, 0, 0], ...GEO });
    expect(segs).toHaveLength(3);
    for (const s of segs) {
      expect(s.fraction).toBe(0);
      expect(s.path).toBe('');
      expect(Number.isNaN(s.startAngle)).toBe(false);
      expect(Number.isNaN(s.endAngle)).toBe(false);
    }
  });

  it('returns an empty array for no values', () => {
    expect(donutSegments({ values: [], ...GEO })).toEqual([]);
  });
});
