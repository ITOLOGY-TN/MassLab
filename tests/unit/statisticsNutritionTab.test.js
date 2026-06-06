// Phase 11 (US3) — nutritionTab presenter: weekly kcal grouped by ISO week + target
// = daily * 7.
import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/nutritionTab.js';

describe('statistics nutritionTab.build', () => {
  it('groups kcal by ISO week start, ascending, rounded 2dp', () => {
    // 2026-06-01 is a Monday (ISO week start). 2026-06-08 is the next Monday.
    const out = build({
      nutritionEntries: [
        { logged_on: '2026-06-01', kcal: 1000 },
        { logged_on: '2026-06-03', kcal: 1500.555 },
        { logged_on: '2026-06-08', kcal: 2000 },
      ],
      dailyTargetKcal: 3000,
    });
    expect(out.weekly).toEqual([
      { week_start: '2026-06-01', kcal: 2500.56 },
      { week_start: '2026-06-08', kcal: 2000 },
    ]);
  });

  it('weekly_target_kcal = daily * 7', () => {
    const out = build({ nutritionEntries: [], dailyTargetKcal: 3000 });
    expect(out.weekly_target_kcal).toBe(21000);
  });

  it('weekly_target_kcal is null when daily target unresolved', () => {
    const out = build({ nutritionEntries: [], dailyTargetKcal: null });
    expect(out.weekly).toEqual([]);
    expect(out.weekly_target_kcal).toBeNull();
  });
});
