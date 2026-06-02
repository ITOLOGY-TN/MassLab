import { describe, it, expect } from 'vitest';
import { detectPersonalRecords } from '../../services/engine/personalRecords.js';

describe('detectPersonalRecords', () => {
  const sets = [
    { weight_kg: 80, reps: 5, completed: true },
    { weight_kg: 70, reps: 8, completed: true },
    { weight_kg: 95, reps: 3, completed: false }, // incomplete → ignored
  ];

  it('flags a weight PR when the heaviest completed set beats the prior best', () => {
    const prs = detectPersonalRecords({
      exerciseId: 1,
      name: 'Bench',
      sessionCompletedSets: sets,
      priorHeaviestCompletedSet: { weight_kg: 77.5 },
      priorBestEstimate1rmKg: 999, // suppress the 1RM PR to isolate weight
    });
    expect(prs.find((p) => p.kind === 'weight')).toMatchObject({
      value_kg: 80,
      previous_kg: 77.5,
    });
  });

  it('flags a 1RM PR when the estimate beats the prior best', () => {
    const prs = detectPersonalRecords({
      exerciseId: 1,
      sessionCompletedSets: sets,
      priorHeaviestCompletedSet: { weight_kg: 999 }, // suppress weight PR
      priorBestEstimate1rmKg: 80,
    });
    const oneRm = prs.find((p) => p.kind === 'estimated_1rm');
    expect(oneRm).toBeTruthy();
    expect(oneRm.value_kg).toBeGreaterThan(80);
  });

  it('treats first-ever history as PRs', () => {
    const prs = detectPersonalRecords({ exerciseId: 1, sessionCompletedSets: sets });
    expect(prs.map((p) => p.kind).sort()).toEqual(['estimated_1rm', 'weight']);
    expect(prs.every((p) => p.previous_kg === null)).toBe(true);
  });

  it('never flags a PR from incomplete sets only', () => {
    const prs = detectPersonalRecords({
      exerciseId: 1,
      sessionCompletedSets: [{ weight_kg: 200, reps: 1, completed: false }],
    });
    expect(prs).toEqual([]);
  });
});
