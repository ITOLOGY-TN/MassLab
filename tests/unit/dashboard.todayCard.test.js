import { describe, it, expect } from 'vitest';
import { build } from '../../services/dashboard/todayCard.js';

// Phase 10 (013-phase10-dashboard) T006 — pure today-card presenter (data-model §3a,
// FR-001/FR-002/FR-003, SC-002). Given today's slot, whether it is a rest day, the
// session state, and the day's exercises, it produces the muscle group, the first three
// exercises in order, a session state, and the matching CTA. No I/O.

const SLOT = { day_of_week: 1, muscle_group: 'Pectoraux + Triceps' };

const EXERCISES = [
  { id: 12, name: 'Développé couché' },
  { id: 13, name: 'Développé incliné haltères' },
  { id: 14, name: 'Dips' },
  { id: 15, name: 'Extension triceps poulie' },
];

describe('todayCard.build', () => {
  it('training day, not started → start CTA with muscle group + first 3 exercises', () => {
    const card = build({
      slot: SLOT,
      isRestDay: false,
      sessionState: 'not_started',
      exercises: EXERCISES,
    });

    expect(card.is_rest).toBe(false);
    expect(card.muscle_group).toBe('Pectoraux + Triceps');
    expect(card.day_of_week).toBe(1);
    expect(card.state).toBe('not_started');
    expect(card.cta).toBe('start');
  });

  it('surfaces only the first three exercises, in planned order', () => {
    const card = build({
      slot: SLOT,
      isRestDay: false,
      sessionState: 'not_started',
      exercises: EXERCISES,
    });

    expect(card.exercises).toEqual([
      { id: 12, name: 'Développé couché' },
      { id: 13, name: 'Développé incliné haltères' },
      { id: 14, name: 'Dips' },
    ]);
  });

  it('returns fewer than three when the day has fewer exercises', () => {
    const card = build({
      slot: SLOT,
      isRestDay: false,
      sessionState: 'not_started',
      exercises: EXERCISES.slice(0, 2),
    });

    expect(card.exercises).toEqual([
      { id: 12, name: 'Développé couché' },
      { id: 13, name: 'Développé incliné haltères' },
    ]);
  });

  it('in-progress session → resume CTA (FR-002)', () => {
    const card = build({
      slot: SLOT,
      isRestDay: false,
      sessionState: 'in_progress',
      exercises: EXERCISES,
    });

    expect(card.state).toBe('in_progress');
    expect(card.cta).toBe('resume');
    expect(card.is_rest).toBe(false);
  });

  it('finished session → review CTA, not a start (FR-002)', () => {
    const card = build({
      slot: SLOT,
      isRestDay: false,
      sessionState: 'finished',
      exercises: EXERCISES,
    });

    expect(card.state).toBe('finished');
    expect(card.cta).toBe('review');
  });

  it('rest day → rest state, no CTA, no muscle group, no exercises (FR-003)', () => {
    const card = build({
      slot: null,
      isRestDay: true,
      sessionState: 'not_started',
      exercises: [],
    });

    expect(card.is_rest).toBe(true);
    expect(card.state).toBe('rest');
    expect(card.cta).toBeNull();
    expect(card.muscle_group).toBeNull();
    expect(card.exercises).toEqual([]);
    expect(card.day_of_week).toBeNull();
  });

  it('rest day overrides any session state (rest takes precedence)', () => {
    const card = build({
      slot: SLOT,
      isRestDay: true,
      sessionState: 'in_progress',
      exercises: EXERCISES,
    });

    expect(card.is_rest).toBe(true);
    expect(card.state).toBe('rest');
    expect(card.cta).toBeNull();
  });

  it('carries the slot day_of_week through on a training day', () => {
    const card = build({
      slot: { day_of_week: 4, muscle_group: 'Dos + Biceps' },
      isRestDay: false,
      sessionState: 'not_started',
      exercises: EXERCISES,
    });

    expect(card.day_of_week).toBe(4);
    expect(card.muscle_group).toBe('Dos + Biceps');
  });

  it('defaults to a rest-like empty card when no slot and not a rest day (cold start)', () => {
    const card = build({});

    expect(card.muscle_group).toBeNull();
    expect(card.exercises).toEqual([]);
  });

  it('defaults the session state to not_started on a training day when omitted', () => {
    const card = build({ slot: SLOT, isRestDay: false, exercises: EXERCISES });

    expect(card.state).toBe('not_started');
    expect(card.cta).toBe('start');
  });
});
