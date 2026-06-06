import { describe, it, expect } from 'vitest';
import { build } from '../../services/statistics/strengthTab.js';

// Phase 11 (014-phase11-statistics) — pure Strength-tab presenter. Composes top
// progressions (abs working-weight gain), weekly volume buckets (ISO weeks), and the
// progress-% radar. No clock/IO/globals.

describe('strengthTab.build', () => {
  const base = {
    names: new Map([
      [1, 'Squat'],
      [2, 'Bench'],
    ]),
    exerciseMuscleGroup: new Map([
      [1, 'Jambes'],
      [2, 'Pectoraux'],
    ]),
    muscleGroups: [
      { name: 'Jambes', display_color: '#0f0' },
      { name: 'Pectoraux', display_color: '#f00' },
    ],
    programStart: '2026-01-01',
    asOf: '2026-03-01',
    topN: 5,
  };

  it('ranks top progressions by absolute working-weight gain', () => {
    const records = [
      { exercise_id: 1, created_at: '2026-01-06T08:00:00.000Z', source_weight_kg: 80 },
      { exercise_id: 1, created_at: '2026-02-06T08:00:00.000Z', source_weight_kg: 110 }, // +30
      { exercise_id: 2, created_at: '2026-01-06T08:00:00.000Z', source_weight_kg: 50 },
      { exercise_id: 2, created_at: '2026-02-06T08:00:00.000Z', source_weight_kg: 60 }, // +10
    ];
    const out = build({ ...base, records, dailyVolumes: [] });
    expect(out.top_progressions.map((p) => p.exercise_id)).toEqual([1, 2]);
    expect(out.top_progressions[0].gain_kg).toBe(30);
    expect(out.top_progressions[0].name).toBe('Squat');
    expect(out.top_progressions[0].series).toHaveLength(2);
  });

  it('buckets daily volumes into ISO weeks ascending and rounds to 2dp', () => {
    const dailyVolumes = [
      // Mon 2026-01-05 and Wed 2026-01-07 -> week 2026-01-05
      { ended_at: '2026-01-05T18:00:00.000Z', total_volume_kg: 1000.5 },
      { ended_at: '2026-01-07T18:00:00.000Z', total_volume_kg: 500.25 },
      // Mon 2026-01-12 -> week 2026-01-12
      { ended_at: '2026-01-12T18:00:00.000Z', total_volume_kg: 2000 },
    ];
    const out = build({ ...base, records: [], dailyVolumes });
    expect(out.weekly_volume).toEqual([
      { week_start: '2026-01-05', volume_kg: 1500.75 },
      { week_start: '2026-01-12', volume_kg: 2000 },
    ]);
  });

  it('produces a radar with axes aligned to muscleGroups and progress % values', () => {
    const records = [
      { exercise_id: 1, created_at: '2026-01-06T08:00:00.000Z', source_weight_kg: 80 },
      { exercise_id: 1, created_at: '2026-02-06T08:00:00.000Z', source_weight_kg: 120 }, // +50%
      { exercise_id: 2, created_at: '2026-01-06T08:00:00.000Z', source_weight_kg: 50 },
      { exercise_id: 2, created_at: '2026-02-06T08:00:00.000Z', source_weight_kg: 50 }, // flat
    ];
    const out = build({ ...base, records, dailyVolumes: [] });
    expect(out.muscle_radar.axes).toEqual([
      { muscle_group: 'Jambes', color: '#0f0' },
      { muscle_group: 'Pectoraux', color: '#f00' },
    ]);
    expect(out.muscle_radar.values).toEqual([50, 0]);
  });

  it('cold-start: empty arrays and empty radar', () => {
    const out = build({ ...base, records: [], dailyVolumes: [] });
    expect(out.top_progressions).toEqual([]);
    expect(out.weekly_volume).toEqual([]);
    expect(out.muscle_radar.values).toEqual([0, 0]);
  });
});
