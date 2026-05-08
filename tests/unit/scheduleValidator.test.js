// Phase 2 US2 (T025): pure-validator tests for FR-008.
import { describe, it, expect } from 'vitest';
import { validateSchedule, ERROR_CODES } from '../../services/scheduleValidator.js';

const baseSlot = { day_of_week: 1, muscle_group_id: 1, display_order: 1, exercises: [] };

describe('validateSchedule', () => {
  it('accepts a valid 1-day schedule', () => {
    expect(validateSchedule({ slots: [baseSlot] })).toEqual({ ok: true });
  });

  it('accepts a valid 7-day schedule with distinct days and muscle groups', () => {
    const slots = Array.from({ length: 7 }, (_, i) => ({
      day_of_week: i + 1,
      muscle_group_id: i + 100,
      display_order: i + 1,
      exercises: [],
    }));
    expect(validateSchedule({ slots, active_days: 7 })).toEqual({ ok: true });
  });

  it('rejects zero days', () => {
    const result = validateSchedule({ slots: [] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.ZERO_DAYS)).toBe(true);
  });

  it('rejects more than seven days', () => {
    const slots = Array.from({ length: 8 }, (_, i) => ({
      day_of_week: ((i % 7) + 1),
      muscle_group_id: i + 100,
    }));
    const result = validateSchedule({ slots });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.TOO_MANY_DAYS)).toBe(true);
  });

  it('rejects invalid day_of_week', () => {
    const result = validateSchedule({ slots: [{ ...baseSlot, day_of_week: 9 }] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.INVALID_DAY_OF_WEEK)).toBe(true);
  });

  it('rejects duplicate day_of_week', () => {
    const result = validateSchedule({
      slots: [
        { day_of_week: 2, muscle_group_id: 1 },
        { day_of_week: 2, muscle_group_id: 2 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_DAY)).toBe(true);
  });

  it('rejects duplicate muscle_group_id within the same week', () => {
    const result = validateSchedule({
      slots: [
        { day_of_week: 1, muscle_group_id: 7 },
        { day_of_week: 2, muscle_group_id: 7 },
      ],
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.DUPLICATE_MUSCLE_GROUP)).toBe(true);
  });

  it('rejects slots missing muscle_group_id', () => {
    const result = validateSchedule({ slots: [{ day_of_week: 1 }] });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.MISSING_MUSCLE_GROUP_ID)).toBe(true);
  });

  it('rejects active_days mismatch', () => {
    const result = validateSchedule({ slots: [baseSlot], active_days: 3 });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === ERROR_CODES.ACTIVE_DAYS_MISMATCH)).toBe(true);
  });
});
