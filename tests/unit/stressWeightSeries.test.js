// Phase 11 (US3) — pure stress-vs-weight pairing (D-9). A point is emitted only for
// dates that have BOTH a non-null stress check-in and a non-null weight entry, joined
// on date; sufficient = points.length >= minPoints.
import { describe, it, expect } from 'vitest';
import { pairStressWeight } from '../../services/engine/stressWeightSeries.js';

describe('pairStressWeight', () => {
  it('emits a point only when both stress and weight exist for the same date', () => {
    const out = pairStressWeight({
      checkins: [
        { logged_on: '2026-06-01', stress: 5 },
        { logged_on: '2026-06-02', stress: 7 },
        { logged_on: '2026-06-03', stress: 3 },
      ],
      weights: [
        { measured_on: '2026-06-01', weight_kg: 80 },
        { measured_on: '2026-06-03', weight_kg: 81 },
      ],
      minPoints: 1,
    });
    expect(out.points).toEqual([
      { date: '2026-06-01', stress: 5, weight_kg: 80 },
      { date: '2026-06-03', stress: 3, weight_kg: 81 },
    ]);
  });

  it('skips dates with a null stress or null weight', () => {
    const out = pairStressWeight({
      checkins: [
        { logged_on: '2026-06-01', stress: null },
        { logged_on: '2026-06-02', stress: 6 },
      ],
      weights: [
        { measured_on: '2026-06-01', weight_kg: 80 },
        { measured_on: '2026-06-02', weight_kg: null },
      ],
      minPoints: 1,
    });
    expect(out.points).toEqual([]);
  });

  it('returns points ascending by date', () => {
    const out = pairStressWeight({
      checkins: [
        { logged_on: '2026-06-05', stress: 4 },
        { logged_on: '2026-06-02', stress: 6 },
      ],
      weights: [
        { measured_on: '2026-06-05', weight_kg: 82 },
        { measured_on: '2026-06-02', weight_kg: 80 },
      ],
      minPoints: 1,
    });
    expect(out.points.map((p) => p.date)).toEqual(['2026-06-02', '2026-06-05']);
  });

  it('sufficient is true only at or above minPoints', () => {
    const checkins = [
      { logged_on: '2026-06-01', stress: 5 },
      { logged_on: '2026-06-02', stress: 7 },
    ];
    const weights = [
      { measured_on: '2026-06-01', weight_kg: 80 },
      { measured_on: '2026-06-02', weight_kg: 81 },
    ];
    expect(pairStressWeight({ checkins, weights, minPoints: 2 }).sufficient).toBe(true);
    expect(pairStressWeight({ checkins, weights, minPoints: 3 }).sufficient).toBe(false);
  });

  it('cold-start: no data → empty, not sufficient', () => {
    const out = pairStressWeight({ checkins: [], weights: [], minPoints: 3 });
    expect(out.points).toEqual([]);
    expect(out.sufficient).toBe(false);
  });
});
