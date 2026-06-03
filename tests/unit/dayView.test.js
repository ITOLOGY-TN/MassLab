import { describe, it, expect } from 'vitest';
import { build } from '../../services/nutrition/dayView.js';
import { dayTotals, progress } from '../../services/engine/nutritionMath.js';

const SLOT_ORDER = ['breakfast', 'lunch', 'pre_workout', 'dinner', 'evening_snack'];

const targets = { kcal: 3300, protein_g: 175, carbs_g: 430, fat_g: 90 };

describe('nutrition dayView.build', () => {
  it('returns all five slots in order with matching entries and per-slot subtotals', () => {
    const entries = [
      { id: 1, slot: 'breakfast', kcal: 300, protein_g: 10, carbs_g: 54, fat_g: 6 },
      { id: 2, slot: 'breakfast', kcal: 100, protein_g: 5, carbs_g: 10, fat_g: 2 },
      { id: 3, slot: 'dinner', kcal: 500, protein_g: 40, carbs_g: 30, fat_g: 15 },
    ];
    const hydration = { total_ml: 750, goal_ml: 3000 };

    const view = build({ entries, targets, hydration, date: '2026-06-03' });

    expect(view.date).toBe('2026-06-03');
    expect(view.slots.map((s) => s.slot)).toEqual(SLOT_ORDER);

    const breakfast = view.slots.find((s) => s.slot === 'breakfast');
    expect(breakfast.entries).toHaveLength(2);
    expect(breakfast.subtotal).toEqual(dayTotals(breakfast.entries));

    const dinner = view.slots.find((s) => s.slot === 'dinner');
    expect(dinner.entries).toHaveLength(1);
    expect(dinner.subtotal).toEqual(dayTotals(dinner.entries));

    const lunch = view.slots.find((s) => s.slot === 'lunch');
    expect(lunch.entries).toEqual([]);
    expect(lunch.subtotal).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

    expect(view.totals).toEqual(dayTotals(entries));
    expect(view.bars).toEqual(progress(view.totals, targets));
    expect(view.hydration).toEqual(hydration);
  });

  it('handles the empty day: all slots present with zero subtotals, totals zero, bars present (FR-009/FR-027)', () => {
    const hydration = { total_ml: 0, goal_ml: 3000 };

    const view = build({ entries: [], targets, hydration, date: '2026-06-03' });

    expect(view.slots).toHaveLength(5);
    expect(view.slots.map((s) => s.slot)).toEqual(SLOT_ORDER);
    for (const slot of view.slots) {
      expect(slot.entries).toEqual([]);
      expect(slot.subtotal).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    }
    expect(view.totals).toEqual({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });
    expect(view.bars).toEqual(progress({ kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }, targets));
    expect(view.hydration).toEqual(hydration);
  });

  it('is null-safe when targets are unset (graceful empty/low-data, FR-009)', () => {
    const view = build({ entries: [], targets: {}, hydration: { total_ml: 0, goal_ml: 3000 } });
    expect(view.bars.kcal.target).toBeNull();
    expect(view.bars.kcal.state).toBe('under');
  });

  it('does not throw when called with no arguments', () => {
    expect(() => build()).not.toThrow();
  });
});
