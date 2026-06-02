import { describe, it, expect } from 'vitest';
import { buildWeekView } from '../../services/trainingProgram/weekView.js';

const muscleGroups = [
  { id: 10, name: 'Chest + Triceps', display_color: '#E54D2E' },
  { id: 11, name: 'Back + Biceps', display_color: '#3E63DD' },
];

const slots = [
  { id: 1, day_of_week: 1, muscle_group_id: 10, display_color: '#E54D2E', exercises: [{}, {}, {}] },
  { id: 2, day_of_week: 3, muscle_group_id: 11, display_color: '#3E63DD', exercises: [] },
];

describe('trainingProgram.weekView — buildWeekView (FR-001..FR-006)', () => {
  it('always returns 7 day entries in week order', () => {
    const out = buildWeekView({ slots, muscleGroups });
    expect(out.days).toHaveLength(7);
    expect(out.days.map((d) => d.day_of_week)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('marks configured days as training with muscle group, color, and count', () => {
    const out = buildWeekView({ slots, muscleGroups });
    const mon = out.days[0];
    expect(mon).toMatchObject({
      day_of_week: 1,
      kind: 'training',
      slot_id: 1,
      exercise_count: 3,
    });
    expect(mon.muscle_group).toEqual({ name: 'Chest + Triceps', color: '#E54D2E' });
  });

  it('allows a training day with zero exercises (FR-002 edge case)', () => {
    const out = buildWeekView({ slots, muscleGroups });
    const wed = out.days[2];
    expect(wed.kind).toBe('training');
    expect(wed.exercise_count).toBe(0);
  });

  it('renders unconfigured days as rest with null fields', () => {
    const out = buildWeekView({ slots, muscleGroups });
    expect(out.days[1]).toEqual({
      day_of_week: 2,
      kind: 'rest',
      slot_id: null,
      muscle_group: null,
      exercise_count: null,
    });
  });

  it('reports training_day_count and empty=false', () => {
    const out = buildWeekView({ slots, muscleGroups });
    expect(out.training_day_count).toBe(2);
    expect(out.empty).toBe(false);
  });

  it('flags empty=true when no training days are configured (FR-006)', () => {
    const out = buildWeekView({ slots: [], muscleGroups });
    expect(out.training_day_count).toBe(0);
    expect(out.empty).toBe(true);
    expect(out.days.every((d) => d.kind === 'rest')).toBe(true);
  });

  it('falls back gracefully when a slot references an unknown muscle group', () => {
    const out = buildWeekView({
      slots: [{ id: 9, day_of_week: 5, muscle_group_id: 999, display_color: '#000000' }],
      muscleGroups,
    });
    expect(out.days[4].muscle_group).toEqual({ name: 'Unassigned', color: '#000000' });
  });
});
