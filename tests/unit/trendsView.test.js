import { describe, it, expect } from 'vitest';
import { build } from '../../services/nutrition/trendsView.js';

// Pure presenter (T046/T050). Composes the three trend chart view models from
// ranged entries (calories window + weekly protein) and a single day's entries
// (macro breakdown), reusing services/engine/nutritionTrends.js. No I/O, no clock —
// the caller supplies asOf/days. Asserts the low/no-data shape (FR-020).

const asOf = '2026-06-03';

describe('trendsView.build', () => {
  it('composes calories points, macroBreakdown, and weeklyProtein from entries', () => {
    const rangeEntries = [
      { logged_on: '2026-06-01', kcal: 3000, protein_g: 150 },
      { logged_on: '2026-06-01', kcal: 200, protein_g: 20 },
      { logged_on: '2026-06-03', kcal: 2500, protein_g: 180 },
    ];
    const dayEntries = [
      { protein_g: 175, carbs_g: 430, fat_g: 90 },
      { protein_g: 25, carbs_g: 0, fat_g: 10 },
    ];

    const out = build({ rangeEntries, dayEntries, goalKcal: 3300, days: 30, asOf });

    expect(out).toHaveProperty('calories');
    expect(out).toHaveProperty('macroBreakdown');
    expect(out).toHaveProperty('weeklyProtein');

    // calories: date-asc points + goal passthrough
    expect(out.calories.goalKcal).toBe(3300);
    expect(Array.isArray(out.calories.points)).toBe(true);
    expect(out.calories.points.length).toBeGreaterThan(0);
    out.calories.points.forEach((p) => {
      expect(p).toHaveProperty('date');
      expect(typeof p.kcal).toBe('number');
    });
    const found = out.calories.points.find((p) => p.date === '2026-06-01');
    expect(found.kcal).toBe(3200);

    // macroBreakdown: summed day macros + fractions summing ~1
    expect(out.macroBreakdown.protein_g).toBe(200);
    expect(out.macroBreakdown.carbs_g).toBe(430);
    expect(out.macroBreakdown.fat_g).toBe(100);
    expect(out.macroBreakdown).toHaveProperty('fractions');
    const f = out.macroBreakdown.fractions;
    expect(f.protein + f.carbs + f.fat).toBeCloseTo(1, 5);

    // weeklyProtein: one bucket per week with avgProteinG
    expect(Array.isArray(out.weeklyProtein)).toBe(true);
    out.weeklyProtein.forEach((w) => {
      expect(w).toHaveProperty('weekStart');
      expect(typeof w.avgProteinG).toBe('number');
    });
  });

  it('passes goalKcal through as null when unset', () => {
    const out = build({ rangeEntries: [], dayEntries: [], goalKcal: null, days: 30, asOf });
    expect(out.calories.goalKcal).toBeNull();
  });

  it('renders the empty/low-data shape without throwing', () => {
    const out = build({ asOf });
    expect(out.calories).toBeDefined();
    expect(Array.isArray(out.calories.points)).toBe(true);
    expect(out.macroBreakdown).toBeDefined();
    expect(Array.isArray(out.weeklyProtein)).toBe(true);
    expect(out.weeklyProtein).toEqual([]);
  });

  it('defaults to an empty arg object without throwing', () => {
    expect(() => build()).not.toThrow();
    const out = build();
    expect(out.calories.goalKcal).toBeNull();
    expect(out.calories.points).toEqual([]);
  });
});
