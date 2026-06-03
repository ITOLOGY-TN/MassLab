import { describe, it, expect } from 'vitest';
import { buildPhaseRadar } from '../../services/loadTracking/phaseRadarView.js';

const phases = [
  { slug: 'foundation', name: 'Foundation', weeks: 4, display_order: 1 },
  { slug: 'hypertrophy', name: 'Hypertrophy', weeks: 8, display_order: 2 },
];
const muscleGroups = [
  { name: 'Chest', color: '#E54D2E' },
  { name: 'Legs', color: '#3E63DD' },
];
const exerciseMuscleGroup = new Map([
  [101, 'Chest'],
  [201, 'Legs'],
]);
const programStartDate = '2026-01-01';

function rec(exId, date, w) {
  return { exercise_id: exId, created_at: `${date}T08:00:00Z`, source_weight_kg: w };
}

describe('buildPhaseRadar', () => {
  it('averages per-day top working load per muscle group, bucketed by phase', () => {
    const records = [
      // Foundation (weeks 0–3 → Jan): Chest two days 80, 90 → avg 85
      rec(101, '2026-01-03', 80),
      rec(101, '2026-01-10', 90),
      // Hypertrophy (weeks 4–11 → Feb+): Legs one day 120
      rec(201, '2026-02-10', 120),
    ];
    const view = buildPhaseRadar({
      records,
      exerciseMuscleGroup,
      muscleGroups,
      phases,
      programStartDate,
    });

    expect(view.muscle_groups.map((m) => m.name)).toEqual(['Chest', 'Legs']);
    expect(view.phases.map((p) => p.slug)).toEqual(['foundation', 'hypertrophy']); // ordered by display_order
    const foundation = view.phases.find((p) => p.slug === 'foundation');
    expect(foundation.values).toEqual([
      { muscle_group: 'Chest', avg_working_load_kg: 85 },
      { muscle_group: 'Legs', avg_working_load_kg: 0 }, // absent → 0
    ]);
    expect(view.empty).toBe(false);
  });

  it('collapses same-day records to the day max before averaging', () => {
    const records = [
      rec(101, '2026-01-03', 70),
      rec(101, '2026-01-03', 95), // same day, same group → only the 95 counts that day
      rec(201, '2026-02-10', 120), // a second phase so the view is not empty
    ];
    const view = buildPhaseRadar({
      records,
      exerciseMuscleGroup,
      muscleGroups,
      phases,
      programStartDate,
    });
    const foundation = view.phases.find((p) => p.slug === 'foundation');
    expect(foundation.values.find((v) => v.muscle_group === 'Chest').avg_working_load_kg).toBe(95);
  });

  it('empty:true when fewer than two phases have data', () => {
    const records = [rec(101, '2026-01-03', 80)];
    const view = buildPhaseRadar({
      records,
      exerciseMuscleGroup,
      muscleGroups,
      phases,
      programStartDate,
    });
    expect(view.empty).toBe(true);
    expect(view.phases).toHaveLength(1);
  });
});
