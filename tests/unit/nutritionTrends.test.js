import { describe, it, expect } from 'vitest';
import {
  caloriesByDay,
  macroBreakdown,
  weeklyAvgProtein,
} from '../../services/engine/nutritionTrends.js';

describe('caloriesByDay', () => {
  it('returns a date-ascending series across the trailing window ending at asOf', () => {
    const entries = [
      { logged_on: '2026-06-03', kcal: 500 },
      { logged_on: '2026-06-01', kcal: 200 },
    ];
    const out = caloriesByDay(entries, { days: 3, asOf: '2026-06-03' });
    expect(out).toEqual([
      { date: '2026-06-01', kcal: 200 },
      { date: '2026-06-02', kcal: 0 },
      { date: '2026-06-03', kcal: 500 },
    ]);
  });

  it('sums multiple entries on the same day', () => {
    const entries = [
      { logged_on: '2026-06-03', kcal: 300 },
      { logged_on: '2026-06-03', kcal: 132.5 },
    ];
    const out = caloriesByDay(entries, { days: 1, asOf: '2026-06-03' });
    expect(out).toEqual([{ date: '2026-06-03', kcal: 432.5 }]);
  });

  it('includes zero-kcal days for every day in the window with no entries', () => {
    const out = caloriesByDay([], { days: 3, asOf: '2026-06-03' });
    expect(out).toEqual([
      { date: '2026-06-01', kcal: 0 },
      { date: '2026-06-02', kcal: 0 },
      { date: '2026-06-03', kcal: 0 },
    ]);
  });

  it('excludes entries outside the trailing window', () => {
    const entries = [
      { logged_on: '2026-05-20', kcal: 999 },
      { logged_on: '2026-06-03', kcal: 500 },
    ];
    const out = caloriesByDay(entries, { days: 2, asOf: '2026-06-03' });
    expect(out).toEqual([
      { date: '2026-06-02', kcal: 0 },
      { date: '2026-06-03', kcal: 500 },
    ]);
  });

  it('treats missing kcal as zero', () => {
    const entries = [{ logged_on: '2026-06-03' }];
    const out = caloriesByDay(entries, { days: 1, asOf: '2026-06-03' });
    expect(out).toEqual([{ date: '2026-06-03', kcal: 0 }]);
  });
});

describe('macroBreakdown', () => {
  it('sums macro grams and returns fractions of total grams', () => {
    const out = macroBreakdown([
      { protein_g: 10, carbs_g: 30, fat_g: 10 },
      { protein_g: 30, carbs_g: 10, fat_g: 10 },
    ]);
    expect(out.protein_g).toBe(40);
    expect(out.carbs_g).toBe(40);
    expect(out.fat_g).toBe(20);
    expect(out.fractions.protein).toBeCloseTo(0.4);
    expect(out.fractions.carbs).toBeCloseTo(0.4);
    expect(out.fractions.fat).toBeCloseTo(0.2);
  });

  it('fractions sum to 1 for a non-empty day', () => {
    const out = macroBreakdown([{ protein_g: 31, carbs_g: 54, fat_g: 6 }]);
    const sum = out.fractions.protein + out.fractions.carbs + out.fractions.fat;
    expect(sum).toBeCloseTo(1);
  });

  it('returns all-zero fractions (no NaN) for an empty day', () => {
    const out = macroBreakdown([]);
    expect(out).toEqual({
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fractions: { protein: 0, carbs: 0, fat: 0 },
    });
  });

  it('defaults a missing argument to all zeros', () => {
    expect(macroBreakdown()).toEqual({
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fractions: { protein: 0, carbs: 0, fat: 0 },
    });
  });

  it('treats missing macro fields as zero', () => {
    const out = macroBreakdown([{ protein_g: 20 }]);
    expect(out).toEqual({
      protein_g: 20,
      carbs_g: 0,
      fat_g: 0,
      fractions: { protein: 1, carbs: 0, fat: 0 },
    });
  });
});

describe('weeklyAvgProtein', () => {
  it('averages protein over LOGGED days within each ISO week, not over 7', () => {
    // 2026-06-01 is a Monday → ISO week starts 2026-06-01.
    const entries = [
      { logged_on: '2026-06-01', protein_g: 100 },
      { logged_on: '2026-06-03', protein_g: 200 },
    ];
    const out = weeklyAvgProtein(entries, { asOf: '2026-06-07' });
    expect(out).toEqual([{ weekStart: '2026-06-01', avgProteinG: 150 }]);
  });

  it('sums multiple entries on the same day before averaging across days', () => {
    const entries = [
      { logged_on: '2026-06-01', protein_g: 60 },
      { logged_on: '2026-06-01', protein_g: 40 },
      { logged_on: '2026-06-02', protein_g: 200 },
    ];
    // day1 total = 100, day2 total = 200 → mean over 2 logged days = 150.
    const out = weeklyAvgProtein(entries, { asOf: '2026-06-07' });
    expect(out).toEqual([{ weekStart: '2026-06-01', avgProteinG: 150 }]);
  });

  it('returns one chronological point per ISO week with logged days', () => {
    const entries = [
      { logged_on: '2026-06-10', protein_g: 50 }, // week of Mon 2026-06-08
      { logged_on: '2026-06-02', protein_g: 100 }, // week of Mon 2026-06-01
    ];
    const out = weeklyAvgProtein(entries, { asOf: '2026-06-14' });
    expect(out).toEqual([
      { weekStart: '2026-06-01', avgProteinG: 100 },
      { weekStart: '2026-06-08', avgProteinG: 50 },
    ]);
  });

  it('handles a partial week (a single logged day)', () => {
    const entries = [{ logged_on: '2026-06-04', protein_g: 175 }];
    const out = weeklyAvgProtein(entries, { asOf: '2026-06-07' });
    expect(out).toEqual([{ weekStart: '2026-06-01', avgProteinG: 175 }]);
  });

  it('returns an empty array for no entries', () => {
    expect(weeklyAvgProtein([], { asOf: '2026-06-07' })).toEqual([]);
  });

  it('places a Sunday into the ISO week starting the preceding Monday', () => {
    // 2026-06-07 is a Sunday → ISO week start 2026-06-01.
    const entries = [{ logged_on: '2026-06-07', protein_g: 80 }];
    const out = weeklyAvgProtein(entries, { asOf: '2026-06-07' });
    expect(out).toEqual([{ weekStart: '2026-06-01', avgProteinG: 80 }]);
  });
});
