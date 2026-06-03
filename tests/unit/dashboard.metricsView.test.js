import { describe, it, expect } from 'vitest';
import { build } from '../../services/dashboard/metricsView.js';

// Phase 10 (013-phase10-dashboard) T018 — pure metrics-card assembler (data-model §3c,
// FR-018). Shapes the four quick metric cards (weight, calories, streak, phase) and
// null/empty-flags each card when its source data is missing. No I/O, no clock, no
// globals: the controller injects already-resolved inputs.
//
// Inputs (as resolved by the controller from existing readers):
//   weight   : { current_kg, start_kg } | null   → derives delta_kg
//   calories : { yesterday_kcal, target_kcal } | null → derives delta_kcal + over
//   streak   : { count }                          → always present (cold-start = 0)
//   phase    : { name, days_remaining } | null

describe('metricsView.build', () => {
  it('shapes all four cards when every source is present', () => {
    const out = build({
      weight: { current_kg: 60.2, start_kg: 58.0 },
      calories: { yesterday_kcal: 2900, target_kcal: 3300 },
      streak: { count: 4 },
      phase: { name: 'Hypertrophie', days_remaining: 19 },
    });

    expect(out).toEqual({
      weight: { current_kg: 60.2, start_kg: 58.0, delta_kg: 2.2 },
      calories: { yesterday_kcal: 2900, target_kcal: 3300, delta_kcal: -400, over: false },
      streak: { count: 4 },
      phase: { name: 'Hypertrophie', days_remaining: 19 },
    });
  });

  it('weight: derives a signed delta_kg vs. start (loss is negative)', () => {
    const out = build({
      weight: { current_kg: 57.5, start_kg: 60.0 },
      streak: { count: 0 },
    });
    expect(out.weight).toEqual({ current_kg: 57.5, start_kg: 60.0, delta_kg: -2.5 });
  });

  it('calories: over=true when yesterday exceeds the target, delta positive', () => {
    const out = build({
      calories: { yesterday_kcal: 3500, target_kcal: 3300 },
      streak: { count: 1 },
    });
    expect(out.calories).toEqual({
      yesterday_kcal: 3500,
      target_kcal: 3300,
      delta_kcal: 200,
      over: true,
    });
  });

  it('calories: exactly on target is not over (delta 0)', () => {
    const out = build({
      calories: { yesterday_kcal: 3300, target_kcal: 3300 },
      streak: { count: 0 },
    });
    expect(out.calories).toEqual({
      yesterday_kcal: 3300,
      target_kcal: 3300,
      delta_kcal: 0,
      over: false,
    });
  });

  it('weight: null when its source is missing (FR-018)', () => {
    const out = build({
      weight: null,
      calories: { yesterday_kcal: 2900, target_kcal: 3300 },
      streak: { count: 2 },
      phase: { name: 'Force', days_remaining: 5 },
    });
    expect(out.weight).toBeNull();
  });

  it('calories: null when its source is missing (FR-018)', () => {
    const out = build({
      weight: { current_kg: 60, start_kg: 58 },
      calories: null,
      streak: { count: 2 },
    });
    expect(out.calories).toBeNull();
  });

  it('phase: null when no current phase (FR-018)', () => {
    const out = build({
      weight: { current_kg: 60, start_kg: 58 },
      streak: { count: 2 },
      phase: null,
    });
    expect(out.phase).toBeNull();
  });

  it('streak: defaults to { count: 0 } when absent (cold-start, never null)', () => {
    const out = build({});
    expect(out.streak).toEqual({ count: 0 });
  });

  it('cold-start: every card null/empty without error (SC-009)', () => {
    const out = build({ weight: null, calories: null, streak: { count: 0 }, phase: null });
    expect(out).toEqual({
      weight: null,
      calories: null,
      streak: { count: 0 },
      phase: null,
    });
  });

  it('tolerates a fully missing input bag (defensive)', () => {
    const out = build();
    expect(out).toEqual({
      weight: null,
      calories: null,
      streak: { count: 0 },
      phase: null,
    });
  });

  it('weight: rounds the derived delta to avoid float noise', () => {
    const out = build({
      weight: { current_kg: 58.4, start_kg: 58.1 },
      streak: { count: 0 },
    });
    expect(out.weight.delta_kg).toBe(0.3);
  });
});
