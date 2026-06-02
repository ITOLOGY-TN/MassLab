import { describe, it, expect } from 'vitest';
import { buildPostSessionSummary } from '../../services/sessionJournal/summaryView.js';

describe('buildPostSessionSummary', () => {
  const session = {
    id: 9,
    started_at: '2026-06-02T07:00:00Z',
    ended_at: '2026-06-02T08:02:00Z', // 62 min = 3720 s
    note: 'strong',
    energy_rating: 4,
  };
  const completedSets = [
    { exercise_id: 101, weight_kg: 80, reps: 5, completed: true },
    { exercise_id: 101, weight_kg: 70, reps: 8, completed: true },
  ];
  const exercisesById = new Map([[101, { name: 'Bench Press' }]]);

  it('reports duration, total volume, top performance, note and energy', () => {
    const summary = buildPostSessionSummary({
      session,
      completedSets,
      exercisesById,
      personalRecords: [{ exercise_id: 101, kind: 'weight', value_kg: 80, previous_kg: 77.5 }],
      engineCounts: { progression_flags_updated: 1, one_rep_max_records_created: 1 },
    });
    expect(summary.duration_seconds).toBe(3720);
    expect(summary.total_volume_kg).toBe(80 * 5 + 70 * 8);
    expect(summary.top_performance).toMatchObject({
      exercise_id: 101,
      name: 'Bench Press',
      weight_kg: 80,
      reps: 5,
    });
    expect(summary.energy_rating).toBe(4);
    expect(summary.note).toBe('strong');
    expect(summary.personal_records).toHaveLength(1);
    expect(summary.engine).toEqual({
      progression_flags_updated: 1,
      one_rep_max_records_created: 1,
    });
  });

  it('null top performance when no completed sets', () => {
    const summary = buildPostSessionSummary({ session, completedSets: [], exercisesById });
    expect(summary.top_performance).toBeNull();
    expect(summary.total_volume_kg).toBe(0);
  });
});
