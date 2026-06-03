import { describe, it, expect } from 'vitest';
import { buildOverview } from '../../services/loadTracking/overviewView.js';
import { oneRmSeries } from '../../services/engine/trendProjection.js';

const now = new Date('2026-05-31T00:00:00Z');
function rec(date, w, est) {
  return {
    created_at: `${date}T08:00:00Z`,
    source_weight_kg: w,
    source_reps: 5,
    primary_estimate_kg: est,
  };
}

describe('buildOverview', () => {
  const exercises = [
    { id: 101, slug: 'bench', name: 'Bench', is_active: true },
    { id: 102, slug: 'squat', name: 'Squat', is_active: true },
  ];

  it('composes load/record/volume/trend/status and the ready increment', () => {
    const view = buildOverview({
      exercises,
      seriesByExerciseId: new Map([
        [101, oneRmSeries([rec('2026-05-05', 80, 90), rec('2026-05-28', 85, 96)])],
        [102, []],
      ]),
      lastSessionVolumeByExerciseId: new Map([[101, 1280]]),
      exerciseFlagByExerciseId: new Map([
        [101, { flag_type: 'add_load', suggested_adjustment: { delta_kg: 2.5 } }],
      ]),
      muscleGroupFlagTypeByExerciseId: new Map([[102, 'stagnation']]),
      muscleGroupByExerciseId: new Map([[101, { name: 'Chest', color: '#E54D2E' }]]),
      deloadNotices: [{ name: 'Legs', color: '#3E63DD' }],
      now,
    });

    const bench = view.exercises.find((e) => e.exercise_id === 101);
    expect(bench).toMatchObject({
      current_load_kg: 85,
      all_time_record_kg: 85,
      last_session_volume_kg: 1280,
      status: 'ready_to_increase',
      status_increment_kg: 2.5,
    });
    expect(bench.trend.direction).toBe('up');

    const squat = view.exercises.find((e) => e.exercise_id === 102);
    expect(squat).toMatchObject({
      current_load_kg: null,
      all_time_record_kg: null,
      status: 'stagnation',
      status_increment_kg: null,
      trend: null,
    });

    expect(view.deload_notices).toHaveLength(1);
    expect(view.empty).toBe(false);
  });

  it('empty:true when no exercise has any history', () => {
    const view = buildOverview({ exercises, seriesByExerciseId: new Map(), now });
    expect(view.empty).toBe(true);
    expect(view.exercises.every((e) => e.status === 'maintain')).toBe(true);
  });
});
