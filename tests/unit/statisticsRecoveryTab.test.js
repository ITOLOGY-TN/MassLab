// Phase 11 (US3) — recoveryTab presenter: sleep points + average, and stress-weight
// pass-through with the sufficiency flag.
import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/recoveryTab.js';

describe('statistics recoveryTab.build', () => {
  it('maps sleep points and averages hours rounded 2dp', () => {
    const out = build({
      checkins: [
        { logged_on: '2026-06-01', sleep_hours: 7, stress: 5 },
        { logged_on: '2026-06-02', sleep_hours: 8, stress: 6 },
        { logged_on: '2026-06-03', sleep_hours: null, stress: 4 },
      ],
      weights: [],
      minPoints: 2,
    });
    expect(out.sleep.points).toEqual([
      { date: '2026-06-01', hours: 7 },
      { date: '2026-06-02', hours: 8 },
    ]);
    expect(out.sleep.average_hours).toBe(7.5);
  });

  it('average_hours is null when no sleep data', () => {
    const out = build({ checkins: [], weights: [], minPoints: 2 });
    expect(out.sleep.points).toEqual([]);
    expect(out.sleep.average_hours).toBeNull();
  });

  it('passes through pairStressWeight with sufficiency', () => {
    const out = build({
      checkins: [
        { logged_on: '2026-06-01', sleep_hours: 7, stress: 5 },
        { logged_on: '2026-06-02', sleep_hours: 8, stress: 6 },
      ],
      weights: [
        { measured_on: '2026-06-01', weight_kg: 80 },
        { measured_on: '2026-06-02', weight_kg: 81 },
      ],
      minPoints: 2,
    });
    expect(out.stress_weight.points).toEqual([
      { date: '2026-06-01', stress: 5, weight_kg: 80 },
      { date: '2026-06-02', stress: 6, weight_kg: 81 },
    ]);
    expect(out.stress_weight.sufficient).toBe(true);
  });
});
