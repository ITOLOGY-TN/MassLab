import { describe, it, expect } from 'vitest';
import { currentTrainingPhase } from '../../services/sessionJournal/currentPhase.js';

const phases = [
  { slug: 'foundation', weeks: 4, rest_seconds: 90, display_order: 1 },
  { slug: 'hypertrophy', weeks: 8, rest_seconds: 120, display_order: 2 },
  { slug: 'strength', weeks: 8, rest_seconds: 150, display_order: 3 },
];

describe('currentTrainingPhase', () => {
  it('returns null with no phases', () => {
    expect(currentTrainingPhase({ phases: [] })).toBeNull();
  });

  it('selects the phase whose cumulative-week bucket contains elapsed weeks', () => {
    const start = new Date(2026, 0, 1);
    // week 0 → foundation
    expect(
      currentTrainingPhase({ phases, programStartDate: start, now: new Date(2026, 0, 1) }).slug,
    ).toBe('foundation');
    // week 5 (≈ day 36) → hypertrophy (weeks 4..11)
    expect(
      currentTrainingPhase({ phases, programStartDate: start, now: new Date(2026, 1, 6) }).slug,
    ).toBe('hypertrophy');
    // week 13 → strength (weeks 12..19)
    expect(
      currentTrainingPhase({ phases, programStartDate: start, now: new Date(2026, 3, 2) }).slug,
    ).toBe('strength');
  });

  it('clamps before start → first, past end → last', () => {
    const start = new Date(2026, 0, 1);
    expect(
      currentTrainingPhase({ phases, programStartDate: start, now: new Date(2025, 11, 1) }).slug,
    ).toBe('foundation');
    expect(
      currentTrainingPhase({ phases, programStartDate: start, now: new Date(2027, 0, 1) }).slug,
    ).toBe('strength');
  });

  it('defaults to first phase when dates are missing', () => {
    expect(currentTrainingPhase({ phases }).slug).toBe('foundation');
  });
});
