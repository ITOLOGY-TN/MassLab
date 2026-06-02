import { describe, it, expect } from 'vitest';
import { isoDayOfWeek, isSameAppDay } from '../../services/sessionJournal/calendar.js';

describe('isoDayOfWeek', () => {
  it('maps Monday→1 … Sunday→7 (local construction)', () => {
    // 2026-06-01 is a Monday.
    expect(isoDayOfWeek(new Date(2026, 5, 1))).toBe(1);
    expect(isoDayOfWeek(new Date(2026, 5, 3))).toBe(3); // Wednesday
    expect(isoDayOfWeek(new Date(2026, 5, 6))).toBe(6); // Saturday
    expect(isoDayOfWeek(new Date(2026, 5, 7))).toBe(7); // Sunday → 7, not 0
  });
});

describe('isSameAppDay', () => {
  it('true for two instants on the same calendar day', () => {
    expect(isSameAppDay(new Date(2026, 5, 2, 7, 0), new Date(2026, 5, 2, 22, 30))).toBe(true);
  });
  it('false across day boundaries', () => {
    expect(isSameAppDay(new Date(2026, 5, 1, 23, 0), new Date(2026, 5, 2, 1, 0))).toBe(false);
  });
});
