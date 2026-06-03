import { describe, it, expect } from 'vitest';
import { buildExerciseProgress } from '../../services/loadTracking/exerciseProgressView.js';
import { oneRmSeries } from '../../services/engine/trendProjection.js';

function rec(date, w, est) {
  return {
    created_at: `${date}T08:00:00Z`,
    source_weight_kg: w,
    source_reps: 5,
    primary_estimate_kg: est,
  };
}

describe('buildExerciseProgress', () => {
  const exercise = { id: 101, slug: 'bench', name: 'Bench', is_active: true };

  it('assembles series, ascending volume_series, last-10, 1RM, record, and a projection at ≥3 points', () => {
    const series = oneRmSeries([
      rec('2026-05-01', 80, 90),
      rec('2026-05-08', 82.5, 92),
      rec('2026-05-15', 85, 96),
    ]);
    const recentSessionVolumes = [
      { session_id: 3, date: '2026-05-15', top_weight_kg: 85, top_reps: 5, total_volume_kg: 1200 },
      { session_id: 1, date: '2026-05-01', top_weight_kg: 80, top_reps: 5, total_volume_kg: 1100 },
    ];
    const v = buildExerciseProgress({ exercise, series, recentSessionVolumes });

    expect(v.current_estimate_1rm_kg).toBe(96);
    expect(v.all_time_record_kg).toBe(85);
    expect(v.load_series).toHaveLength(3);
    expect(v.volume_series.map((p) => p.date)).toEqual(['2026-05-01', '2026-05-15']); // ascending
    expect(v.recent_sessions).toHaveLength(2);
    expect(v.projection).not.toBeNull();
    expect(v.projection.points).toHaveLength(8);
  });

  it('null projection and empty series when no history', () => {
    const v = buildExerciseProgress({ exercise, series: [], recentSessionVolumes: [] });
    expect(v.projection).toBeNull();
    expect(v.load_series).toEqual([]);
    expect(v.current_estimate_1rm_kg).toBeNull();
    expect(v.all_time_record_kg).toBeNull();
  });
});
