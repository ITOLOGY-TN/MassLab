import { describe, it, expect } from 'vitest';
import {
  heaviestCompletedSet,
  lastWeightUsed,
  recentSessions,
} from '../../services/engine/exerciseHistory.js';

const set = (weight_kg, reps, completed = true, extra = {}) => ({
  weight_kg,
  reps,
  completed,
  ...extra,
});

describe('engine.exerciseHistory — heaviestCompletedSet (FR-027, D-2)', () => {
  it('returns the heaviest completed set, ignoring incomplete ones', () => {
    const best = heaviestCompletedSet([set(60, 10), set(80, 5), set(100, 1, false)]);
    expect(best.weight_kg).toBe(80);
  });

  it('ignores non-positive weight/reps', () => {
    const best = heaviestCompletedSet([set(0, 8), set(-5, 8), set(50, 0), set(40, 6)]);
    expect(best.weight_kg).toBe(40);
  });

  it('keeps the first set on a weight tie', () => {
    const a = set(70, 8, true, { set_number: 1 });
    const b = set(70, 6, true, { set_number: 2 });
    expect(heaviestCompletedSet([a, b]).set_number).toBe(1);
  });

  it('returns null when no set qualifies', () => {
    expect(heaviestCompletedSet([])).toBeNull();
    expect(heaviestCompletedSet([set(80, 5, false)])).toBeNull();
  });
});

describe('engine.exerciseHistory — lastWeightUsed (D-2)', () => {
  const sessions = [
    { id: 1, started_at: '2026-05-20T10:00:00Z', sets: [set(70, 8), set(72.5, 6)] },
    { id: 2, started_at: '2026-05-27T10:00:00Z', sets: [set(75, 5), set(60, 10, false)] },
  ];

  it('uses the heaviest completed set in the most recent session', () => {
    expect(lastWeightUsed(sessions)).toBe(75);
  });

  it('returns the most-recent session weight, not the heaviest overall', () => {
    const heavyOlder = [
      { id: 1, started_at: '2026-05-20T10:00:00Z', sets: [set(100, 3), set(95, 5)] },
      { id: 2, started_at: '2026-05-27T10:00:00Z', sets: [set(80, 8), set(120, 1, false)] },
    ];
    expect(lastWeightUsed(heavyOlder)).toBe(80);
  });

  it('skips a most-recent session that has only incomplete sets', () => {
    const withEmptyLatest = [
      ...sessions,
      { id: 3, started_at: '2026-06-01T10:00:00Z', sets: [set(90, 3, false)] },
    ];
    expect(lastWeightUsed(withEmptyLatest)).toBe(75);
  });

  it('returns null when there is no history', () => {
    expect(lastWeightUsed([])).toBeNull();
  });
});

describe('engine.exerciseHistory — recentSessions (FR-016)', () => {
  const mk = (n) =>
    Array.from({ length: n }, (_, i) => ({
      id: i + 1,
      started_at: `2026-05-${String(i + 1).padStart(2, '0')}T10:00:00Z`,
      sets: [set(50 + i, 8)],
    }));

  it('returns at most five sessions, newest first', () => {
    const out = recentSessions(mk(8), 5);
    expect(out).toHaveLength(5);
    expect(out[0].date).toBe('2026-05-08');
    expect(out[4].date).toBe('2026-05-04');
  });

  it('normalizes each set with a completion flag and ISO date', () => {
    const out = recentSessions(
      [{ id: 9, started_at: '2026-05-28T18:30:00Z', sets: [set(80, 5, true, { rpe: 8 })] }],
      5,
    );
    expect(out[0]).toMatchObject({ session_id: 9, date: '2026-05-28' });
    expect(out[0].sets[0]).toEqual({ weight_kg: 80, reps: 5, rpe: 8, completed: true });
  });

  it('returns an empty array with no history', () => {
    expect(recentSessions([], 5)).toEqual([]);
  });
});
