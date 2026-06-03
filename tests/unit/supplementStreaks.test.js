import { describe, it, expect } from 'vitest';
import { streakForSupplement } from '../../services/engine/supplementStreaks.js';

// Phase 8 (011-phase8-supplements) T018 — pure streak math (research D-5).
// Consecutive taken days ending at the most recent applicable day; today-not-taken
// does not break an existing streak; a fully-elapsed gap resets; never counts a
// date before program_start_date; never-taken = 0.

const PROGRAM_START = '2026-05-01';

describe('streakForSupplement', () => {
  it('counts N consecutive taken days including today', () => {
    const taken = new Set(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(streakForSupplement(taken, { asOf: '2026-06-03', programStart: PROGRAM_START })).toBe(3);
  });

  it('does not break when today is not yet taken (counts the run ending yesterday)', () => {
    const taken = new Set(['2026-06-01', '2026-06-02']);
    // asOf = 2026-06-03 (today, not in the set) → run ending 2026-06-02 = 2.
    expect(streakForSupplement(taken, { asOf: '2026-06-03', programStart: PROGRAM_START })).toBe(2);
  });

  it('resets after a fully-elapsed missed day, counting only the run after it', () => {
    // 2026-06-02 is a missed elapsed day; only 2026-06-03 counts.
    const taken = new Set(['2026-05-31', '2026-06-01', '2026-06-03']);
    expect(streakForSupplement(taken, { asOf: '2026-06-03', programStart: PROGRAM_START })).toBe(1);
  });

  it('never counts a date earlier than program_start_date', () => {
    const taken = new Set(['2026-04-29', '2026-04-30', '2026-05-01']);
    // programStart = 2026-05-01 → only that day counts, not the two before it.
    expect(streakForSupplement(taken, { asOf: '2026-05-01', programStart: '2026-05-01' })).toBe(1);
  });

  it('returns 0 when the supplement has never been taken', () => {
    expect(streakForSupplement(new Set(), { asOf: '2026-06-03', programStart: PROGRAM_START })).toBe(
      0,
    );
  });

  it('accepts an array of dates as well as a Set', () => {
    expect(
      streakForSupplement(['2026-06-02', '2026-06-03'], {
        asOf: '2026-06-03',
        programStart: PROGRAM_START,
      }),
    ).toBe(2);
  });
});
