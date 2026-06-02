import { describe, it, expect } from 'vitest';
import { buildSessionView } from '../../services/sessionJournal/sessionView.js';
import { DEFAULTS } from '../../services/engine/constants.js';

const exercisesById = new Map([
  [101, { slug: 'bench-press', name: 'Bench Press', is_active: true, targeted_muscles: ['chest'] }],
  [102, { slug: 'legs-squat', name: 'Squat', is_active: true, targeted_muscles: ['quads'] }],
]);

const plannedExercises = [
  { exercise_id: 101, position: 1, target_sets: 4, target_reps_low: 6, target_reps_high: 8 },
  { exercise_id: 102, position: 2, target_sets: 3, target_reps_low: 8, target_reps_high: 10 },
];

describe('buildSessionView', () => {
  it('composes previous weight + suggested target from history and exposes session shape', () => {
    const history = new Map([
      [
        101,
        [
          {
            id: 900,
            started_at: '2026-05-28T07:00:00Z',
            sets: [{ weight_kg: 72.5, reps: 8, completed: true }],
          },
        ],
      ],
      [102, []],
    ]);
    const view = buildSessionView({
      session: { id: 5, day_of_week: 1, started_at: '2026-06-02T07:00:00Z', sets: [] },
      plannedExercises,
      exercisesById,
      muscleGroup: { name: 'Chest + Triceps', color: '#E54D2E' },
      historyByExerciseId: history,
      activeFlagByExerciseId: new Map(),
      restSeconds: 120,
      constants: DEFAULTS,
      stale: false,
    });

    expect(view).toMatchObject({ session_id: 5, day_of_week: 1, rest_seconds: 120, stale: false });
    const bench = view.exercises.find((e) => e.exercise_id === 101);
    expect(bench.previous_weight_kg).toBe(72.5);
    expect(bench.suggested_target_kg).toBe(72.5); // no add_load flag → hold
    const squat = view.exercises.find((e) => e.exercise_id === 102);
    expect(squat.previous_weight_kg).toBeNull(); // no history → neutral
    expect(squat.suggested_target_kg).toBeNull();
  });

  it('adds add_load increment to the suggested target', () => {
    const view = buildSessionView({
      session: { id: 6, day_of_week: 1, started_at: '2026-06-02T07:00:00Z', sets: [] },
      plannedExercises: [plannedExercises[0]],
      exercisesById,
      muscleGroup: null,
      historyByExerciseId: new Map([
        [
          101,
          [
            {
              id: 1,
              started_at: '2026-05-28T07:00:00Z',
              sets: [{ weight_kg: 70, reps: 8, completed: true }],
            },
          ],
        ],
      ]),
      activeFlagByExerciseId: new Map([[101, { flag_type: 'add_load' }]]),
      restSeconds: 90,
      constants: DEFAULTS,
    });
    expect(view.exercises[0].suggested_target_kg).toBe(72.5); // 70 + 2.5 upper increment
  });

  it('appends ad-hoc exercises logged this session but not on the plan', () => {
    const view = buildSessionView({
      session: {
        id: 7,
        day_of_week: 1,
        started_at: '2026-06-02T07:00:00Z',
        sets: [
          { id: 1, exercise_id: 999, set_number: 1, weight_kg: 20, reps: 12, completed: true },
        ],
      },
      plannedExercises: [plannedExercises[0]],
      exercisesById: new Map([
        ...exercisesById,
        [999, { slug: 'curl', name: 'Curl', is_active: true }],
      ]),
      historyByExerciseId: new Map(),
      activeFlagByExerciseId: new Map(),
      restSeconds: 90,
      constants: DEFAULTS,
    });
    const adhoc = view.exercises.find((e) => e.exercise_id === 999);
    expect(adhoc).toBeTruthy();
    expect(adhoc.target_sets).toBeNull();
    expect(adhoc.sets).toHaveLength(1);
  });
});
