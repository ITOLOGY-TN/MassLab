import { describe, it, expect } from 'vitest';
import { gaugeArc } from '../../frontend/src/lib/chartGeometry.js';

describe('gaugeArc', () => {
  it('fills half the ring at half the goal', () => {
    const arc = gaugeArc({ value: 1500, max: 3000, radius: 50, strokeWidth: 0 });
    const circ = 2 * Math.PI * 50;
    expect(arc.fraction).toBe(0.5);
    expect(arc.over).toBe(false);
    expect(arc.circumference).toBeCloseTo(circ, 1);
    // Half hidden: dashOffset ≈ half the circumference.
    expect(arc.dashOffset).toBeCloseTo(circ / 2, 1);
  });

  it('fills the whole ring at the goal', () => {
    const arc = gaugeArc({ value: 3000, max: 3000, radius: 50 });
    expect(arc.fraction).toBe(1);
    expect(arc.over).toBe(false);
    expect(arc.dashOffset).toBe(0);
  });

  it('clamps the visual fill at 100% but flags over-goal', () => {
    const arc = gaugeArc({ value: 4500, max: 3000, radius: 50 });
    expect(arc.fraction).toBe(1);
    expect(arc.over).toBe(true);
    expect(arc.dashOffset).toBe(0);
  });

  it('is NaN-safe with a zero or missing goal', () => {
    const arc = gaugeArc({ value: 250, max: 0, radius: 50 });
    expect(arc.fraction).toBe(0);
    expect(arc.over).toBe(true);
    expect(Number.isNaN(arc.dashOffset)).toBe(false);
    expect(arc.dashOffset).toBe(arc.circumference);
  });

  it('insets the radius by half the stroke width', () => {
    const thin = gaugeArc({ value: 1, max: 1, radius: 50, strokeWidth: 0 });
    const thick = gaugeArc({ value: 1, max: 1, radius: 50, strokeWidth: 10 });
    // A thicker stroke draws on a smaller centerline circle.
    expect(thick.circumference).toBeLessThan(thin.circumference);
    expect(thick.circumference).toBeCloseTo(2 * Math.PI * 45, 1);
  });
});
