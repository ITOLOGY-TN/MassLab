import { describe, it, expect } from 'vitest';
import { oneRepMaxTrend } from '../../services/engine/oneRepMaxTrend.js';
import { DEFAULTS } from '../../services/engine/constants.js';

const NOW = new Date(Date.UTC(2026, 4, 7));

function daysAgo(n) {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

describe('engine.oneRepMaxTrend', () => {
  it('returns delta_pct + on_pace when ≥ 1 record older than ~30 days exists', () => {
    const records = [
      { exercise_id: 1, primary_estimate_kg: 100, created_at: daysAgo(35) },
      { exercise_id: 1, primary_estimate_kg: 105, created_at: daysAgo(0) },
    ];
    const out = oneRepMaxTrend({ records, now: NOW, constants: DEFAULTS });
    expect(out.delta_pct).toBeCloseTo(5.0, 1);
    expect(out.on_pace).toBe(true);
  });

  it('on_pace = false when delta_pct below the configured threshold', () => {
    const records = [
      { exercise_id: 1, primary_estimate_kg: 100, created_at: daysAgo(35) },
      { exercise_id: 1, primary_estimate_kg: 101, created_at: daysAgo(0) },
    ];
    const out = oneRepMaxTrend({ records, now: NOW, constants: DEFAULTS });
    expect(out.delta_pct).toBeCloseTo(1.0, 1);
    expect(out.on_pace).toBe(false);
  });

  it('returns nulls when no record older than 25 days exists (insufficient history)', () => {
    const records = [
      { exercise_id: 1, primary_estimate_kg: 100, created_at: daysAgo(20) },
      { exercise_id: 1, primary_estimate_kg: 105, created_at: daysAgo(0) },
    ];
    const out = oneRepMaxTrend({ records, now: NOW, constants: DEFAULTS });
    expect(out.delta_pct).toBeNull();
    expect(out.on_pace).toBeNull();
  });

  it('returns nulls for an empty record list', () => {
    const out = oneRepMaxTrend({ records: [], now: NOW, constants: DEFAULTS });
    expect(out.delta_pct).toBeNull();
    expect(out.on_pace).toBeNull();
  });

  it('is deterministic across calls', () => {
    const records = [
      { exercise_id: 1, primary_estimate_kg: 100, created_at: daysAgo(35) },
      { exercise_id: 1, primary_estimate_kg: 105, created_at: daysAgo(0) },
    ];
    const a = oneRepMaxTrend({ records, now: NOW, constants: DEFAULTS });
    const b = oneRepMaxTrend({ records, now: NOW, constants: DEFAULTS });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
