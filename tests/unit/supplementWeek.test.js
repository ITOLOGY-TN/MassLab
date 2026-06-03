import { describe, it, expect } from 'vitest';
import { isoWeekStart, weekDays, isCurrentIsoWeek } from '../../services/supplements/week.js';

// Phase 8 (011-phase8-supplements) T004 — pure ISO-week helpers (research D-6).
// Weeks are Monday–Sunday, consistent with the app's isoDayOfWeek convention.
// Dates are YYYY-MM-DD strings anchored at UTC midnight (no DST/locale drift),
// matching the nutrition controller's date arithmetic.

describe('isoWeekStart', () => {
  it('returns the same day when given a Monday', () => {
    // 2026-06-01 is a Monday.
    expect(isoWeekStart('2026-06-01')).toBe('2026-06-01');
  });

  it('snaps a mid-week day back to its Monday', () => {
    // 2026-06-03 is a Wednesday → Monday 2026-06-01.
    expect(isoWeekStart('2026-06-03')).toBe('2026-06-01');
  });

  it('snaps a Sunday back to the PRECEDING Monday (ISO week, not US week)', () => {
    // 2026-06-07 is a Sunday → still the 2026-06-01 ISO week.
    expect(isoWeekStart('2026-06-07')).toBe('2026-06-01');
  });

  it('crosses a month boundary correctly', () => {
    // 2026-06-01 is a Monday; the prior Sunday 2026-05-31 belongs to the
    // 2026-05-25 ISO week.
    expect(isoWeekStart('2026-05-31')).toBe('2026-05-25');
  });
});

describe('weekDays', () => {
  it('returns 7 ascending ISO dates starting at the week Monday', () => {
    expect(weekDays('2026-06-01')).toEqual([
      '2026-06-01',
      '2026-06-02',
      '2026-06-03',
      '2026-06-04',
      '2026-06-05',
      '2026-06-06',
      '2026-06-07',
    ]);
  });
});

describe('isCurrentIsoWeek', () => {
  it('is true for any day within the same ISO week as asOf', () => {
    expect(isCurrentIsoWeek('2026-06-01', '2026-06-03')).toBe(true); // Mon vs Wed
    expect(isCurrentIsoWeek('2026-06-07', '2026-06-03')).toBe(true); // Sun vs Wed
  });

  it('is false for a day in a prior or future ISO week', () => {
    expect(isCurrentIsoWeek('2026-05-31', '2026-06-03')).toBe(false); // prior week's Sunday
    expect(isCurrentIsoWeek('2026-06-08', '2026-06-03')).toBe(false); // next week's Monday
  });
});
