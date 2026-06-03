import { describe, it, expect } from 'vitest';
import {
  linearScale,
  linePath,
  bandPath,
  barRects,
  radarPolygon,
  niceTicks,
} from '../../frontend/src/lib/chartGeometry.js';

describe('linearScale', () => {
  it('maps domain to range linearly', () => {
    const s = linearScale({ domainMin: 0, domainMax: 100, rangeMin: 0, rangeMax: 200 });
    expect(s(0)).toBe(0);
    expect(s(50)).toBe(100);
    expect(s(100)).toBe(200);
  });
});

describe('linePath', () => {
  it('builds an SVG path with M then L', () => {
    expect(
      linePath([
        { x: 0, y: 10 },
        { x: 5, y: 20 },
      ]),
    ).toBe('M0,10 L5,20');
    expect(linePath([])).toBe('');
  });
});

describe('bandPath', () => {
  it('builds a closed path along upper then back along lower', () => {
    expect(
      bandPath({
        upper: [
          { x: 0, y: 5 },
          { x: 10, y: 6 },
        ],
        lower: [
          { x: 0, y: 15 },
          { x: 10, y: 16 },
        ],
      }),
    ).toBe('M0,5 L10,6 L10,16 L0,15 Z');
  });
  it('returns empty string when an edge is missing', () => {
    expect(bandPath({ upper: [{ x: 0, y: 5 }], lower: [] })).toBe('');
    expect(bandPath({})).toBe('');
  });
});

describe('barRects', () => {
  it('produces rects with baseline-relative height', () => {
    const scaleY = linearScale({ domainMin: 0, domainMax: 10, rangeMin: 100, rangeMax: 0 });
    const rects = barRects({ values: [0, 10], scaleY, y0: 100, barWidth: 8, gap: 2 });
    expect(rects[0]).toMatchObject({ x: 0, height: 0 });
    expect(rects[1]).toMatchObject({ x: 10, y: 0, height: 100 });
  });
});

describe('radarPolygon', () => {
  it('places the first axis at 12 o’clock and scales by maxValue', () => {
    const pts = radarPolygon({ values: [10, 0, 0, 0], cx: 0, cy: 0, radius: 100, maxValue: 10 });
    expect(pts[0]).toMatchObject({ x: 0, y: -100 }); // straight up, full radius
    expect(pts[1]).toMatchObject({ x: 0, y: 0 }); // zero value → centre
    expect(pts).toHaveLength(4);
  });
  it('collapses to centre when maxValue is 0', () => {
    const pts = radarPolygon({ values: [0, 0, 0], cx: 5, cy: 5, radius: 50, maxValue: 0 });
    expect(pts.every((p) => p.x === 5 && p.y === 5)).toBe(true);
  });
});

describe('niceTicks', () => {
  it('returns rounded ascending ticks spanning the range', () => {
    const ticks = niceTicks(0, 100, 4);
    expect(ticks[0]).toBeGreaterThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(100);
    expect([...ticks].sort((a, b) => a - b)).toEqual(ticks);
  });
});
